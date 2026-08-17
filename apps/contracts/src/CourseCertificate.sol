// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract CourseCertificate is ERC721URIStorage, AccessControl, EIP712 {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant COMPLETION_TYPEHASH = keccak256(
        "CourseCompletion(address student,uint256 courseId,bytes32 tokenURIHash,bytes32 nonce,uint256 deadline)"
    );

    uint256 private _nextTokenId = 1;
    mapping(address => mapping(uint256 => uint256)) public certificateOf;
    mapping(bytes32 => bool) public usedNonces;

    error CertificateAlreadyExists();
    error CertificateIsSoulbound();
    error ExpiredProof();
    error NonceAlreadyUsed();
    error InvalidSigner();

    event CertificateMinted(
        address indexed student, uint256 indexed courseId, uint256 indexed tokenId, string tokenURI
    );

    constructor(address admin, address signer)
        ERC721("Web3 University Certificate", "W3UC")
        EIP712("Web3 University Certificate", "1")
    {
        if (admin == address(0) || signer == address(0)) {
            revert InvalidSigner();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address previousOwner) {
        previousOwner = _ownerOf(tokenId);
        if (previousOwner != address(0) && to != address(0)) {
            revert CertificateIsSoulbound();
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function claimCertificate(
        uint256 courseId,
        string calldata tokenURI_,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert ExpiredProof();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (certificateOf[msg.sender][courseId] != 0) {
            revert CertificateAlreadyExists();
        }

        bytes32 structHash = keccak256(
            abi.encode(COMPLETION_TYPEHASH, msg.sender, courseId, keccak256(bytes(tokenURI_)), nonce, deadline)
        );
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (!hasRole(SIGNER_ROLE, recovered)) revert InvalidSigner();

        usedNonces[nonce] = true;
        tokenId = _nextTokenId++;
        certificateOf[msg.sender][courseId] = tokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        emit CertificateMinted(msg.sender, courseId, tokenId, tokenURI_);
    }
}
