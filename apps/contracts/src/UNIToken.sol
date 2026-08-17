// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UNIToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 100_000_000 ether;

    error ZeroTreasury();

    constructor(address treasury) ERC20("UNI Token", "UNI") {
        if (treasury == address(0)) revert ZeroTreasury();
        _mint(treasury, INITIAL_SUPPLY);
    }
}
