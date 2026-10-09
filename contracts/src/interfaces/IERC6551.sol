// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Interfaces copied from ERC-6551 (https://eips.ethereum.org/EIPS/eip-6551).

interface IERC6551Registry {
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    error AccountCreationFailed();

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address account);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address account);
}

/// @dev ERC-165 interface id: 0x6faff5f1
interface IERC6551Account {
    receive() external payable;

    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);

    function state() external view returns (uint256);

    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4 magicValue);
}

/// @dev ERC-165 interface id: 0x51945447
interface IERC6551Executable {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
}
