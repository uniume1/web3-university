// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CourseCertificate} from "../src/CourseCertificate.sol";

contract DeployCertificate is Script {
    function run() external returns (CourseCertificate certificate) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address signer = vm.envOr("COURSE_PROOF_SIGNER_ADDRESS", deployer);

        console2.log("Deployer:", deployer);
        console2.log("Signer:", signer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);
        certificate = new CourseCertificate(deployer, signer);
        vm.stopBroadcast();

        console2.log("CourseCertificate deployed at:", address(certificate));
        console2.log("Admin:", deployer);
        console2.log("Signer:", signer);
        console2.log("");
        console2.log("IMPORTANT:");
        console2.log("  1. Add certificate address to sepolia.json");
        console2.log("  2. Signer has SIGNER_ROLE (granted automatically)");
        console2.log(
            "  3. To change signer: grantRole(SIGNER_ROLE, newSigner)"
        );
    }
}
