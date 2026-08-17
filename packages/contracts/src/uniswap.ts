import { parseAbi, type Address } from "viem"

export const quoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
])

export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
])

export type UniswapSepoliaConfig = {
  factory: Address
  positionManager: Address
  swapRouter02: Address
  quoterV2: Address
  weth: Address
  ydMusdcPool: Address
  ydWethPool: Address
  fee: 3000
}

export const uniswapSepolia = {
  factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
  swapRouter02: "0x3bFA4769FB09eefC5a80d6E87C3B9C650f7Ae48E",
  quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  ydMusdcPool: "0x3ee267D0fF7D01586212E13bA8763BdB277bC8c2",
  ydWethPool: "0xB51A759f8354f6F647895aA7bEB4C9c262b94E71",
  fee: 3000,
} as const satisfies UniswapSepoliaConfig
