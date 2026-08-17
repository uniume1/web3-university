// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CourseCertificate} from "../src/CourseCertificate.sol";

contract VerifyCertificate is Script {
    function run() external {
        address certAddress = vm.envAddress("CERTIFICATE_ADDRESS");
        CourseCertificate cert = CourseCertificate(certAddress);

        console2.log("=== Certificate Contract Status ===");
        console2.log("Address:", certAddress);
        console2.log("Name:", cert.name());
        console2.log("Symbol:", cert.symbol());

        // 检查角色
        bytes32 signerRole = cert.SIGNER_ROLE();
        console2.log("SIGNER_ROLE:", vm.toString(signerRole));

        // 检查合约是否支持接口
        bool supports721 = cert.supportsInterface(0x80ac58cd); // ERC-721
        console2.log("Supports ERC-721:", supports721);
    }
}
