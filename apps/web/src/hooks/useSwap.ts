import { useState, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"
import type { Address } from "viem"
import { formatUnits } from "viem"

import { getSwapQuote, executeSwap, getTokenBalance } from "@/lib/swap"
import { publicClient, getWalletClient } from "@/lib/chain"
import { addresses, CHAIN_ID } from "@web3-school/contracts"
import { erc20Abi } from "viem"

export type SwapState =
  | "idle"
  | "quoting"
  | "quoted"
  | "approving"
  | "swapping"
  | "confirming"
  | "success"
  | "error"

export function useSwap() {
  const { wallets } = useWallets()
  const [state, setState] = useState<SwapState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<any>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [balanceIn, setBalanceIn] = useState<bigint>(0n)
  const [balanceOut, setBalanceOut] = useState<bigint>(0n)

  const wallet = wallets?.[0]

  // 刷新余额
  const refreshBalances = useCallback(
    async (tokenIn: Address, tokenOut: Address, userAddress: Address) => {
      if (!userAddress) return
      try {
        const [inBal, outBal] = await Promise.all([
          getTokenBalance(tokenIn, userAddress),
          getTokenBalance(tokenOut, userAddress),
        ])
        setBalanceIn(inBal)
        setBalanceOut(outBal)
      } catch (e) {
        console.error("刷新余额失败:", e)
      }
    },
    [],
  )

  // 获取报价
  const fetchQuote = useCallback(
    async (params: {
      tokenIn: Address
      tokenOut: Address
      amountIn: string
      decimalsIn: number
      decimalsOut: number
    }) => {
      if (!params.amountIn || Number(params.amountIn) <= 0) {
        setQuote(null)
        setState("idle")
        return
      }

      setState("quoting")
      setError(null)

      try {
        const result = await getSwapQuote(params)
        setQuote(result)
        setState("quoted")
        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取报价失败")
        setState("error")
        throw err
      }
    },
    [],
  )

  // 执行兑换
  const swap = useCallback(
    async (params: {
      tokenIn: Address
      tokenOut: Address
      amountIn: string
      decimalsIn: number
      decimalsOut: number
    }) => {
      if (!wallet) {
        setError("请先连接钱包")
        return
      }

      if (!quote) {
        setError("请先获取报价")
        return
      }

      setState("swapping")
      setError(null)
      setTxHash(null)

      try {
        const result = await executeSwap({
          wallet,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          decimalsIn: params.decimalsIn,
          quote,
        })

        setTxHash(result.hash)
        setState("success")

        // 刷新余额
        const account = (await getWalletClient(wallet)).account
        if (account) {
          await refreshBalances(
            params.tokenIn,
            params.tokenOut,
            account.address,
          )
        }

        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : "兑换失败")
        setState("error")
        throw err
      }
    },
    [wallet, quote, refreshBalances],
  )

  // 重置状态
  const reset = useCallback(() => {
    setState("idle")
    setError(null)
    setQuote(null)
    setTxHash(null)
  }, [])

  return {
    state,
    error,
    quote,
    txHash,
    balanceIn,
    balanceOut,
    isConnected: !!wallet,
    isLoading:
      state === "quoting" ||
      state === "approving" ||
      state === "swapping" ||
      state === "confirming",
    fetchQuote,
    swap,
    reset,
    refreshBalances,
  }
}
