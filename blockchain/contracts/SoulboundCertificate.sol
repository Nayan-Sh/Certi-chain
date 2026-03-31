// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SoulboundCertificate
 * @dev An ERC-721 token that cannot be transferred once minted.
 * This represents a Verifiable Credential bound to an identity (wallet).
 */
contract SoulboundCertificate is ERC721, Ownable {
    uint256 private _nextTokenId;

    // Mapping from tokenId to the IPFS URI representing the metadata
    mapping(uint256 => string) private _tokenUris;
    
    // Mapping to track which certificate IDs have already been claimed as NFTs
    mapping(string => bool) public isClaimed;

    event CertificateClaimed(address indexed studentWallet, uint256 indexed tokenId, string certificateId);

    constructor() ERC721("CertifyChain Soulbound", "CERT-SBT") Ownable(msg.sender) {}

    /**
     * Mints a new Soulbound Token to the student's wallet.
     * Note: In a production app with a centralized backend, only the Owner (Admin/Backend)
     * should call this, passing the verified student's address and the certificate ID.
     */
    function issueSBT(address student, string memory certificateId, string memory uri) public onlyOwner {
        require(!isClaimed[certificateId], "Certificate has already been claimed as an SBT");
        
        uint256 tokenId = _nextTokenId++;
        _mint(student, tokenId);
        _tokenUris[tokenId] = uri;
        
        isClaimed[certificateId] = true;

        emit CertificateClaimed(student, tokenId, certificateId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenUris[tokenId];
    }

    /**
     * @dev overriding transfer functions to make the token Soulbound (non-transferable).
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0)) and burning (to == address(0)), but block transfers.
        require(from == address(0) || to == address(0), "SoulboundToken: Transfer failed. Certificates are non-transferable.");
        
        return super._update(to, tokenId, auth);
    }
}
