import { erc20Abi, parseUnits, type Address } from "viem"
import type { ConnectedWallet } from "@privy-io/react-auth"

import { publicClient, getWalletClient } from "./chain"
import {
  quoterV2Abi,
  swapRouter02Abi,
  uniswapSepolia,
} from "@web3-school/contracts/uniswap"

export type SwapQuote = {
  amountIn: bigint
  quotedOut: bigint
  minimumOut: bigint
}

export type SwapDirection = {
  tokenIn: Address
  tokenOut: Address
  amountIn: string
  decimalsIn: number
  decimalsOut: number
}

/**
 * 获取兑换报价
 */
export async function getSwapQuote(input: SwapDirection): Promise<SwapQuote> {
  if (!input.amountIn || Number(input.amountIn) <= 0) {
    throw new Error("请输入大于 0 的数量")
  }

  const amountIn = parseUnits(input.amountIn, input.decimalsIn)

  const simulation = await publicClient.simulateContract({
    address: uniswapSepolia.quoterV2,
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        amountIn,
        fee: uniswapSepolia.fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  const quotedOut = simulation.result[0]
  const minimumOut = (quotedOut * 995n) / 1000n // 0.5% 滑点

  return {
    amountIn,
    quotedOut,
    minimumOut,
  }
}

/**
 * 检查并授权代币（如果不足）
 */
export async function ensureAllowance(
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<boolean> {
  const account = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [publicClient.account?.address ?? "0x0", spender],
  })

  return account >= amount
}

/**
 * 授权代币
 */
export async function approveToken(
  wallet: ConnectedWallet,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const walletClient = await getWalletClient(wallet)
  const account = walletClient.account
  if (!account) throw new Error("钱包账户不可用")

  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  })

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  })

  if (receipt.status !== "success") {
    throw new Error("代币授权失败")
  }

  return hash
}

/**
 * 执行兑换
 */
export async function executeSwap(input: {
  wallet: ConnectedWallet
  tokenIn: Address
  tokenOut: Address
  amountIn: string
  decimalsIn: number
  quote: SwapQuote
}): Promise<{ hash: `0x${string}`; receipt: any }> {
  const walletClient = await getWalletClient(input.wallet)
  const account = walletClient.account
  if (!account) throw new Error("钱包账户不可用")

  // 1. 检查授权
  const allowance = await publicClient.readContract({
    address: input.tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, uniswapSepolia.swapRouter02],
  })

  if (allowance < input.quote.amountIn) {
    // 授权
    const approveHash = await walletClient.writeContract({
      address: input.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [uniswapSepolia.swapRouter02, input.quote.amountIn],
    })

    const approveReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveHash,
      confirmations: 1,
    })

    if (approveReceipt.status !== "success") {
      throw new Error("代币授权失败")
    }
  }

  // 2. 执行兑换
  const simulation = await publicClient.simulateContract({
    account,
    address: uniswapSepolia.swapRouter02,
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        fee: uniswapSepolia.fee,
        recipient: account.address,
        amountIn: input.quote.amountIn,
        amountOutMinimum: input.quote.minimumOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })

  const hash = await walletClient.writeContract(simulation.request)

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  })

  if (receipt.status !== "success") {
    throw new Error("兑换交易失败")
  }

  return { hash, receipt }
}

/**
 * 格式化输出（用于显示）
 */
export function formatOutput(amount: bigint, decimals: number): string {
  const value = Number(amount) / 10 ** decimals
  return value.toFixed(decimals > 6 ? 4 : 6)
}

/**
 * 获取代币余额
 */
export async function getTokenBalance(
  token: Address,
  userAddress: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [userAddress],
  })
}
