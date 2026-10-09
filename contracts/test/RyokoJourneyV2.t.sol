// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {RyokoBase} from "./utils/RyokoBase.sol";
import {RyokoAccount} from "../src/RyokoAccount.sol";
import {RyokoJourney} from "../src/RyokoJourney.sol";

/// @notice One-transaction start, swamp events, tiers and rushing.
contract RyokoJourneyV2Test is RyokoBase {
    // ------------------------------------------------------------------
    // begin: everything in one transaction
    // ------------------------------------------------------------------

    function test_Begin_WithPermit_DoesEverythingInOneCall() public {
        deal(address(token), alice, PRICE * 5, true);
        RyokoJourney.Permit memory p = _permit(aliceKey, address(journey), PRICE * 3, block.timestamp + 1 hours);

        vm.prank(alice);
        RyokoAccount account = RyokoAccount(payable(journey.begin(aliceChog, "Gnarlo", agentBot, 3, p)));

        assertEq(journey.nameOf(aliceChog), "Gnarlo");
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Travelling));
        assertEq(address(account), journey.accountOf(aliceChog));
        assertEq(account.agent(), agentBot);
        assertEq(token.allowance(address(account), address(journey)), type(uint256).max, "ant payments allowed");
        assertEq(token.balanceOf(address(account)), PRICE * 3, "three ants in the Chog's wallet");
        assertEq(token.balanceOf(alice), PRICE * 2);
        assertEq(token.allowance(alice, address(journey)), 0, "permit used up exactly");

        // The agent can go straight away.
        _agentTravel(account);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.InSwamp));
    }

    function test_Begin_WithExistingAllowance() public {
        deal(address(token), alice, PRICE * 2, true);
        vm.startPrank(alice);
        token.approve(address(journey), PRICE * 2);
        RyokoAccount account = RyokoAccount(payable(journey.begin(aliceChog, "", agentBot, 2, _noPermit())));
        vm.stopPrank();
        assertEq(token.balanceOf(address(account)), PRICE * 2);
        assertEq(journey.nameOf(aliceChog), "", "empty name skips naming");
    }

    function test_Begin_UsedPermitFallsBackToAllowance() public {
        deal(address(token), alice, PRICE * 2, true);
        RyokoJourney.Permit memory p = _permit(aliceKey, address(journey), PRICE * 2, block.timestamp + 1 hours);
        // Someone submits the permit first (front-running), which sets the allowance anyway.
        token.permit(alice, address(journey), PRICE * 2, p.deadline, p.v, p.r, p.s);

        vm.prank(alice);
        RyokoAccount account = RyokoAccount(payable(journey.begin(aliceChog, "Gnarlo", agentBot, 2, p)));
        assertEq(token.balanceOf(address(account)), PRICE * 2);
    }

    function test_Begin_BadPermitWithoutAllowanceReverts() public {
        deal(address(token), alice, PRICE * 2, true);
        // Signed for a different amount, so it does not verify.
        RyokoJourney.Permit memory p = _permit(aliceKey, address(journey), PRICE, block.timestamp + 1 hours);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(journey), 0, PRICE * 2
            )
        );
        journey.begin(aliceChog, "Gnarlo", agentBot, 2, p);
    }

    function test_Begin_WithoutAntsOrAgent() public {
        vm.prank(alice);
        RyokoAccount account = RyokoAccount(payable(journey.begin(aliceChog, "Gnarlo", address(0), 0, _noPermit())));
        assertEq(account.agent(), address(0));
        assertEq(token.allowance(address(account), address(journey)), type(uint256).max, "hand travel works too");
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Travelling));
    }

    function test_Begin_OnlyHolder() public {
        vm.prank(bob);
        vm.expectRevert(RyokoJourney.NotHolder.selector);
        journey.begin(aliceChog, "Gnarlo", agentBot, 0, _noPermit());
    }

    function test_Begin_TakenNameRevertsWholeCall() public {
        vm.prank(bob);
        uint256 bobChog = chog.mint();
        vm.prank(bob);
        journey.setName(bobChog, "Gnarlo");

        vm.prank(alice);
        vm.expectRevert(RyokoJourney.NameTaken.selector);
        journey.begin(aliceChog, "gnarlo", agentBot, 0, _noPermit());
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.None), "nothing happened");
    }

    function test_Begin_RevertsWhenJourneyExists() public {
        vm.startPrank(alice);
        journey.begin(aliceChog, "Gnarlo", agentBot, 0, _noPermit());
        vm.expectRevert(RyokoJourney.JourneyExists.selector);
        journey.begin(aliceChog, "Gnarlo", agentBot, 0, _noPermit());
        vm.stopPrank();
    }

    function test_SetupFromJourney_OnlyJourneyAndCurrentHolder() public {
        RyokoAccount account = _start(alice, aliceChog);

        vm.prank(alice);
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.setupFromJourney(alice, agentBot, IERC20(address(token)));

        vm.prank(address(journey));
        vm.expectRevert(RyokoAccount.NotAuthorized.selector);
        account.setupFromJourney(bob, agentBot, IERC20(address(token)));

        vm.prank(address(journey));
        account.setupFromJourney(alice, agentBot, IERC20(address(token)));
        assertEq(account.agent(), agentBot);
    }

    // ------------------------------------------------------------------
    // Swamp events
    // ------------------------------------------------------------------

    function test_Event_Calm_StandardStay() public {
        RyokoAccount account = _ready(1);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Calm);
        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(v.readyAt, block.timestamp + MIN_STAY);
        assertEq(uint8(v.swampEvent), uint8(RyokoJourney.SwampEvent.Calm));
        assertEq(v.burned, PRICE);
    }

    function test_Event_Shortcut_QuarterShorter() public {
        RyokoAccount account = _ready(1);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Shortcut);
        assertEq(journey.getJourney(aliceChog).readyAt, block.timestamp + MIN_STAY - MIN_STAY / 4);
        vm.warp(block.timestamp + MIN_STAY - MIN_STAY / 4);
        _agentConquer(account, "Found a shortcut.");
        assertEq(journey.getJourney(aliceChog).conquered, 1);
    }

    function test_Event_Fog_QuarterLonger() public {
        RyokoAccount account = _ready(1);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Fog);
        uint64 readyAt = uint64(block.timestamp) + MIN_STAY + MIN_STAY / 4;
        assertEq(journey.getJourney(aliceChog).readyAt, readyAt);
        vm.warp(block.timestamp + MIN_STAY);
        vm.prank(agentBot);
        vm.expectRevert(abi.encodeWithSelector(RyokoJourney.StayTooShort.selector, readyAt));
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("still foggy")), 0);
    }

    function test_Event_AntNest_SparesTheAnt() public {
        RyokoAccount account = _ready(1);
        uint256 deadBefore = token.balanceOf(DEAD);
        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.AntEaten(aliceChog, 1, 1, 0);
        _agentTravelWith(account, RyokoJourney.SwampEvent.AntNest);

        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(uint8(v.status), uint8(RyokoJourney.Status.InSwamp));
        assertEq(v.ants, 0);
        assertEq(v.burned, 0);
        assertEq(token.balanceOf(address(account)), PRICE, "ant kept");
        assertEq(token.balanceOf(DEAD), deadBefore);
    }

    function test_Event_AntNest_WorksWithEmptyWallet() public {
        RyokoAccount account = _start(alice, aliceChog);
        _authorize(alice, account);
        _agentTravelWith(account, RyokoJourney.SwampEvent.AntNest);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.InSwamp));
    }

    function test_Event_Relic_RecordedInHistory() public {
        RyokoAccount account = _ready(2);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Relic);
        vm.warp(block.timestamp + MIN_STAY);
        _agentConquer(account, "A relic!");
        _agentTravelWith(account, RyokoJourney.SwampEvent.Fog);

        uint8[9] memory events = journey.eventsOf(aliceChog);
        assertEq(events[0], uint8(RyokoJourney.SwampEvent.Relic));
        assertEq(events[1], uint8(RyokoJourney.SwampEvent.Fog));
        assertEq(events[2], 0, "not entered");
    }

    function test_Event_RolledEventIsEmitted() public {
        RyokoAccount account = _ready(1);
        _pinEvent(aliceChog, RyokoJourney.SwampEvent.Shortcut);
        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.SwampEventRolled(
            aliceChog, 1, 1, RyokoJourney.SwampEvent.Shortcut, uint64(block.timestamp) + MIN_STAY - MIN_STAY / 4
        );
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    function test_Event_ResetsWithJourney() public {
        RyokoAccount account = _ready(1);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Relic);
        vm.prank(alice);
        chog.transferFrom(alice, bob, aliceChog);
        assertEq(journey.eventsOf(aliceChog)[0], 0, "a new holder sees no history");
        assertEq(uint8(journey.getJourney(aliceChog).swampEvent), 0);
    }

    /// Odds are exact: the roll is seed % 100, so seeds 0..99 hit every outcome once.
    function test_RollEvent_ExactOddsPerTier() public view {
        for (uint8 t; t <= 7; ++t) {
            uint256[6] memory n;
            for (uint256 seed; seed < 100; ++seed) {
                n[uint8(journey.rollEvent(seed, t))] += 1;
            }
            uint256 c = t > 5 ? 5 : t;
            assertEq(n[uint8(RyokoJourney.SwampEvent.Relic)], 3 + c, "relic");
            assertEq(n[uint8(RyokoJourney.SwampEvent.AntNest)], 7 + c, "ant nest");
            assertEq(n[uint8(RyokoJourney.SwampEvent.Shortcut)], 15 + 2 * c, "shortcut");
            assertEq(n[uint8(RyokoJourney.SwampEvent.Fog)], 25 - 4 * c, "fog");
            // The tier terms cancel out: rarity swaps fog for good events, calm stays at half.
            assertEq(n[uint8(RyokoJourney.SwampEvent.Calm)], 50, "calm");
            assertEq(n[uint8(RyokoJourney.SwampEvent.None)], 0, "never none");
        }
    }

    // ------------------------------------------------------------------
    // Tiers
    // ------------------------------------------------------------------

    function test_Tiers_PackedOneBytePerToken() public {
        uint256[] memory words = new uint256[](2);
        // Token 1 -> tier 3, token 2 -> tier 1, token 32 -> tier 4, token 33 (next word) -> tier 2.
        words[0] = 3 | (1 << 8) | (4 << (31 * 8));
        words[1] = 2;
        vm.prank(admin);
        journey.setTierWords(0, words);
        assertEq(journey.tierOf(1), 3);
        assertEq(journey.tierOf(2), 1);
        assertEq(journey.tierOf(3), 0);
        assertEq(journey.tierOf(32), 4);
        assertEq(journey.tierOf(33), 2);
        assertEq(journey.tierOf(0), 0);
        assertEq(journey.getJourney(1).tier, 3, "tier shown in the journey view");
    }

    function test_Tiers_OnlyOwnerAndFreezable() public {
        uint256[] memory words = new uint256[](1);
        words[0] = 1;
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        journey.setTierWords(0, words);

        vm.startPrank(admin);
        journey.setTierWords(0, words);
        journey.freezeTiers();
        vm.expectRevert(RyokoJourney.TiersAreFrozen.selector);
        journey.setTierWords(0, words);
        vm.stopPrank();
        assertTrue(journey.tiersFrozen());
        assertEq(journey.tierOf(1), 1);
    }

    function test_Tiers_ChangeTheRoll() public {
        // Find a seed that is fog for a common Chog but not for the top tier.
        uint256 seed;
        for (; seed < 100; ++seed) {
            if (
                journey.rollEvent(seed, 0) == RyokoJourney.SwampEvent.Fog
                    && journey.rollEvent(seed, 5) != RyokoJourney.SwampEvent.Fog
            ) break;
        }
        assertLt(seed, 100, "rarer Chogs dodge some fog");
    }

    // ------------------------------------------------------------------
    // Rush
    // ------------------------------------------------------------------

    function _rush(RyokoAccount account) internal {
        vm.prank(alice);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);
    }

    function test_Rush_CutsADayForTwoAnts() public {
        RyokoAccount account = _ready(3);
        _agentTravel(account);
        uint64 enteredAt = uint64(block.timestamp);
        uint256 deadBefore = token.balanceOf(DEAD);

        vm.expectEmit(true, true, false, true, address(journey));
        emit RyokoJourney.SwampRushed(aliceChog, 1, 1, enteredAt + MIN_STAY / 2, PRICE * 2);
        _rush(account);

        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertEq(v.readyAt, enteredAt + MIN_STAY / 2, "one day instead of two");
        assertTrue(v.rushed);
        assertEq(v.ants, 3);
        assertEq(v.burned, PRICE * 3);
        assertEq(token.balanceOf(DEAD) - deadBefore, PRICE * 2);
        assertEq(token.balanceOf(address(account)), 0);
        assertEq(journey.eventsOf(aliceChog)[0], uint8(RyokoJourney.SwampEvent.Calm) | 0x80, "rush flag");

        vm.warp(enteredAt + MIN_STAY / 2);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Ready));
        _agentConquer(account, "Rushed it.");
        assertFalse(journey.getJourney(aliceChog).rushed, "cleared after conquering");
    }

    function test_Rush_LateInTheStayMakesItReadyNow() public {
        RyokoAccount account = _ready(3);
        _agentTravel(account);
        vm.warp(block.timestamp + MIN_STAY - 60);
        _rush(account);
        assertEq(journey.getJourney(aliceChog).readyAt, block.timestamp);
        assertEq(uint8(_status(aliceChog)), uint8(RyokoJourney.Status.Ready));
    }

    function test_Rush_OncePerSwamp() public {
        RyokoAccount account = _ready(5);
        _agentTravel(account);
        _rush(account);
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.AlreadyRushed.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);
    }

    function test_Rush_RevertsWhenNotInSwampOrAlreadyReady() public {
        RyokoAccount account = _ready(5);
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.NotInSwamp.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);

        _agentTravel(account);
        vm.warp(block.timestamp + MIN_STAY);
        vm.prank(alice);
        vm.expectRevert(RyokoJourney.AlreadyReady.selector);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);
    }

    function test_Rush_NeedsTwoAntsInTheWallet() public {
        RyokoAccount account = _ready(2);
        _agentTravel(account);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(account), PRICE, PRICE * 2)
        );
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);
    }

    function test_Rush_WithShortcut() public {
        RyokoAccount account = _ready(3);
        _agentTravelWith(account, RyokoJourney.SwampEvent.Shortcut);
        uint64 enteredAt = uint64(block.timestamp);
        _rush(account);
        assertEq(journey.getJourney(aliceChog).readyAt, enteredAt + MIN_STAY / 4, "half a day on mainnet");
    }

    function test_Rush_ResetOnNextSwamp() public {
        RyokoAccount account = _ready(6);
        _agentTravel(account);
        _rush(account);
        vm.warp(block.timestamp + MIN_STAY / 2);
        _agentConquer(account, "Fast.");
        _agentTravel(account);
        _rush(account); // allowed again in the next swamp
        assertTrue(journey.getJourney(aliceChog).rushed);
    }

    /// Whatever the event and rush, a stay never ends after the deadline.
    function testFuzz_StayAlwaysEndsBeforeDeadline(uint256 rawWait, uint8 rawEvent, bool rushIt, uint256 rushAt)
        public
    {
        RyokoAccount account = _ready(3);
        uint64 deadline = uint64(block.timestamp) + LEG;
        uint256 wait = bound(rawWait, 0, LEG - journey.maxStay());
        vm.warp(block.timestamp + wait);
        RyokoJourney.SwampEvent ev = RyokoJourney.SwampEvent(bound(rawEvent, 1, 5));
        _agentTravelWith(account, ev);
        RyokoJourney.JourneyView memory v = journey.getJourney(aliceChog);
        assertLe(v.readyAt, deadline);
        assertGe(v.readyAt, v.enteredAt + MIN_STAY - MIN_STAY / 4);

        if (rushIt) {
            vm.warp(v.enteredAt + bound(rushAt, 0, v.readyAt - v.enteredAt - 1));
            _rush(account);
            v = journey.getJourney(aliceChog);
            assertGe(v.readyAt, block.timestamp);
            assertLe(v.readyAt, deadline);
        }
        vm.warp(v.readyAt);
        _agentConquer(account, "Made it.");
        assertEq(journey.getJourney(aliceChog).conquered, 1);
    }
}
