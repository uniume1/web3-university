// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function mint(
        MintParams calldata params
    )
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );
}

contract AddLiquidityFixed is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address uniToken = 0xE8D3268314eA1e4Fc7d829d793Fbc4771BE70D65;
        address musdc = 0xed7D31ECd4CBb628aa98270Cd00700E4f1de03c7;
        address positionManager = 0x1238536071E1c677A632429e3655c799b22cDA52;
        uint24 fee = 3000;

        // 数量: 1000 UNI + 100 mUSDC
        uint256 uniAmount = 1000 * 10 ** 18;
        uint256 musdcAmount = 100 * 10 ** 6;

        console2.log("Deployer:", deployer);
        console2.log("UNI amount:", uniAmount);
        console2.log("mUSDC amount:", musdcAmount);

        vm.startBroadcast(deployerKey);

        // 1. 授权
        console2.log("Approving UNI...");
        IERC20(uniToken).approve(positionManager, uniAmount);
        console2.log("Approving mUSDC...");
        IERC20(musdc).approve(positionManager, musdcAmount);

        // 2. 添加流动性
        console2.log("Adding liquidity...");

        // tick 范围: 包含当前 tick (0)，设置 -100 到 100
        // 注意：tick 间距为 60，所以需要是 60 的倍数
        int24 tickLower = -60;
        int24 tickUpper = 60;

        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: uniToken,
                token1: musdc,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: uniAmount,
                amount1Desired: musdcAmount,
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer,
                deadline: block.timestamp + 300
            });

        INonfungiblePositionManager(positionManager).mint(params);

        console2.log("Liquidity added successfully!");

        vm.stopBroadcast();
        console2.log("Done!");
    }
}
