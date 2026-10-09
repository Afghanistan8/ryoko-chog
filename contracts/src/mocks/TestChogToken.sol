// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title TestChogToken
/// @notice TESTNET ONLY. Faucet stand-in for $CHOG (18 decimals and EIP-2612 permit, like the real token).
contract TestChogToken is ERC20, ERC20Permit {
    uint256 public constant FAUCET_AMOUNT = 20_000 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    constructor() ERC20("Chog (Test)", "tCHOG") ERC20Permit("Chog (Test)") {}

    /// @notice Get 20,000 test CHOG, once per hour per wallet.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) revert FaucetCooldown(last + FAUCET_COOLDOWN);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
