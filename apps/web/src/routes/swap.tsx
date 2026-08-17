import { useState, useEffect, useCallback } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { formatUnits, parseUnits } from "viem"
import { addresses, CHAIN_ID } from "@web3-school/contracts"
import { ydTokenAbi, courseMarketAbi } from "@web3-school/contracts"

import { publicClient } from "@/lib/chain"
import { useSwap } from "@/hooks/useSwap"
import { formatOutput } from "@/lib/swap"

// Token 配置
const TOKENS = {
  UNI: {
    address: addresses[CHAIN_ID].ydToken,
    symbol: "UNI",
    decimals: 18,
    name: "UNIToken",
  },
  mUSDC: {
    address: addresses[CHAIN_ID].mUSDC,
    symbol: "mUSDC",
    decimals: 6,
    name: "Mock USDC",
  },
  WETH: {
    address: addresses[CHAIN_ID].weth,
    symbol: "WETH",
    decimals: 18,
    name: "Wrapped Ether",
  },
}

export const Route = createFileRoute("/swap")({
  component: SwapPage,
})

function SwapPage() {
  const { authenticated, user } = usePrivy()
  const { wallets } = useWallets()
  const wallet = wallets?.[0]

  const {
    state,
    error,
    quote,
    txHash,
    isConnected,
    isLoading,
    fetchQuote,
    swap,
    reset,
    refreshBalances,
    balanceIn,
    balanceOut,
  } = useSwap()

  // 选中的代币
  const [tokenIn, setTokenIn] = useState<keyof typeof TOKENS>("UNI")
  const [tokenOut, setTokenOut] = useState<keyof typeof TOKENS>("mUSDC")
  const [amountIn, setAmountIn] = useState("")
  const [slippage, setSlippage] = useState(0.5)

  const selectedIn = TOKENS[tokenIn]
  const selectedOut = TOKENS[tokenOut]
  const userAddress = wallet?.address as `0x${string}` | undefined

  // 检查授权状态
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [needsApproval, setNeedsApproval] = useState(false)

  const checkAllowance = useCallback(async () => {
    if (!userAddress || !quote) return
    try {
      const result = await publicClient.readContract({
        address: selectedIn.address,
        abi: ydTokenAbi,
        functionName: "allowance",
        args: [userAddress, addresses[CHAIN_ID].swapRouter02],
      })
      setAllowance(result)
      setNeedsApproval(result < quote.amountIn)
    } catch (e) {
      console.error("检查授权失败:", e)
    }
  }, [userAddress, quote, selectedIn.address])

  // 刷新余额
  useEffect(() => {
    if (userAddress) {
      refreshBalances(selectedIn.address, selectedOut.address, userAddress)
    }
  }, [userAddress, selectedIn, selectedOut, refreshBalances])

  // 获取报价
  useEffect(() => {
    if (amountIn && Number(amountIn) > 0) {
      fetchQuote({
        tokenIn: selectedIn.address,
        tokenOut: selectedOut.address,
        amountIn,
        decimalsIn: selectedIn.decimals,
        decimalsOut: selectedOut.decimals,
      })
    } else {
      reset()
    }
  }, [amountIn, selectedIn, selectedOut, fetchQuote, reset])

  // 检查授权
  useEffect(() => {
    if (quote) {
      checkAllowance()
    }
  }, [quote, checkAllowance])

  // 格式化金额显示
  const formatAmount = (amount: bigint, decimals: number) => {
    if (!amount) return "0"
    return formatUnits(amount, decimals)
  }

  // 交换代币方向
  const swapDirection = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn("")
    reset()
  }

  // 执行兑换（含授权）
  const handleSwap = async () => {
    if (!wallet || !quote) return

    try {
      // 如果需要授权，先授权
      if (needsApproval) {
        // 授权逻辑可以放在这里，或者由 useSwap 自动处理
      }
      await swap({
        tokenIn: selectedIn.address,
        tokenOut: selectedOut.address,
        amountIn,
        decimalsIn: selectedIn.decimals,
        decimalsOut: selectedOut.decimals,
      })
    } catch (err) {
      console.error("兑换失败:", err)
    }
  }

  // 获取按钮文本
  const getButtonText = () => {
    if (!authenticated) return "请先登录"
    if (!isConnected) return "请先连接钱包"
    if (!amountIn || Number(amountIn) <= 0) return "输入兑换数量"
    if (isLoading) {
      if (state === "approving") return "授权中..."
      if (state === "swapping") return "兑换中..."
      if (state === "confirming") return "确认中..."
      return "处理中..."
    }
    if (needsApproval) return "授权 " + selectedIn.symbol
    return "兑换"
  }

  const isDisabled =
    !authenticated ||
    !isConnected ||
    !amountIn ||
    Number(amountIn) <= 0 ||
    isLoading ||
    state === "success"

  return (
    <main className="container mx-auto max-w-md px-4 py-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">兑换</h1>

        {/* 代币输入 */}
        <div className="mb-4 rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">卖出</span>
            <span className="text-sm text-gray-500">
              余额: {formatAmount(balanceIn, selectedIn.decimals)}{" "}
              {selectedIn.symbol}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <input
              type="number"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-transparent text-2xl outline-none"
              disabled={isLoading}
            />
            <TokenSelect
              value={tokenIn}
              onChange={setTokenIn}
              tokens={Object.keys(TOKENS) as (keyof typeof TOKENS)[]}
              exclude={tokenOut}
            />
          </div>
        </div>

        {/* 交换方向按钮 */}
        <button
          onClick={swapDirection}
          className="mx-auto my-2 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        >
          ↓
        </button>

        {/* 代币输出 */}
        <div className="mb-4 rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">买入</span>
            <span className="text-sm text-gray-500">
              余额: {formatAmount(balanceOut, selectedOut.decimals)}{" "}
              {selectedOut.symbol}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex-1 text-2xl">
              {quote
                ? formatAmount(quote.quotedOut, selectedOut.decimals)
                : "0.0"}
            </div>
            <TokenSelect
              value={tokenOut}
              onChange={setTokenOut}
              tokens={Object.keys(TOKENS) as (keyof typeof TOKENS)[]}
              exclude={tokenIn}
            />
          </div>
        </div>

        {/* 兑换信息 */}
        {quote && state === "quoted" && (
          <div className="mb-4 space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">价格</span>
              <span>
                1 {selectedIn.symbol} ≈{" "}
                {formatOutput(quote.quotedOut, selectedOut.decimals)}{" "}
                {selectedOut.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">滑点</span>
              <span>{slippage}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">最少收到</span>
              <span>
                {formatAmount(quote.minimumOut, selectedOut.decimals)}{" "}
                {selectedOut.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">费用</span>
              <span>0.3%</span>
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            ❌ {error}
          </div>
        )}

        {/* 成功信息 */}
        {state === "success" && txHash && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
            ✅ 兑换成功！
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-blue-500 underline"
            >
              查看交易
            </a>
          </div>
        )}

        {/* 兑换按钮 */}
        <button
          onClick={handleSwap}
          disabled={isDisabled}
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {getButtonText()}
        </button>

        {/* 连接钱包提示 */}
        {!authenticated && (
          <p className="mt-4 text-center text-sm text-gray-500">
            请先登录 Privy
          </p>
        )}
      </div>
    </main>
  )
}

// 代币选择组件
function TokenSelect({
  value,
  onChange,
  tokens,
  exclude,
}: {
  value: keyof typeof TOKENS
  onChange: (value: keyof typeof TOKENS) => void
  tokens: (keyof typeof TOKENS)[]
  exclude?: keyof typeof TOKENS
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as keyof typeof TOKENS)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium"
    >
      {tokens
        .filter((t) => t !== exclude)
        .map((key) => (
          <option key={key} value={key}>
            {TOKENS[key].symbol}
          </option>
        ))}
    </select>
  )
}
