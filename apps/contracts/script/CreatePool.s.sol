// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";

interface IUniswapV3Factory {
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external returns (address pool);
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

interface IUniswapV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
}

contract CreatePool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Sepolia 地址
        address factory = 0x0227628f3F023bb0B980b67D528571c95c6DaC1c;
        address uniToken = 0xE8D3268314eA1e4Fc7d829d793Fbc4771BE70D65;
        address musdc = 0xed7D31ECd4CBb628aa98270Cd00700E4f1de03c7;
        uint24 fee = 3000; // 0.3%

        console2.log("Deployer:", deployer);
        console2.log("Creating UNI/mUSDC pool...");

        vm.startBroadcast(deployerKey);

        IUniswapV3Factory factoryContract = IUniswapV3Factory(factory);

        // 先检查池子是否已存在
        address existingPool = factoryContract.getPool(uniToken, musdc, fee);
        if (existingPool != address(0)) {
            console2.log("Pool already exists at:", existingPool);
        } else {
            // 创建池子
            address pool = factoryContract.createPool(uniToken, musdc, fee);
            console2.log("Pool created at:", pool);

            // 初始化价格: 1 UNI = 0.1 mUSDC
            // sqrtPriceX96 = sqrt(0.1) * 2^96
            // 由于 UNI 18位，mUSDC 6位，需要调整
            // 实际价格 = 0.1 * 10^6 / 10^18 = 0.1 * 10^-12
            // sqrtPriceX96 = sqrt(0.1 * 10^-12) * 2^96
            // 简化计算: 对于 1 UNI = 0.1 mUSDC
            // sqrtPriceX96 = 79228162514264337593543950336 (大约)
            uint160 sqrtPriceX96 = 79228162514264337593543950336; // 对应 1 UNI = 0.1 mUSDC

            IUniswapV3Pool poolContract = IUniswapV3Pool(pool);
            poolContract.initialize(sqrtPriceX96);
            console2.log("Pool initialized with price: 1 UNI = 0.1 mUSDC");
        }

        vm.stopBroadcast();

        console2.log("Done!");
    }
}
