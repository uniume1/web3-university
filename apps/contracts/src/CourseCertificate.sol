// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721URIStorage
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// ============ 接口定义（移到合约外部） ============
interface ICourseCompletionOracle {
    function completionVerified(
        address student,
        uint256 courseId
    ) external view returns (bool);
}

contract CourseCertificate is ERC721URIStorage, AccessControl, EIP712 {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant COMPLETION_TYPEHASH =
        keccak256(
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
    error ZeroAddress();
    error InvalidTokenURI();

    event CertificateMinted(
        address indexed student,
        uint256 indexed courseId,
        uint256 indexed tokenId,
        string tokenURI
    );
    event CompletionOracleUpdated(address indexed oracle);
    event CourseTokenURIUpdated(uint256 indexed courseId, string tokenURI);

    ICourseCompletionOracle public completionOracle;
    mapping(uint256 => string) public courseTokenURI;

    constructor(
        address admin,
        address signer
    )
        ERC721("Web3 University Certificate", "W3UC")
        EIP712("Web3 University Certificate", "1")
    {
        if (admin == address(0) || signer == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
    }

    // ============ Soulbound: 禁止转账 ============
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address previousOwner) {
        previousOwner = _ownerOf(tokenId);
        if (previousOwner != address(0) && to != address(0)) {
            revert CertificateIsSoulbound();
        }
        return super._update(to, tokenId, auth);
    }

    // ============ EIP-712 签名领取 ============
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
        if (bytes(tokenURI_).length == 0) revert InvalidTokenURI();

        bytes32 structHash = keccak256(
            abi.encode(
                COMPLETION_TYPEHASH,
                msg.sender,
                courseId,
                keccak256(bytes(tokenURI_)),
                nonce,
                deadline
            )
        );
        address recovered = ECDSA.recover(
            _hashTypedDataV4(structHash),
            signature
        );
        if (!hasRole(SIGNER_ROLE, recovered)) revert InvalidSigner();

        usedNonces[nonce] = true;
        tokenId = _mintCertificate(msg.sender, courseId, tokenURI_);
    }

    // ============ Chainlink Oracle 领取（阶段 G） ============
    function setCompletionOracle(
        address oracle
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (oracle == address(0)) revert ZeroAddress();
        completionOracle = ICourseCompletionOracle(oracle);
        emit CompletionOracleUpdated(oracle);
    }

    function setCourseTokenURI(
        uint256 courseId,
        string calldata tokenURI_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bytes(tokenURI_).length == 0) revert InvalidTokenURI();
        courseTokenURI[courseId] = tokenURI_;
        emit CourseTokenURIUpdated(courseId, tokenURI_);
    }

    function claimCertificateFromOracle(
        uint256 courseId
    ) external returns (uint256 tokenId) {
        if (address(completionOracle) == address(0)) revert ZeroAddress();
        if (!completionOracle.completionVerified(msg.sender, courseId)) {
            revert InvalidSigner();
        }
        string memory tokenURI_ = courseTokenURI[courseId];
        if (bytes(tokenURI_).length == 0) revert InvalidTokenURI();
        if (certificateOf[msg.sender][courseId] != 0) {
            revert CertificateAlreadyExists();
        }

        tokenId = _mintCertificate(msg.sender, courseId, tokenURI_);
    }

    // ============ 内部函数 ============
    function _mintCertificate(
        address student,
        uint256 courseId,
        string memory tokenURI_
    ) internal returns (uint256 tokenId) {
        if (certificateOf[student][courseId] != 0) {
            revert CertificateAlreadyExists();
        }
        tokenId = _nextTokenId++;
        certificateOf[student][courseId] = tokenId;
        _safeMint(student, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        emit CertificateMinted(student, courseId, tokenId, tokenURI_);
        return tokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
