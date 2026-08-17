// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {UNIToken} from "../src/UNIToken.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract TokensTest is Test {
    address internal treasury = makeAddr("treasury");
    address internal student = makeAddr("student");

    function testYDInitialSupplyGoesToTreasury() public {
        UNIToken uni = new UNIToken(treasury);
        assertEq(uni.name(), "UNI Token");
        assertEq(uni.symbol(), "UNI");
        assertEq(uni.totalSupply(), 100_000_000 ether);
        assertEq(uni.balanceOf(treasury), uni.totalSupply());
    }

    function testYDRejectsZeroTreasury() public {
        vm.expectRevert(UNIToken.ZeroTreasury.selector);
        new UNIToken(address(0));
    }

    function testMockUSDCFaucetUsesSixDecimals() public {
        MockUSDC usdc = new MockUSDC(treasury);
        vm.prank(student);
        usdc.faucet();
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(student), 1_000 * 10 ** 6);
    }
}
