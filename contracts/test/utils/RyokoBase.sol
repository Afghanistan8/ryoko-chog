// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {RyokoAccount} from "../../src/RyokoAccount.sol";
import {RyokoJourney} from "../../src/RyokoJourney.sol";
import {IERC6551Registry} from "../../src/interfaces/IERC6551.sol";
import {TestChogGenesis} from "../../src/mocks/TestChogGenesis.sol";
import {TestChogToken} from "../../src/mocks/TestChogToken.sol";
import {ERC6551RegistryBytecode} from "./ERC6551RegistryBytecode.sol";

abstract contract RyokoBase is Test {
    address internal constant REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant PRICE = 1_000 ether;
    uint64 internal constant MIN_STAY = 2 days;
    uint64 internal constant LEG = 9 days;

    TestChogGenesis internal chog;
    TestChogToken internal token;
    RyokoAccount internal impl;
    RyokoJourney internal journey;

    address internal admin = makeAddr("admin");
    address internal alice;
    uint256 internal aliceKey;
    address internal bob = makeAddr("bob");
    address internal agentBot = makeAddr("agent");
    address internal resetterBot = makeAddr("resetter");

    uint256 internal aliceChog;

    function setUp() public virtual {
        (alice, aliceKey) = makeAddrAndKey("alice");
        vm.etch(REGISTRY, ERC6551RegistryBytecode.RUNTIME);

        chog = new TestChogGenesis();
        token = new TestChogToken();

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        impl = new RyokoAccount(predicted);
        journey = new RyokoJourney(
            chog, IERC20(address(token)), IERC6551Registry(REGISTRY), address(impl), PRICE, MIN_STAY, LEG, admin
        );
        assertEq(address(journey), predicted, "journey address prediction");

        vm.prank(admin);
        journey.setResetter(resetterBot);

        vm.prank(alice);
        aliceChog = chog.mint();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _start(address holder, uint256 tokenId) internal returns (RyokoAccount account) {
        vm.prank(holder);
        account = RyokoAccount(payable(journey.startJourney(tokenId)));
    }

    function _fund(RyokoAccount account, uint256 ants) internal {
        deal(address(token), address(account), PRICE * ants, true);
    }

    function _authorize(address holder, RyokoAccount account) internal {
        vm.prank(holder);
        account.authorize(agentBot, IERC20(address(token)), type(uint256).max);
    }

    /// Start, fund and authorize the agent for alice's Chog.
    function _ready(uint256 ants) internal returns (RyokoAccount account) {
        account = _start(alice, aliceChog);
        _fund(account, ants);
        _authorize(alice, account);
    }

    /// Agent travels with the swamp event pinned to Calm, so the stay is exactly MIN_STAY.
    function _agentTravel(RyokoAccount account) internal {
        _agentTravelWith(account, RyokoJourney.SwampEvent.Calm);
    }

    function _agentTravelWith(RyokoAccount account, RyokoJourney.SwampEvent ev) internal {
        (,, uint256 tokenId) = account.token();
        _pinEvent(tokenId, ev);
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
    }

    /// Sets block.prevrandao so the Chog's next travel rolls `ev`.
    function _pinEvent(uint256 tokenId, RyokoJourney.SwampEvent ev) internal {
        RyokoJourney.JourneyView memory v = journey.getJourney(tokenId);
        uint8 swamp = v.conquered + 1;
        uint32 restarts = v.restarts + (v.status == RyokoJourney.Status.Expired ? 1 : 0);
        uint8 tier = journey.tierOf(tokenId);
        for (uint256 r = 1; r < 10_000; ++r) {
            uint256 seed = uint256(keccak256(abi.encode(r, tokenId, v.journeyId, swamp, restarts)));
            if (journey.rollEvent(seed, tier) == ev) {
                vm.prevrandao(r);
                return;
            }
        }
        revert("no randomness found for event");
    }

    /// Signs an EIP-2612 permit from `key` for the test token.
    function _permit(uint256 key, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (RyokoJourney.Permit memory p)
    {
        address owner_ = vm.addr(key);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner_,
                spender,
                value,
                token.nonces(owner_),
                deadline
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(token.DOMAIN_SEPARATOR(), structHash);
        (p.v, p.r, p.s) = vm.sign(key, digest);
        p.deadline = deadline;
    }

    function _noPermit() internal pure returns (RyokoJourney.Permit memory p) {}

    function _agentConquer(RyokoAccount account, string memory note) internal {
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, (note)), 0);
    }

    function _status(uint256 tokenId) internal view returns (RyokoJourney.Status) {
        return journey.statusOf(tokenId);
    }
}
