// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";

import {RyokoJourney} from "../src/RyokoJourney.sol";

/// @notice Loads the Chog tiers into a deployed RyokoJourney and freezes them, for a deploy that
///         ran with SKIP_TIERS=true. Must be sent by the journey owner.
///
/// Environment:
///   JOURNEY   the RyokoJourney address (required)
contract LoadTiers is Script {
    uint256 internal constant MONAD_MAINNET = 143;
    uint256 internal constant MONAD_TESTNET = 10143;

    error UnsupportedChain(uint256 chainId);
    error TiersIncomplete();
    error BadTierData();
    error AlreadyFrozen();

    function run() external {
        bool mainnet = block.chainid == MONAD_MAINNET;
        if (!mainnet && block.chainid != MONAD_TESTNET) revert UnsupportedChain(block.chainid);
        RyokoJourney journey = RyokoJourney(vm.envAddress("JOURNEY"));
        if (journey.tiersFrozen()) revert AlreadyFrozen();

        uint256[] memory words = tierWords(mainnet ? ".mainnet" : ".testnet");
        vm.startBroadcast();
        journey.setTierWords(0, words);
        journey.freezeTiers();
        vm.stopBroadcast();

        console2.log("tiers loaded and frozen on", address(journey));
        console2.log("token 1 tier", journey.tierOf(1));
    }

    /// @dev Same packing as Deploy: token id i at byte (i-1) % 32 of word (i-1) / 32.
    function tierWords(string memory key) public view returns (uint256[] memory words) {
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
