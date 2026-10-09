// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TestChogGenesis
/// @notice TESTNET ONLY. Free-mint stand-in for Chog Genesis so anyone, including judges,
///         can try Ryoko Chog without owning a real Chog. Same 1,969 supply.
///         Metadata points at the real Chog Genesis IPFS folder so the art is real,
///         but token ids are not mapped the same way as on mainnet.
contract TestChogGenesis is ERC721 {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 1969;
    uint256 public constant MAX_PER_WALLET = 3;
    string private constant BASE_URI = "ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/";

    uint256 public totalSupply;
    mapping(address => uint256) public mintedBy;

    error SoldOut();
    error WalletLimit();

    constructor() ERC721("Chog Genesis (Test)", "tCHOGNFT") {}

    /// @notice Mint the next test Chog to the caller. Up to 3 per wallet.
    function mint() external returns (uint256 tokenId) {
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();
        if (mintedBy[msg.sender] >= MAX_PER_WALLET) revert WalletLimit();
        mintedBy[msg.sender] += 1;
        tokenId = ++totalSupply;
        _safeMint(msg.sender, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(BASE_URI, tokenId.toString(), ".json");
    }
}
