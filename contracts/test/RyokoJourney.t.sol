// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {RyokoBase} from "./utils/RyokoBase.sol";
import {RyokoAccount} from "../src/RyokoAccount.sol";
import {RyokoJourney} from "../src/RyokoJourney.sol";
import {IERC6551Registry} from "../src/interfaces/IERC6551.sol";

/// @dev A contract that pretends to be alice's account by returning the same token() data.
contract FakeAccount {
    uint256 internal immutable _chainId;
    address internal immutable _tokenContract;
    uint256 internal immutable _tokenId;

    constructor(address tokenContract_, uint256 tokenId_) {
        _chainId = block.chainid;
        _tokenContract = tokenContract_;
        _tokenId = tokenId_;
    }

    function token() external view returns (uint256, address, uint256) {
        return (_chainId, _tokenContract, _tokenId);
    }

    function travel(RyokoJourney journey) external {
        journey.travel();
    }
}

contract RyokoJourneyTest is RyokoBase {
    // ------------------------------------------------------------------
    // Deployment
    // ------------------------------------------------------------------

    function test_Constructor_StoresConfig() public view {
        assertEq(address(journey.chog()), address(chog));
        assertEq(address(journey.chogToken()), address(token));
        assertEq(address(journey.registry()), REGISTRY);
        assertEq(journey.accountImplementation(), address(impl));
        assertEq(journey.antPrice(), PRICE);
        assertEq(journey.minStay(), MIN_STAY);
        assertEq(journey.legDuration(), LEG);
        assertEq(journey.owner(), admin);
        assertEq(journey.resetter(), resetterBot);
    }

    function test_Constructor_RejectsImplementationBoundElsewhere() public {
        RyokoAccount other = new RyokoAccount(address(0xBEEF));
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        new RyokoJourney(
            chog, IERC20(address(token)), IERC6551Registry(REGISTRY), address(other), PRICE, MIN_STAY, LEG, admin
        );
    }

    function test_Constructor_RejectsBadTiming() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        RyokoAccount a = new RyokoAccount(predicted);
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        new RyokoJourney(chog, IERC20(address(token)), IERC6551Registry(REGISTRY), address(a), PRICE, LEG, LEG, admin);
    }

    function test_Constructor_RejectsZeroPrice() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        RyokoAccount a = new RyokoAccount(predicted);
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        new RyokoJourney(chog, IERC20(address(token)), IERC6551Registry(REGISTRY), address(a), 0, MIN_STAY, LEG, admin);
    }

    // ------------------------------------------------------------------
    // Start
    // ------------------------------------------------------------------

    function test_Start_CreatesCanonicalAccount() public {
        address expected = IERC6551Registry(REGISTRY).account(
            address(impl), bytes32(0), block.chainid, address(chog), aliceChog
        );
        vm.expectEmit(true, true, true, true, address(journey));
        emit RyokoJourney.JourneyStarted(aliceChog, 1, alice, expected);
        RyokoAccount account = _start(alice, aliceChog);

        assertEq(address(account), expected);
        assertEq(journey.accountOf(aliceChog), expected);
        assertGt(address(account).code.length, 0);
        (uint256 chainId, address tokenContract, uint256 tokenId) = account.token();
        assertEq(chainId, block.chainid);
        assertEq(tokenContract, address(chog));
        assertEq(tokenId, aliceChog);
        assertEq(account.owner(), alice);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Travelling));
    }

    function test_Start_WorksWhenAccountAlreadyExists() public {
        IERC6551Registry(REGISTRY).createAccount(address(impl), bytes32(0), block.chainid, address(chog), aliceChog);
        RyokoAccount account = _start(alice, aliceChog);
        assertEq(address(account), journey.accountOf(aliceChog));
    }

    function test_Start_RevertsForNonHolder() public {
        vm.prank(bob);
        vm.expectRevert(RyokoJourney.NotHolder.selector);
        journey.startJourney(aliceChog);
    }

    function test_Start_RevertsWhenAlreadyStarted() public {
        _start(alice, aliceChog);
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.JourneyExists.selector);
        journey.startJourney(aliceChog);
    }

    // ------------------------------------------------------------------
    // The full journey
    // ------------------------------------------------------------------

    function test_FullJourney_NineSwamps() public {
        RyokoAccount account = _ready(9);
        uint256 deadBefore = token.balanceOf(DEAD);

        for (uint8 s = 1; s <= 9; ++s) {
            vm.expectEmit(true, true, false, true, address(journey));
            emit RyokoJourney.AntEaten(aliceChog, 1, s, PRICE);
            _agentTravel(account);
            assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.InSwamp));

            vm.warp(block.timestamp + MIN_STAY);
            assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Ready));

            string memory note = string.concat("Swamp ", vm.toString(s), " conquered.");
            vm.expectEmit(true, true, false, true, address(journey));
            emit RyokoJourney.SwampConquered(aliceChog, 1, s, note);
            _agentConquer(account, note);
        }

        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(uint8(v.status), uint8(RyokoJourney.Status.Complete));
        assertEq(v.conquered, 9);
        assertEq(v.currentSwamp, 9);
        assertEq(v.ants, 9);
        assertEq(v.burned, PRICE * 9);
        assertEq(v.completedAt, block.timestamp);
        assertEq(v.deadline, 0);
        assertEq(token.balanceOf(DEAD) - deadBefore, PRICE * 9, "burned to dead address");
        assertEq(token.balanceOf(address(account)), 0);

        string[9] memory notes = journey.notesOf(aliceChog);
        assertEq(notes[0], "Swamp 1 conquered.");
        assertEq(notes[8], "Swamp 9 conquered.");

        vm.prank(agentBot);
        vm.expectRevert(RyokoJourney.NoActiveJourney.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);

        vm.prank(alice);
        vm.expectRevert(RyokoJourney.JourneyExists.selector);
        journey.startJourney(aliceChog);
    }

    function test_HolderCanActWithoutAgent() public {
        RyokoAccount account = _start(alice, aliceChog);
        _fund(account, 1);
        _pinEvent(aliceChog, RyokoJourney.SwampEvent.Calm);
        vm.startPrank(alice);
        account.authorize(address(0), IERC20(address(token)), PRICE);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
        vm.warp(block.timestamp + MIN_STAY);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("Did it myself.")), 0);
        vm.stopPrank();
        assertEq(journey.getJourney(aliceChog).conquered, 1);
    }

    // ------------------------------------------------------------------
    // Timing rules
    // ------------------------------------------------------------------

    function test_Conquer_RevertsBeforeMinimumStay() public {
        RyokoAccount account = _ready(1);
        _agentTravel(account);
        uint64 readyAt = uint64(block.timestamp) + MIN_STAY;
        vm.warp(block.timestamp + MIN_STAY - 1);
        vm.prank(agentBot);
        vm.expectRevert(abi.encodeWithSelector(RyokoJourney.StayTooShort.selector, readyAt));
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("too soon")), 0);
    }

    function test_Conquer_RevertsWithoutEatingFirst() public {
        RyokoAccount account = _ready(1);
        vm.prank(agentBot);
        vm.expectRevert(RyokoJourney.NotInSwamp.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("hungry")), 0);
    }

    function test_Travel_RevertsWhenAlreadyInSwamp() public {
        RyokoAccount account = _ready(2);
        _agentTravel(account);
        vm.prank(agentBot);
        vm.expectRevert(RyokoJourney.AlreadyInSwamp.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    function test_Travel_RevertsWhenTooLateToStay() public {
        RyokoAccount account = _ready(1);
        uint64 deadline = uint64(block.timestamp) + LEG;
        // Entering needs room for the longest stay (fog), not just the minimum stay.
        vm.warp(block.timestamp + LEG - journey.maxStay() + 1);
        vm.prank(agentBot);
        vm.expectRevert(abi.encodeWithSelector(RyokoJourney.TooLateToEnter.selector, deadline));
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    function test_Conquer_AllowedExactlyAtDeadline() public {
        RyokoAccount account = _ready(1);
        uint64 deadline = uint64(block.timestamp) + LEG;
        vm.warp(block.timestamp + LEG - journey.maxStay());
        _agentTravelWith(account, RyokoJourney.SwampEvent.Fog);
        assertEq(journey.getJourney(aliceChog).readyAt, deadline, "longest stay ends exactly at the deadline");
        vm.warp(deadline);
        _agentConquer(account, "Just in time.");
        assertEq(journey.getJourney(aliceChog).conquered, 1);
    }

    function test_ExpiredLeg_RestartsSameSwamp() public {
        RyokoAccount account = _ready(2);
        _agentTravel(account);
        uint64 deadline = uint64(block.timestamp) + LEG;
        vm.warp(block.timestamp + LEG + 1);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Expired));

        vm.prank(agentBot);
        vm.expectRevert(abi.encodeWithSelector(RyokoJourney.LegExpired.selector, deadline));
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("late")), 0);

        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.SwampRestarted(aliceChog, 1, 1, 1);
        _agentTravel(account);

        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(v.conquered, 0, "earlier progress kept, swamp 1 not conquered");
        assertEq(v.currentSwamp, 1);
        assertEq(v.restarts, 1);
        assertEq(v.ants, 2);
        assertEq(v.burned, PRICE * 2);
        assertEq(v.legStartedAt, block.timestamp);
        assertEq(uint8(v.status), uint8(RyokoJourney.Status.InSwamp));
    }

    function test_ExpiredLeg_KeepsEarlierSwamps() public {
        RyokoAccount account = _ready(3);
        _agentTravel(account);
        vm.warp(block.timestamp + MIN_STAY);
        _agentConquer(account, "One down.");
        vm.warp(block.timestamp + LEG + 1);
        _agentTravel(account);
        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(v.conquered, 1);
        assertEq(v.currentSwamp, 2);
        assertEq(v.restarts, 1);
    }

    function test_HungryChog_CannotTravelAndExpires() public {
        RyokoAccount account = _start(alice, aliceChog);
        _authorize(alice, account);
        _pinEvent(aliceChog, RyokoJourney.SwampEvent.Calm);
        vm.prank(agentBot);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(account), 0, PRICE)
        );
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
        vm.warp(block.timestamp + LEG + 1);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Expired));
    }

    function test_Travel_UsesCurrentAntPrice() public {
        RyokoAccount account = _ready(3);
        vm.prank(admin);
        journey.setAntPrice(PRICE * 2);
        _agentTravel(account);
        assertEq(journey.getJourney(aliceChog).burned, PRICE * 2);
        assertEq(token.balanceOf(address(account)), PRICE);
    }

    // ------------------------------------------------------------------
    // Caller checks
    // ------------------------------------------------------------------

    function test_Travel_RevertsForEOA() public {
        _ready(1);
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.NotRyokoAccount.selector);
        journey.travel();
    }

    function test_Travel_RevertsForImpostorAccount() public {
        _ready(1);
        FakeAccount fake = new FakeAccount(address(chog), aliceChog);
        vm.expectRevert(RyokoJourney.NotRyokoAccount.selector);
        fake.travel(journey);
    }

    function test_Travel_RevertsWithoutJourney() public {
        RyokoAccount account = RyokoAccount(
            payable(IERC6551Registry(REGISTRY).createAccount(
                    address(impl), bytes32(0), block.chainid, address(chog), aliceChog
                ))
        );
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.NoActiveJourney.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    // ------------------------------------------------------------------
    // Notes
    // ------------------------------------------------------------------

    function test_Conquer_NoteLengthBounds() public {
        RyokoAccount account = _ready(1);
        _agentTravel(account);
        vm.warp(block.timestamp + MIN_STAY);

        vm.prank(agentBot);
        vm.expectRevert(RyokoJourney.InvalidNote.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("")), 0);

        string memory tooLong = string(new bytes(141));
        vm.prank(agentBot);
        vm.expectRevert(RyokoJourney.InvalidNote.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, (tooLong)), 0);

        string memory maxLen = string(_repeat("a", 140));
        _agentConquer(account, maxLen);
        assertEq(journey.notesOf(aliceChog)[0], maxLen);
    }

    // ------------------------------------------------------------------
    // Transfers
    // ------------------------------------------------------------------

    function test_Transfer_VoidsJourneyAndAgent() public {
        RyokoAccount account = _ready(2);
        _agentTravel(account);
        vm.warp(block.timestamp + MIN_STAY);
        _agentConquer(account, "Mine.");

        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);

        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.None));
        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(v.holder, bob);
        assertEq(v.conquered, 0);
        assertEq(v.agent, address(0));
        assertEq(account.agent(), address(0));
        assertEq(journey.notesOf(aliceChog)[0], "");

        vm.prank(agentBot);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);

        // New holder starts from swamp 1 with a fresh journey id.
        _start(bob, aliceChog);
        v = journey.getJourney(aliceChog);
        assertEq(v.journeyId, 2);
        assertEq(v.conquered, 0);
        assertEq(v.ants, 0);
        assertEq(uint8(v.status), uint8(RyokoJourney.Status.Travelling));
    }

    function test_Transfer_BackToSameHolderStillVoidWithoutRestart() public {
        _ready(1);
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        journey.voidJourney(aliceChog);
        vm.prank(bob);
        chog.transferFrom(bob, alice, aliceChog);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.None));
        RyokoAccount account = _start(alice, aliceChog);
        assertEq(journey.getJourney(aliceChog).journeyId, 2);
        assertEq(address(account), journey.accountOf(aliceChog));
    }

    function test_VoidJourney_RevertsWhenHolderUnchanged() public {
        _start(alice, aliceChog);
        vm.expectRevert(RyokoJourney.NothingToReset.selector);
        journey.voidJourney(aliceChog);
    }

    function test_ReportTransfer_ResetsJourneyAndName() public {
        RyokoAccount account = _ready(1);
        vm.prank(alice);
        journey.setName(aliceChog, "Gnarlo");
        _agentTravel(account);

        vm.prank(bob);
        vm.expectRevert(RyokoJourney.NotResetter.selector);
        journey.reportTransfer(aliceChog);

        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.JourneyReset(aliceChog, 1, RyokoJourney.ResetReason.TransferReported);
        vm.prank(resetterBot);
        journey.reportTransfer(aliceChog);

        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.None));
        assertEq(journey.nameOf(aliceChog), "");
        assertTrue(journey.isNameAvailable("Gnarlo", 999));
        _start(alice, aliceChog);
        assertEq(journey.getJourney(aliceChog).journeyId, 2);
    }

    function test_ReportTransfer_DisabledWhenResetterUnset() public {
        _start(alice, aliceChog);
        vm.prank(admin);
        journey.setResetter(address(0));
        vm.prank(address(0));
        vm.expectRevert(RyokoJourney.NotResetter.selector);
        journey.reportTransfer(aliceChog);
    }

    // ------------------------------------------------------------------
    // Names
    // ------------------------------------------------------------------

    function test_SetName_StoresAndEmits() public {
        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.NameSet(aliceChog, alice, "Sir Squelch 2");
        vm.prank(alice);
        journey.setName(aliceChog, "Sir Squelch 2");
        assertEq(journey.nameOf(aliceChog), "Sir Squelch 2");
        assertEq(journey.getJourney(aliceChog).name, "Sir Squelch 2");
    }

    function test_SetName_OnlyHolder() public {
        vm.prank(bob);
        vm.expectRevert(RyokoJourney.NotHolder.selector);
        journey.setName(aliceChog, "Gnarlo");
    }

    function test_SetName_RejectsInvalid() public {
        string[9] memory bad = ["ab", "seventeen chars x", " Lead", "Trail ", "Two  spaces", "Bad-dash", "Emoji\xF0\x9F\x90\xB8", "under_score", ""];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(RyokoJourney.InvalidName.selector);
            journey.setName(aliceChog, bad[i]);
            assertFalse(journey.isNameAvailable(bad[i], aliceChog));
        }
    }

    function test_SetName_UniqueIgnoringCase() public {
        vm.prank(alice);
        journey.setName(aliceChog, "Gnarlo");
        vm.prank(bob);
        uint256 bobChog = chog.mint();

        assertFalse(journey.isNameAvailable("gNARLO", bobChog));
        vm.prank(bob);
        vm.expectRevert(RyokoJourney.NameTaken.selector);
        journey.setName(bobChog, "gNARLO");
    }

    function test_SetName_RenameFreesOldName() public {
        vm.startPrank(alice);
        journey.setName(aliceChog, "Gnarlo");
        journey.setName(aliceChog, "Bogwhisper");
        vm.stopPrank();
        assertEq(journey.nameOf(aliceChog), "Bogwhisper");
        assertTrue(journey.isNameAvailable("Gnarlo", 2));
    }

    function test_SetName_SameTokenCanChangeCase() public {
        vm.startPrank(alice);
        journey.setName(aliceChog, "Gnarlo");
        journey.setName(aliceChog, "GNARLO");
        vm.stopPrank();
        assertEq(journey.nameOf(aliceChog), "GNARLO");
    }

    function test_SetName_ClearsOnTransferAndCanBeReclaimed() public {
        vm.prank(alice);
        journey.setName(aliceChog, "Gnarlo");
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        assertEq(journey.nameOf(aliceChog), "");

        vm.prank(alice);
        uint256 newChog = chog.mint();
        assertTrue(journey.isNameAvailable("Gnarlo", newChog));
        vm.prank(alice);
        journey.setName(newChog, "Gnarlo");
        assertEq(journey.nameOf(newChog), "Gnarlo");
        assertEq(journey.nameOf(aliceChog), "");
    }

    function testFuzz_SetName_ValidAlphanumeric(uint256 seed, uint8 rawLen) public {
        uint256 len = bound(rawLen, 3, 16);
        bytes memory charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        bytes memory b = new bytes(len);
        for (uint256 i; i < len; ++i) {
            b[i] = charset[uint256(keccak256(abi.encode(seed, i))) % charset.length];
        }
        vm.prank(alice);
        journey.setName(aliceChog, string(b));
        assertEq(journey.nameOf(aliceChog), string(b));
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function test_GetJourneys_Batch() public {
        RyokoAccount account = _ready(1);
        _agentTravel(account);
        uint256[] memory ids = new uint256[](3);
        ids[0] = aliceChog;
        ids[1] = 2; // not minted
        ids[2] = 5000; // out of range
        RyokoJourney.JourneyView[] memory v = journey.getJourneys(ids);
        assertEq(v.length, 3);
        assertEq(v[0].holder, alice);
        assertEq(v[0].agent, agentBot);
        assertEq(v[0].account, address(account));
        assertEq(uint8(v[0].status), uint8(RyokoJourney.Status.InSwamp));
        assertEq(v[0].readyAt, block.timestamp + MIN_STAY);
        assertEq(v[0].deadline, block.timestamp + LEG);
        assertEq(v[1].holder, address(0));
        assertEq(uint8(v[1].status), uint8(RyokoJourney.Status.None));
        assertEq(v[2].holder, address(0));
        assertEq(v[2].agent, address(0));
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function test_SetAntPrice_OnlyOwnerAndBounds() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        journey.setAntPrice(1);

        vm.startPrank(admin);
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        journey.setAntPrice(0);
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        journey.setAntPrice(uint256(type(uint128).max) + 1);
        // A rush costs two ants, so the price is capped at half of uint128.
        vm.expectRevert(RyokoJourney.InvalidConfig.selector);
        journey.setAntPrice(uint256(type(uint128).max) / 2 + 1);
        journey.setAntPrice(5 ether);
        vm.stopPrank();
        assertEq(journey.antPrice(), 5 ether);
    }

    function test_Ownership_TwoStep() public {
        vm.prank(admin);
        journey.transferOwnership(bob);
        assertEq(journey.owner(), admin);
        vm.prank(bob);
        journey.acceptOwnership();
        assertEq(journey.owner(), bob);
    }

    // ------------------------------------------------------------------
    // Utils
    // ------------------------------------------------------------------

    function _repeat(bytes1 c, uint256 n) internal pure returns (bytes memory out) {
        out = new bytes(n);
        for (uint256 i; i < n; ++i) {
            out[i] = c;
        }
    }
}
