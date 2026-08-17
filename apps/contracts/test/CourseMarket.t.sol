// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {UNIToken} from "../src/UNIToken.sol";
import {CourseMarket} from "../src/CourseMarket.sol";

contract CourseMarketTest is Test {
    UNIToken internal uni;
    CourseMarket internal market;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal teacher = makeAddr("teacher");
    address internal student = makeAddr("student");
    uint256 internal constant COURSE_ID = 1;
    uint256 internal constant PRICE = 4 ether;

    function setUp() public {
        uni = new UNIToken(treasury);
        market = new CourseMarket(address(uni), treasury, admin);

        vm.prank(treasury);
        uni.transfer(student, 100 ether);

        vm.prank(admin);
        market.createCourse(COURSE_ID, teacher, PRICE, keccak256("course-1-metadata"));
    }

    function testStudentCanApproveAndBuy() public {
        vm.startPrank(student);
        uni.approve(address(market), PRICE);
        market.buy(COURSE_ID);
        vm.stopPrank();

        assertTrue(market.hasPurchased(student, COURSE_ID));
        assertEq(uni.balanceOf(student), 96 ether);
        assertEq(uni.balanceOf(treasury), uni.totalSupply() - 96 ether);
    }

    function testBuyFailsWithoutAllowance() public {
        vm.prank(student);
        vm.expectRevert();
        market.buy(COURSE_ID);
    }

    function testCannotBuyTwice() public {
        vm.startPrank(student);
        uni.approve(address(market), PRICE * 2);
        market.buy(COURSE_ID);
        vm.expectRevert(CourseMarket.AlreadyPurchased.selector);
        market.buy(COURSE_ID);
        vm.stopPrank();
    }

    function testCannotBuyPausedCourse() public {
        vm.prank(admin);
        market.updateCourse(COURSE_ID, PRICE, bytes32(0), false);

        vm.startPrank(student);
        uni.approve(address(market), PRICE);
        vm.expectRevert(CourseMarket.CourseNotActive.selector);
        market.buy(COURSE_ID);
        vm.stopPrank();
    }

    function testNonOperatorCannotCreateCourse() public {
        vm.prank(student);
        vm.expectRevert();
        market.createCourse(2, teacher, PRICE, bytes32(0));
    }
}
