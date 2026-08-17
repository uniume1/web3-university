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

contract CreateWETHPool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Sepolia 地址
        address factory = 0x0227628f3F023bb0B980b67D528571c95c6DaC1c;
        address uniToken = 0xE8D3268314eA1e4Fc7d829d793Fbc4771BE70D65;
        address weth = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
        uint24 fee = 3000; // 0.25%

        console2.log("Deployer:", deployer);
        console2.log("Creating UNI/WETH pool...");

        vm.startBroadcast(deployerKey);

        IUniswapV3Factory factoryContract = IUniswapV3Factory(factory);

        // 检查池子是否已存在
        address existingPool = factoryContract.getPool(uniToken, weth, fee);
        if (existingPool != address(0)) {
            console2.log("Pool already exists at:", existingPool);
        } else {
            // 创建池子
            address pool = factoryContract.createPool(uniToken, weth, fee);
            console2.log("Pool created at:", pool);

            // 初始化价格: 1 WETH = 20000 UNI
            // sqrtPriceX96 = sqrt(20000) * 2^96
            uint160 sqrtPriceX96 = 55340232221128654866; // 对应 1 WETH = 20000 UNI
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
            console2.log("Pool initialized with price: 1 WETH = 20000 UNI");
        }

        vm.stopBroadcast();
        console2.log("Done!");
    }
}
