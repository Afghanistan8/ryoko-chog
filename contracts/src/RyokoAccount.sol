// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {IERC6551Account, IERC6551Executable} from "./interfaces/IERC6551.sol";

/// @title RyokoAccount
/// @notice ERC-6551 token-bound account for a Chog. The Chog's holder controls it fully.
///         The holder can also appoint an agent. The agent can only call the Ryoko journey
///         contract, with no value, so it can make the Chog travel and conquer swamps but
///         can never move the account's tokens anywhere else.
/// @dev Deployed once as an implementation; each Chog gets an ERC-1167 proxy from the
///      canonical ERC-6551 registry. The agent grant is tied to the holder that made it,
///      so it stops working the moment the Chog changes hands.
contract RyokoAccount is
    IERC165,
    IERC6551Account,
    IERC6551Executable,
    IERC1271,
    IERC721Receiver,
    IERC1155Receiver
{
    using SafeERC20 for IERC20;

    bytes4 internal constant ERC6551_VALID_SIGNER = IERC6551Account.isValidSigner.selector; // 0x523e3260
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;

    /// @notice The only contract the agent is allowed to call.
    address public immutable journey;

    uint256 private _state;
    address private _agent;
    address private _agentGrantedBy;

    event AgentSet(address indexed agent, address indexed grantedBy);

    error NotAuthorized();
    error UnsupportedOperation();
    error AgentTargetNotAllowed();
    error OwnershipCycle();
    error ZeroAddress();

    constructor(address journey_) {
        if (journey_ == address(0)) revert ZeroAddress();
        journey = journey_;
    }

    receive() external payable {}

    // ---------------------------------------------------------------------
    // ERC-6551
    // ---------------------------------------------------------------------

    /// @inheritdoc IERC6551Account
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        // A registry proxy is exactly 45 bytes of ERC-1167 code plus 128 bytes of data.
        // Anything else (such as the bare implementation) is not bound to a token.
        if (address(this).code.length != 0xad) return (0, address(0), 0);
        bytes memory footer = new bytes(0x60);
        assembly {
            // The registry appends salt, chainId, tokenContract, tokenId after the 45-byte
            // ERC-1167 proxy. Skip the proxy and the salt (0x2d + 0x20 = 0x4d).
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @inheritdoc IERC6551Account
    function state() external view returns (uint256) {
        return _state;
    }

    /// @inheritdoc IERC6551Account
    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        return signer != address(0) && signer == owner() ? ERC6551_VALID_SIGNER : bytes4(0);
    }

    /// @inheritdoc IERC6551Executable
    /// @dev Only plain calls (operation 0) are supported.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result)
    {
        if (operation != 0) revert UnsupportedOperation();

        address holder = owner();
        if (msg.sender != holder || holder == address(0)) {
            if (msg.sender != agent() || msg.sender == address(0)) revert NotAuthorized();
            if (to != journey || value != 0) revert AgentTargetNotAllowed();
        }

        ++_state;

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }

        // One-level ownership cycle guard: the account must never end up owning its own Chog.
        (, address tokenContract, uint256 tokenId) = token();
        if (_ownerOf(tokenContract, tokenId) == address(this)) revert OwnershipCycle();
    }

    // ---------------------------------------------------------------------
    // Ownership and agent
    // ---------------------------------------------------------------------

    /// @notice Current holder of the bound Chog, or zero if the token is on another chain or missing.
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return _ownerOf(tokenContract, tokenId);
    }

    /// @notice The active agent. Zero if none was set or the Chog changed hands since it was set.
    function agent() public view returns (address) {
        address grantedBy = _agentGrantedBy;
        if (grantedBy == address(0) || grantedBy != owner()) return address(0);
        return _agent;
    }

    /// @notice Holder only. Appoints (or with zero, removes) the agent and sets the journey
    ///         contract's allowance for `tokenToApprove`, so the agent can pay for ants.
    /// @param newAgent Agent address, or zero to remove the agent.
    /// @param tokenToApprove Token the journey contract may spend from this account. Zero skips approval.
    /// @param allowance Allowance to grant the journey contract. Zero revokes it.
    function authorize(address newAgent, IERC20 tokenToApprove, uint256 allowance) external {
        address holder = owner();
        if (msg.sender != holder || holder == address(0)) revert NotAuthorized();
        _setAgent(newAgent, holder);
        if (address(tokenToApprove) != address(0)) {
            tokenToApprove.forceApprove(journey, allowance);
        }
    }

    /// @notice Journey contract only, while the holder starts a journey in one transaction
    ///         (`RyokoJourney.begin`, which checks the caller holds the Chog). Appoints the agent
    ///         (zero for none) and lets the journey contract take ant payments in `token_`.
    /// @dev `holder` must still be this account's owner, so a stale holder can never set it up.
    function setupFromJourney(address holder, address newAgent, IERC20 token_) external {
        if (msg.sender != journey) revert NotAuthorized();
        if (holder == address(0) || holder != owner()) revert NotAuthorized();
        _setAgent(newAgent, holder);
        token_.forceApprove(journey, type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // ERC-1271
    // ---------------------------------------------------------------------

    /// @inheritdoc IERC1271
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        address holder = owner();
        if (holder != address(0) && SignatureChecker.isValidSignatureNow(holder, hash, signature)) {
            return IERC1271.isValidSignature.selector;
        }
        return ERC1271_INVALID;
    }

    // ---------------------------------------------------------------------
    // Receivers
    // ---------------------------------------------------------------------

    function onERC721Received(address, address, uint256 receivedId, bytes calldata)
        external
        view
        returns (bytes4)
    {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId == block.chainid && msg.sender == tokenContract && receivedId == tokenId) {
            revert OwnershipCycle();
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId || interfaceId == type(IERC1271).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _setAgent(address newAgent, address holder) internal {
        ++_state;
        _agent = newAgent;
        _agentGrantedBy = newAgent == address(0) ? address(0) : holder;
        emit AgentSet(newAgent, holder);
    }

    /// @dev ownerOf that returns zero instead of reverting (missing token, non-contract, bad return data).
    function _ownerOf(address tokenContract, uint256 tokenId) internal view returns (address holder) {
        if (tokenContract.code.length == 0) return address(0);
        (bool ok, bytes memory ret) = tokenContract.staticcall(abi.encodeCall(IERC721.ownerOf, (tokenId)));
        if (!ok || ret.length != 32) return address(0);
        uint256 word = abi.decode(ret, (uint256));
        if (word > type(uint160).max) return address(0);
        // forge-lint: disable-next-line(unsafe-typecast) -- word is checked to fit in 160 bits above
        holder = address(uint160(word));
    }
}
