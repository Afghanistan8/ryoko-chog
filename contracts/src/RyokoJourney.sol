// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IERC6551Registry, IERC6551Account} from "./interfaces/IERC6551.sol";
import {RyokoAccount} from "./RyokoAccount.sol";

/// @title RyokoJourney
/// @notice A Chog travels through nine swamps, one at a time.
///         Each swamp is a leg with a deadline of `legDuration` (9 days on mainnet):
///         1. Travel: the Chog eats one ant. The ant is `antPrice` $CHOG, paid from the Chog's
///            own ERC-6551 account and sent to the burn address.
///         2. Stay at least `minStay` (2 days on mainnet) in the swamp.
///         3. Conquer: post a short field note. The next leg starts immediately.
///         If the deadline passes before the swamp is conquered, the swamp restarts: a new
///         ant must be eaten to enter it again. Earlier swamps stay conquered.
///         If the Chog changes hands, its journey is void and the new holder starts from swamp 1.
/// @dev Travel and conquer must be called by the Chog's own RyokoAccount (the holder or the
///      holder's agent acting through it). Journey state never holds funds.
contract RyokoJourney is Ownable2Step {
    using SafeERC20 for IERC20;

    uint8 public constant SWAMPS = 9;
    uint256 public constant MAX_NOTE_BYTES = 140;
    uint256 public constant MIN_NAME_BYTES = 3;
    uint256 public constant MAX_NAME_BYTES = 16;
    bytes32 public constant ACCOUNT_SALT = bytes32(0);
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    enum Status {
        None, // no journey, or the Chog changed hands
        Travelling, // leg running, ant not eaten yet
        InSwamp, // ant eaten, minimum stay not reached
        Ready, // minimum stay reached, can conquer before the deadline
        Expired, // deadline passed before conquering; travelling again restarts the swamp
        Complete // all nine swamps conquered
    }

    enum ResetReason {
        HolderChanged,
        TransferReported
    }

    struct Journey {
        uint64 id;
        address holder;
        uint8 conquered;
        bool fed;
        uint64 startedAt;
        uint64 legStartedAt;
        uint64 enteredAt;
        uint64 completedAt;
        uint32 ants;
        uint32 restarts;
        uint128 burned;
    }

    struct NameRecord {
        string name;
        address holder;
    }

    struct JourneyView {
        uint256 tokenId;
        address holder;
        address account;
        address agent;
        Status status;
        uint8 conquered;
        uint8 currentSwamp;
        uint64 journeyId;
        uint64 startedAt;
        uint64 legStartedAt;
        uint64 enteredAt;
        uint64 readyAt;
        uint64 deadline;
        uint64 completedAt;
        uint32 ants;
        uint32 restarts;
        uint128 burned;
        string name;
    }

    IERC721 public immutable chog;
    IERC20 public immutable chogToken;
    IERC6551Registry public immutable registry;
    address public immutable accountImplementation;
    uint64 public immutable minStay;
    uint64 public immutable legDuration;

    uint256 public antPrice;
    address public resetter;
    uint64 public journeyCount;

    mapping(uint256 tokenId => Journey) private _journeys;
    mapping(uint64 journeyId => mapping(uint8 swamp => string)) private _notes;
    mapping(uint256 tokenId => NameRecord) private _names;
    /// @dev Lower-cased name hash => tokenId + 1.
    mapping(bytes32 nameKey => uint256 tokenIdPlusOne) private _nameOwner;

    event JourneyStarted(uint256 indexed tokenId, uint64 indexed journeyId, address indexed holder, address account);
    event AntEaten(uint256 indexed tokenId, uint64 indexed journeyId, uint8 swamp, uint256 price);
    event SwampEntered(uint256 indexed tokenId, uint64 indexed journeyId, uint8 swamp, uint64 enteredAt);
    event SwampRestarted(uint256 indexed tokenId, uint64 indexed journeyId, uint8 swamp, uint32 restarts);
    event SwampConquered(uint256 indexed tokenId, uint64 indexed journeyId, uint8 swamp, string note);
    event JourneyCompleted(uint256 indexed tokenId, uint64 indexed journeyId, uint64 completedAt);
    event JourneyReset(uint256 indexed tokenId, uint64 indexed journeyId, ResetReason reason);
    event NameSet(uint256 indexed tokenId, address indexed holder, string name);
    event AntPriceUpdated(uint256 price);
    event ResetterUpdated(address resetter);

    error ZeroAddress();
    error InvalidConfig();
    error NotHolder();
    error JourneyExists();
    error NoActiveJourney();
    error NotRyokoAccount();
    error AlreadyInSwamp();
    error NotInSwamp();
    error TooLateToEnter(uint64 deadline);
    error StayTooShort(uint64 readyAt);
    error LegExpired(uint64 deadline);
    error InvalidNote();
    error InvalidName();
    error NameTaken();
    error NothingToReset();
    error NotResetter();

    constructor(
        IERC721 chog_,
        IERC20 chogToken_,
        IERC6551Registry registry_,
        address accountImplementation_,
        uint256 antPrice_,
        uint64 minStay_,
        uint64 legDuration_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(chog_) == address(0) || address(chogToken_) == address(0) || address(registry_) == address(0)
                || accountImplementation_ == address(0)
        ) revert ZeroAddress();
        if (antPrice_ == 0 || antPrice_ > type(uint128).max || minStay_ == 0 || minStay_ >= legDuration_) {
            revert InvalidConfig();
        }
        if (RyokoAccount(payable(accountImplementation_)).journey() != address(this)) revert InvalidConfig();

        chog = chog_;
        chogToken = chogToken_;
        registry = registry_;
        accountImplementation = accountImplementation_;
        antPrice = antPrice_;
        minStay = minStay_;
        legDuration = legDuration_;
        emit AntPriceUpdated(antPrice_);
    }

    // ---------------------------------------------------------------------
    // Journey
    // ---------------------------------------------------------------------

    /// @notice Holder starts a journey for their Chog. Creates the Chog's account if needed.
    ///         A holder cannot restart an unfinished or finished journey of their own; a new
    ///         holder always starts fresh.
    function startJourney(uint256 tokenId) external returns (address account) {
        address holder = chog.ownerOf(tokenId);
        if (msg.sender != holder) revert NotHolder();

        Journey storage j = _journeys[tokenId];
        if (j.id != 0 && j.holder == holder) revert JourneyExists();

        uint64 id = ++journeyCount;
        // forge-lint: disable-next-line(unsafe-typecast) -- unix seconds fit in uint64
        uint64 nowTs = uint64(block.timestamp);
        _journeys[tokenId] = Journey({
            id: id,
            holder: holder,
            conquered: 0,
            fed: false,
            startedAt: nowTs,
            legStartedAt: nowTs,
            enteredAt: 0,
            completedAt: 0,
            ants: 0,
            restarts: 0,
            burned: 0
        });

        account = registry.createAccount(accountImplementation, ACCOUNT_SALT, block.chainid, address(chog), tokenId);
        emit JourneyStarted(tokenId, id, holder, account);
    }

    /// @notice Called by the Chog's own account: eat one ant and enter the next swamp.
    ///         If the current leg has expired, the swamp restarts first.
    function travel() external {
        uint256 tokenId = _callerTokenId();
        Journey storage j = _activeJourney(tokenId);
        // forge-lint: disable-next-line(unsafe-typecast) -- unix seconds fit in uint64
        uint64 nowTs = uint64(block.timestamp);
        uint8 swamp = j.conquered + 1;

        if (nowTs > j.legStartedAt + legDuration) {
            j.legStartedAt = nowTs;
            j.fed = false;
            j.restarts += 1;
            emit SwampRestarted(tokenId, j.id, swamp, j.restarts);
        }
        if (j.fed) revert AlreadyInSwamp();
        uint64 deadline = j.legStartedAt + legDuration;
        if (nowTs + minStay > deadline) revert TooLateToEnter(deadline);

        uint256 price = antPrice;
        j.fed = true;
        j.enteredAt = nowTs;
        j.ants += 1;
        // forge-lint: disable-next-line(unsafe-typecast) -- antPrice is capped at type(uint128).max
        j.burned += uint128(price);

        emit AntEaten(tokenId, j.id, swamp, price);
        emit SwampEntered(tokenId, j.id, swamp, nowTs);

        chogToken.safeTransferFrom(msg.sender, BURN_ADDRESS, price);
    }

    /// @notice Called by the Chog's own account: conquer the current swamp with a field note.
    function conquer(string calldata note) external {
        uint256 tokenId = _callerTokenId();
        Journey storage j = _activeJourney(tokenId);
        // forge-lint: disable-next-line(unsafe-typecast) -- unix seconds fit in uint64
        uint64 nowTs = uint64(block.timestamp);

        if (!j.fed) revert NotInSwamp();
        uint64 deadline = j.legStartedAt + legDuration;
        if (nowTs > deadline) revert LegExpired(deadline);
        uint64 readyAt = j.enteredAt + minStay;
        if (nowTs < readyAt) revert StayTooShort(readyAt);
        uint256 len = bytes(note).length;
        if (len == 0 || len > MAX_NOTE_BYTES) revert InvalidNote();

        uint8 swamp = j.conquered + 1;
        j.conquered = swamp;
        j.fed = false;
        j.legStartedAt = nowTs;
        _notes[j.id][swamp] = note;
        emit SwampConquered(tokenId, j.id, swamp, note);

        if (swamp == SWAMPS) {
            j.completedAt = nowTs;
            emit JourneyCompleted(tokenId, j.id, nowTs);
        }
    }

    /// @notice Anyone can clear the record of a journey whose Chog changed hands.
    ///         Such journeys are already treated as void everywhere; this tidies storage and emits an event.
    function voidJourney(uint256 tokenId) external {
        Journey storage j = _journeys[tokenId];
        if (j.id == 0 || j.holder == _holderOf(tokenId)) revert NothingToReset();
        uint64 id = j.id;
        delete _journeys[tokenId];
        emit JourneyReset(tokenId, id, ResetReason.HolderChanged);
    }

    /// @notice Resetter only. Resets a journey after a transfer the contract cannot see on its own,
    ///         such as a Chog sent away and back to the same wallet. Also clears the name.
    function reportTransfer(uint256 tokenId) external {
        if (msg.sender != resetter || msg.sender == address(0)) revert NotResetter();
        Journey storage j = _journeys[tokenId];
        if (j.id == 0) revert NothingToReset();
        uint64 id = j.id;
        delete _journeys[tokenId];
        _clearName(tokenId);
        emit JourneyReset(tokenId, id, ResetReason.TransferReported);
    }

    // ---------------------------------------------------------------------
    // Names
    // ---------------------------------------------------------------------

    /// @notice Holder registers a unique name (3-16 letters, digits, single spaces) for their Chog.
    ///         Names are unique ignoring case. A name stops counting once the Chog changes hands.
    function setName(uint256 tokenId, string calldata name) external {
        address holder = chog.ownerOf(tokenId);
        if (msg.sender != holder) revert NotHolder();
        bytes32 key = _nameKey(name);

        uint256 current = _nameOwner[key];
        if (current != 0 && current - 1 != tokenId) {
            uint256 otherId = current - 1;
            if (_nameIsLive(otherId)) revert NameTaken();
            delete _names[otherId];
        }

        _clearName(tokenId);
        _names[tokenId] = NameRecord({name: name, holder: holder});
        _nameOwner[key] = tokenId + 1;
        emit NameSet(tokenId, holder, name);
    }

    /// @notice The Chog's name, or an empty string if none or the Chog changed hands.
    function nameOf(uint256 tokenId) public view returns (string memory) {
        return _nameIsLive(tokenId) ? _names[tokenId].name : "";
    }

    /// @notice Whether `name` is valid and free for `tokenId` to take.
    function isNameAvailable(string calldata name, uint256 tokenId) external view returns (bool) {
        (bool valid, bytes32 key) = _tryNameKey(name);
        if (!valid) return false;
        uint256 current = _nameOwner[key];
        return current == 0 || current - 1 == tokenId || !_nameIsLive(current - 1);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The Chog's ERC-6551 account address (deployed or not).
    function accountOf(uint256 tokenId) public view returns (address) {
        return registry.account(accountImplementation, ACCOUNT_SALT, block.chainid, address(chog), tokenId);
    }

    function statusOf(uint256 tokenId) public view returns (Status) {
        Journey storage j = _journeys[tokenId];
        if (j.id == 0 || j.holder != _holderOf(tokenId)) return Status.None;
        if (j.completedAt != 0) return Status.Complete;
        if (block.timestamp > uint256(j.legStartedAt) + legDuration) return Status.Expired;
        if (!j.fed) return Status.Travelling;
        if (block.timestamp < uint256(j.enteredAt) + minStay) return Status.InSwamp;
        return Status.Ready;
    }

    /// @notice Full view of one Chog's journey. Void journeys come back zeroed with status None.
    function getJourney(uint256 tokenId) public view returns (JourneyView memory v) {
        address holder = _holderOf(tokenId);
        address account = accountOf(tokenId);
        v.tokenId = tokenId;
        v.holder = holder;
        v.account = account;
        v.agent = _agentOf(account);
        v.name = nameOf(tokenId);
        v.status = statusOf(tokenId);
        if (v.status == Status.None) return v;

        Journey storage j = _journeys[tokenId];
        v.conquered = j.conquered;
        v.currentSwamp = j.conquered == SWAMPS ? SWAMPS : j.conquered + 1;
        v.journeyId = j.id;
        v.startedAt = j.startedAt;
        v.legStartedAt = j.legStartedAt;
        v.enteredAt = j.enteredAt;
        v.readyAt = j.fed ? j.enteredAt + minStay : 0;
        v.deadline = j.completedAt == 0 ? j.legStartedAt + legDuration : 0;
        v.completedAt = j.completedAt;
        v.ants = j.ants;
        v.restarts = j.restarts;
        v.burned = j.burned;
    }

    /// @notice Batch view for leaderboards and wallet pages. Keep batches around 100 ids.
    function getJourneys(uint256[] calldata tokenIds) external view returns (JourneyView[] memory views) {
        views = new JourneyView[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; ++i) {
            views[i] = getJourney(tokenIds[i]);
        }
    }

    /// @notice Field notes of the Chog's current journey, index 0 = swamp 1.
    function notesOf(uint256 tokenId) external view returns (string[9] memory notes) {
        Journey storage j = _journeys[tokenId];
        if (j.id == 0 || j.holder != _holderOf(tokenId)) return notes;
        for (uint8 s = 1; s <= SWAMPS; ++s) {
            notes[s - 1] = _notes[j.id][s];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setAntPrice(uint256 price) external onlyOwner {
        if (price == 0 || price > type(uint128).max) revert InvalidConfig();
        antPrice = price;
        emit AntPriceUpdated(price);
    }

    function setResetter(address newResetter) external onlyOwner {
        resetter = newResetter;
        emit ResetterUpdated(newResetter);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev The caller must be the registry-derived RyokoAccount of a Chog on this chain.
    function _callerTokenId() internal view returns (uint256 tokenId) {
        (bool ok, bytes memory ret) = msg.sender.staticcall(abi.encodeCall(IERC6551Account.token, ()));
        if (!ok || ret.length != 96) revert NotRyokoAccount();
        (uint256 chainId, address tokenContract, uint256 id) = abi.decode(ret, (uint256, address, uint256));
        if (chainId != block.chainid || tokenContract != address(chog)) revert NotRyokoAccount();
        if (accountOf(id) != msg.sender) revert NotRyokoAccount();
        return id;
    }

    function _activeJourney(uint256 tokenId) internal view returns (Journey storage j) {
        j = _journeys[tokenId];
        if (j.id == 0 || j.completedAt != 0 || j.holder != _holderOf(tokenId)) revert NoActiveJourney();
    }

    function _holderOf(uint256 tokenId) internal view returns (address holder) {
        (bool ok, bytes memory ret) = address(chog).staticcall(abi.encodeCall(IERC721.ownerOf, (tokenId)));
        if (!ok || ret.length != 32) return address(0);
        uint256 word = abi.decode(ret, (uint256));
        if (word > type(uint160).max) return address(0);
        // forge-lint: disable-next-line(unsafe-typecast) -- word is checked to fit in 160 bits above
        holder = address(uint160(word));
    }

    function _agentOf(address account) internal view returns (address) {
        if (account.code.length == 0) return address(0);
        (bool ok, bytes memory ret) = account.staticcall(abi.encodeCall(RyokoAccount.agent, ()));
        if (!ok || ret.length != 32) return address(0);
        uint256 word = abi.decode(ret, (uint256));
        if (word > type(uint160).max) return address(0);
        // forge-lint: disable-next-line(unsafe-typecast) -- word is checked to fit in 160 bits above
        return address(uint160(word));
    }

    function _nameIsLive(uint256 tokenId) internal view returns (bool) {
        address recorded = _names[tokenId].holder;
        return recorded != address(0) && recorded == _holderOf(tokenId);
    }

    function _clearName(uint256 tokenId) internal {
        NameRecord storage rec = _names[tokenId];
        if (bytes(rec.name).length == 0) return;
        (, bytes32 oldKey) = _tryNameKey(rec.name);
        if (_nameOwner[oldKey] == tokenId + 1) delete _nameOwner[oldKey];
        delete _names[tokenId];
    }

    function _nameKey(string calldata name) internal pure returns (bytes32 key) {
        bool valid;
        (valid, key) = _tryNameKey(name);
        if (!valid) revert InvalidName();
    }

    /// @dev Valid: 3-16 bytes of [A-Za-z0-9 ], no leading, trailing or double spaces.
    ///      Key: keccak256 of the lower-cased name.
    function _tryNameKey(string memory name) internal pure returns (bool valid, bytes32 key) {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < MIN_NAME_BYTES || len > MAX_NAME_BYTES) return (false, 0);
        bytes memory lower = new bytes(len);
        for (uint256 i; i < len; ++i) {
            bytes1 c = b[i];
            if (c == 0x20) {
                if (i == 0 || i == len - 1 || b[i - 1] == 0x20) return (false, 0);
                lower[i] = c;
            } else if (c >= 0x30 && c <= 0x39) {
                lower[i] = c;
            } else if (c >= 0x61 && c <= 0x7a) {
                lower[i] = c;
            } else if (c >= 0x41 && c <= 0x5a) {
                lower[i] = bytes1(uint8(c) + 32);
            } else {
                return (false, 0);
            }
        }
        return (true, keccak256(lower));
    }
}
