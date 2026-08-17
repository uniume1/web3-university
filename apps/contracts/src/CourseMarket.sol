// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title 课程市场
/// @notice 由运营方维护课程信息，并记录用户的课程购买状态
contract CourseMarket is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice 允许运营人员创建和更新课程的角色
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice 链上保存的课程信息
    struct Course {
        /// @notice 课程讲师地址
        address teacher;
        /// @notice 课程价格，以 UNI Token 的最小单位计价
        uint256 price;
        /// @notice 课程元数据的哈希，用于校验链下课程信息
        bytes32 metadataHash;
        /// @notice 课程当前是否允许购买
        bool active;
        /// @notice 区分未创建课程与默认值课程
        bool exists;
    }

    /// @notice 购买课程时使用的 UNI Token
    IERC20 public immutable uniToken;
    /// @notice 接收课程销售收入的资金库地址
    address public immutable treasury;
    /// @notice 课程 ID 到课程信息的映射
    mapping(uint256 => Course) public courses;
    /// @notice 用户地址、课程 ID 到购买状态的映射
    mapping(address => mapping(uint256 => bool)) public purchased;

    error ZeroAddress();
    error InvalidCourse();
    error CourseAlreadyExists();
    error CourseNotActive();
    error AlreadyPurchased();

    event CourseCreated(uint256 indexed courseId, address indexed teacher, uint256 price, bytes32 metadataHash);
    event CourseUpdated(uint256 indexed courseId, uint256 price, bytes32 metadataHash, bool active);
    event CoursePurchased(address indexed buyer, uint256 indexed courseId, uint256 price);

    /// @notice 初始化课程市场及其权限
    /// @param token UNI Token 合约地址
    /// @param treasury_ 接收课程销售收入的资金库地址
    /// @param admin 初始管理员地址，同时拥有运营角色
    constructor(address token, address treasury_, address admin) {
        if (token == address(0) || treasury_ == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        uniToken = IERC20(token);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    /// @notice 创建一门新课程，创建后默认启用
    /// @dev 仅拥有 OPERATOR_ROLE 的账户可调用，课程 ID 不允许重复使用
    /// @param courseId 课程唯一 ID，不能为 0
    /// @param teacher 课程讲师地址
    /// @param price 课程价格，以 UNI Token 的最小单位计价
    /// @param metadataHash 课程链下元数据的哈希
    function createCourse(uint256 courseId, address teacher, uint256 price, bytes32 metadataHash)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (courseId == 0 || teacher == address(0) || price == 0) {
            revert InvalidCourse();
        }
        if (courses[courseId].exists) {
            revert CourseAlreadyExists();
        }

        courses[courseId] =
            Course({teacher: teacher, price: price, metadataHash: metadataHash, active: true, exists: true});

        emit CourseCreated(courseId, teacher, price, metadataHash);
    }

    /// @notice 更新已有课程的价格、元数据和启用状态
    /// @dev 仅拥有 OPERATOR_ROLE 的账户可调用；讲师地址和课程 ID 不可修改
    /// @param courseId 要更新的课程 ID
    /// @param price 新课程价格，以 UNI Token 的最小单位计价
    /// @param metadataHash 新课程链下元数据的哈希
    /// @param active 更新后课程是否允许购买
    function updateCourse(uint256 courseId, uint256 price, bytes32 metadataHash, bool active)
        external
        onlyRole(OPERATOR_ROLE)
    {
        Course storage course = courses[courseId];
        if (!course.exists || price == 0) {
            revert InvalidCourse();
        }
        course.price = price;
        course.metadataHash = metadataHash;
        course.active = active;

        emit CourseUpdated(courseId, price, metadataHash, active);
    }

    function buy(uint256 courseId) external nonReentrant {
        Course memory course = courses[courseId];
        if (!course.exists || !course.active) {
            revert CourseNotActive();
        }
        if (purchased[msg.sender][courseId]) {
            revert AlreadyPurchased();
        }
        purchased[msg.sender][courseId] = true;
        uniToken.safeTransferFrom(msg.sender, treasury, course.price);

        emit CoursePurchased(msg.sender, courseId, course.price);
    }

    function hasPurchased(address buyer, uint256 courseId) external view returns (bool) {
        return purchased[buyer][courseId];
    }
}
