// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {HealthCheck} from "../src/HealthCheck.sol";

contract DeployHealthCheck is Script {
    function run() external returns (HealthCheck deployed) {
        vm.startBroadcast();
        deployed = new HealthCheck();
        vm.stopBroadcast();
    }
}
