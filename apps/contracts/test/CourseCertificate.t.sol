// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CourseCertificate} from "../src/CourseCertificate.sol";

contract CourseCertificateHarness is CourseCertificate {
    constructor(
        address admin,
        address signer
    ) CourseCertificate(admin, signer) {}

    function hashTypedData(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }
}

contract CourseCertificateTest is Test {
    CourseCertificateHarness internal cert;
    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal student = makeAddr("student");
    address internal attacker = makeAddr("attacker");
    string internal constant URI = "ipfs://course-1";

    function setUp() public {
        signer = vm.addr(signerKey);
        cert = new CourseCertificateHarness(address(this), signer);
    }

    function _signature(
        address who,
        uint256 courseId,
        string memory uri,
        bytes32 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                cert.COMPLETION_TYPEHASH(),
                who,
                courseId,
                keccak256(bytes(uri)),
                nonce,
                deadline
            )
        );
        bytes32 digest = cert.hashTypedData(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function testValidProofMintsCertificate() public {
        bytes32 nonce = keccak256("proof-1");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.prank(student);
        uint256 tokenId = cert.claimCertificate(1, URI, nonce, deadline, sig);

        assertEq(cert.ownerOf(tokenId), student);
        assertEq(cert.tokenURI(tokenId), URI);
        assertEq(cert.certificateOf(student, 1), tokenId);
    }

    function testCannotReuseNonce() public {
        bytes32 nonce = keccak256("proof-1");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.startPrank(student);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
        vm.expectRevert(CourseCertificate.NonceAlreadyUsed.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
        vm.stopPrank();
    }

    function testExpiredProofFails() public {
        bytes32 nonce = keccak256("expired");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);
        vm.warp(deadline + 1);

        vm.prank(student);
        vm.expectRevert(CourseCertificate.ExpiredProof.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
    }

    function testWrongStudentFails() public {
        bytes32 nonce = keccak256("wrong-student");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.prank(attacker);
        vm.expectRevert(CourseCertificate.InvalidSigner.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
    }

    function testCertificateCannotTransfer() public {
        bytes32 nonce = keccak256("soulbound");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);
        vm.prank(student);
        uint256 tokenId = cert.claimCertificate(1, URI, nonce, deadline, sig);

        vm.prank(student);
        vm.expectRevert(CourseCertificate.CertificateIsSoulbound.selector);
        cert.transferFrom(student, attacker, tokenId);
    }
}
