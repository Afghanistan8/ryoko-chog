// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {RyokoAccount} from "../src/RyokoAccount.sol";
import {RyokoJourney} from "../src/RyokoJourney.sol";
import {IERC6551Registry} from "../src/interfaces/IERC6551.sol";
import {TestChogGenesis} from "../src/mocks/TestChogGenesis.sol";
import {TestChogToken} from "../src/mocks/TestChogToken.sol";

/// @notice Deploys Ryoko Chog.
///
/// Monad mainnet (chain 143) uses the real Chog Genesis and $CHOG with 2-day stays and 9-day legs.
/// Monad testnet (chain 10143) deploys free test versions of both, with stays measured in minutes
/// so a full journey can be shown in a demo.
///
/// Environment:
///   OWNER        admin of the journey contract (required)
///   RESETTER     address allowed to report hidden transfers (optional, usually the agent)
///   ANT_PRICE    wei of $CHOG per ant (optional, default 1000e18)
///   MIN_STAY     seconds (optional; default 2 days on mainnet, 120 on testnet)
///   LEG_DURATION seconds (optional; default 9 days on mainnet, 540 on testnet)
///   SKIP_TIERS   true to deploy without loading the Chog tiers (optional, default false)
///
/// Chog tiers come from packages/shared/src/tiers.json (built by scripts/build-tiers.mjs from the
/// Chog Genesis metadata). They are loaded and frozen in the same run, so they can never change.
contract Deploy is Script {
    IERC6551Registry internal constant REGISTRY = IERC6551Registry(0x000000006551c19487814612e58FE06813775758);
    bytes32 internal constant REGISTRY_CODEHASH = 0xda1d5b06e579f9e42e59b00fbc22939896ecb38dc8830d40de0a2508fecd6735;

    address internal constant MAINNET_CHOG_GENESIS = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    address internal constant MAINNET_CHOG_TOKEN = 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777;

    uint256 internal constant MONAD_MAINNET = 143;
    uint256 internal constant MONAD_TESTNET = 10143;

    error UnsupportedChain(uint256 chainId);
    error RegistryMismatch();
    error AddressPredictionFailed();
    error TiersIncomplete();
    error BadTierData();

    function run() external returns (RyokoJourney journey, RyokoAccount impl, address chog, address chogToken) {
        bool mainnet = block.chainid == MONAD_MAINNET;
        if (!mainnet && block.chainid != MONAD_TESTNET) revert UnsupportedChain(block.chainid);
        if (address(REGISTRY).codehash != REGISTRY_CODEHASH) revert RegistryMismatch();

        address owner = vm.envAddress("OWNER");
        address resetter = vm.envOr("RESETTER", address(0));
        uint256 antPrice = vm.envOr("ANT_PRICE", uint256(1_000 ether));
        uint64 minStay = uint64(vm.envOr("MIN_STAY", mainnet ? uint256(2 days) : uint256(120)));
        uint64 legDuration = uint64(vm.envOr("LEG_DURATION", mainnet ? uint256(9 days) : uint256(540)));
        bool skipTiers = vm.envOr("SKIP_TIERS", false);
        uint256[] memory tierWords = skipTiers ? new uint256[](0) : _tierWords(mainnet ? ".mainnet" : ".testnet");

        vm.startBroadcast();
        // The broadcasting wallet, however the key was supplied (--private-key, --interactives, --account).
        // Reading msg.sender here is wrong: with --interactives it is Foundry's default sender.
        (, address deployer,) = vm.readCallers();

        if (mainnet) {
            chog = MAINNET_CHOG_GENESIS;
            chogToken = MAINNET_CHOG_TOKEN;
        } else {
            chog = address(new TestChogGenesis());
            chogToken = address(new TestChogToken());
        }

        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        impl = new RyokoAccount(predicted);
        // Owner is set to the deployer first so the resetter can be configured in this run.
        journey = new RyokoJourney(
            IERC721(chog), IERC20(chogToken), REGISTRY, address(impl), antPrice, minStay, legDuration, deployer
        );
        if (address(journey) != predicted) revert AddressPredictionFailed();

        if (resetter != address(0)) journey.setResetter(resetter);
        if (!skipTiers) {
            journey.setTierWords(0, tierWords);
            journey.freezeTiers();
        }
        if (owner != deployer) journey.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("chainId           ", block.chainid);
        console2.log("chogGenesis       ", chog);
        console2.log("chogToken         ", chogToken);
        console2.log("accountImpl       ", address(impl));
        console2.log("journey           ", address(journey));
        console2.log("antPrice (wei)    ", antPrice);
        console2.log("minStay (s)       ", minStay);
        console2.log("legDuration (s)   ", legDuration);
        console2.log("resetter          ", resetter);
        console2.log("tiers loaded      ", !skipTiers);
        if (owner != deployer) console2.log("pending owner (must call acceptOwnership)", owner);
    }

    /// @dev Packs one tier digit per token into 32-byte words, token id i at byte (i-1) % 32 of
    ///      word (i-1) / 32, exactly as RyokoJourney.tierOf reads them.
    function _tierWords(string memory key) internal view returns (uint256[] memory words) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/shared/src/tiers.json"));
        if (!vm.parseJsonBool(json, ".complete")) revert TiersIncomplete();
        bytes memory digits = bytes(vm.parseJsonString(json, key));
        if (digits.length != 1969) revert BadTierData();
        words = new uint256[]((digits.length + 31) / 32);
        for (uint256 i; i < digits.length; ++i) {
            uint8 c = uint8(digits[i]);
            if (c < 0x30 || c > 0x39) revert BadTierData();
            words[i / 32] |= uint256(c - 0x30) << ((i % 32) * 8);
        }
    }
}
