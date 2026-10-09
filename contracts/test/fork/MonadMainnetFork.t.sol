// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {RyokoAccount} from "../../src/RyokoAccount.sol";
import {RyokoJourney} from "../../src/RyokoJourney.sol";
import {IERC6551Registry} from "../../src/interfaces/IERC6551.sol";

/// @notice Runs Ryoko Chog against the real Monad mainnet contracts on a local fork.
///         Opt in with: RUN_FORK=true forge test --match-path test/fork/*
contract MonadMainnetForkTest is Test {
    IERC721 internal constant CHOG_GENESIS = IERC721(0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763);
    IERC20 internal constant CHOG = IERC20(0x350035555E10d9AfAF1566AaebfCeD5BA6C27777);
    IERC6551Registry internal constant REGISTRY = IERC6551Registry(0x000000006551c19487814612e58FE06813775758);
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    /// @dev CHOG/MON pool on nad.fun; used only as a CHOG source on the fork.
    address internal constant CHOG_SOURCE = 0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1;

    uint256 internal constant PRICE = 1_000 ether;
    uint64 internal constant MIN_STAY = 2 days;
    uint64 internal constant LEG = 9 days;

    RyokoJourney internal journey;
    RyokoAccount internal impl;
    address internal agentBot = makeAddr("agent");

    function setUp() public {
        vm.skip(!vm.envOr("RUN_FORK", false));
        vm.createSelectFork("monad");
        assertEq(block.chainid, 143, "Monad mainnet chain id");

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        impl = new RyokoAccount(predicted);
        journey = new RyokoJourney(CHOG_GENESIS, CHOG, REGISTRY, address(impl), PRICE, MIN_STAY, LEG, address(this));
    }

    function test_Fork_RealChogTravelsAndBurnsExactAmount() public {
        uint256 tokenId = 1;
        address holder = CHOG_GENESIS.ownerOf(tokenId);

        vm.prank(holder);
        RyokoAccount account = RyokoAccount(payable(journey.startJourney(tokenId)));
        assertEq(account.owner(), holder);

        vm.prank(CHOG_SOURCE);
        assertTrue(CHOG.transfer(address(account), PRICE * 2));
        assertEq(CHOG.balanceOf(address(account)), PRICE * 2, "no fee on transfer in");

        vm.prank(holder);
        account.authorize(agentBot, CHOG, type(uint256).max);

        uint256 deadBefore = CHOG.balanceOf(DEAD);
        uint256 supplyBefore = CHOG.totalSupply();
        _pinCalm(tokenId);
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);

        assertEq(CHOG.balanceOf(DEAD) - deadBefore, PRICE, "exact amount reaches the burn address");
        assertEq(CHOG.balanceOf(address(account)), PRICE, "exact amount leaves the Chog account");
        assertEq(CHOG.totalSupply(), supplyBefore, "token has no fee or rebase on transfer");

        vm.warp(block.timestamp + MIN_STAY);
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.conquer, ("Swamp 1 conquered.")), 0);
        assertEq(journey.getJourney(tokenId).conquered, 1);
    }

    /// One transaction on the real contracts: name, journey, agent and ants via a real $CHOG permit.
    function test_Fork_BeginWithRealChogPermit() public {
        uint256 tokenId = 1;
        (address player, uint256 key) = makeAddrAndKey("player");
        address realHolder = CHOG_GENESIS.ownerOf(tokenId);
        vm.prank(realHolder);
        CHOG_GENESIS.transferFrom(realHolder, player, tokenId);
        vm.prank(CHOG_SOURCE);
        assertTrue(CHOG.transfer(player, PRICE * 3));

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                player,
                address(journey),
                PRICE * 3,
                IERC20Permit(address(CHOG)).nonces(player),
                deadline
            )
        );
        bytes32 digest = MessageHashUtils.toTypedDataHash(IERC20Permit(address(CHOG)).DOMAIN_SEPARATOR(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);

        vm.prank(player);
        RyokoAccount account = RyokoAccount(
            payable(journey.begin(tokenId, "Fork Chog", agentBot, 3, RyokoJourney.Permit(deadline, v, r, s)))
        );

        assertEq(journey.nameOf(tokenId), "Fork Chog");
        assertEq(account.agent(), agentBot);
        assertEq(CHOG.balanceOf(address(account)), PRICE * 3, "three ants moved by permit");
        assertEq(CHOG.balanceOf(player), 0);
        assertEq(CHOG.allowance(player, address(journey)), 0, "permit used up exactly");
        assertEq(CHOG.allowance(address(account), address(journey)), type(uint256).max);

        // Rush on the real token too.
        _pinCalm(tokenId);
        vm.prank(agentBot);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.travel, ()), 0);
        uint256 deadBefore = CHOG.balanceOf(DEAD);
        vm.prank(player);
        account.execute(address(journey), 0, abi.encodeCall(RyokoJourney.rush, ()), 0);
        assertEq(CHOG.balanceOf(DEAD) - deadBefore, PRICE * 2, "rush burns exactly two ants");
        assertEq(journey.getJourney(tokenId).readyAt, block.timestamp + MIN_STAY / 2);
    }

    function _pinCalm(uint256 tokenId) internal {
        RyokoJourney.JourneyView memory jv = journey.getJourney(tokenId);
        for (uint256 r = 1; r < 10_000; ++r) {
            uint256 seed = uint256(keccak256(abi.encode(r, tokenId, jv.journeyId, jv.conquered + 1, jv.restarts)));
            if (journey.rollEvent(seed, journey.tierOf(tokenId)) == RyokoJourney.SwampEvent.Calm) {
                vm.prevrandao(r);
                return;
            }
        }
        revert("no calm roll");
    }

    function test_Fork_BatchViewCoversCollection() public view {
        uint256[] memory ids = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            ids[i] = 1870 + i; // 1870..1969, plus nothing past the end
        }
        RyokoJourney.JourneyView[] memory v = journey.getJourneys(ids);
        assertEq(v[99].tokenId, 1969);
        assertTrue(v[99].holder != address(0), "token 1969 exists");
    }
}
