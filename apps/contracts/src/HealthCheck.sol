// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract HealthCheck {
    string public message = "web3 University";

    function setMessage(string calldata nextMessage) external {
        message = nextMessage;
    }
}
