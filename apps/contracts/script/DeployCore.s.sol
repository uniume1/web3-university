// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {UNIToken} from "../src/UNIToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {CourseMarket} from "../src/CourseMarket.sol";
import {CourseCertificate} from "../src/CourseCertificate.sol";

contract DeployCore is Script {
    function run() external returns (UNIToken uni, MockUSDC usdc, CourseMarket market) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address proofSigner = vm.envAddress("COURSE_PROOF_SIGNER_ADDRESS");

        vm.startBroadcast(key);
        uni = new UNIToken(treasury);
        usdc = new MockUSDC(treasury);
        market = new CourseMarket(address(uni), treasury, deployer);
        CourseCertificate certificate = new CourseCertificate(deployer, proofSigner);
        vm.stopBroadcast();

        console2.log("CourseCertificate", address(certificate));

        console2.log("UNIToken", address(uni));
        console2.log("MockUSDC", address(usdc));
        console2.log("CourseMarket", address(market));
    }
}
