# 阶段 F：Uniswap 交易池

> 节点范围：45～48  
> 阶段目标：在 Ethereum Sepolia 建立 YD 流动性并完成兑换  
> 预计用时：6～8 小时

## 使用前的地址复核

以下是编写手册时使用的 Ethereum Sepolia V3 地址，执行当天必须再次从 [Uniswap 官方 Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/) 或官方仓库复核：

```text
V3 Factory                 0x0227628f3F023bb0B980b67D528571c95c6DaC1c
NonfungiblePositionManager 0x1238536071E1c677A632429e3655c799b22cDA52
SwapRouter02               0x3bFA4769FB09eefC5a80d6E87C3B9C650f7Ae48E
QuoterV2                   0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3
WETH9                      0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
```

如果官方页面不同，以官方页面为准，并只在 `packages/contracts/src/uniswap.ts` 更新一次。

## 节点 45：理解 AMM、价格、滑点和 V3 流动性（1～1.5 小时）

### 本节点目标

在投入测试代币前理解池中价格如何形成，以及为什么不能随便填写数量。

### 当前节点使用的技术能力

- **AMM**：由池中资产关系提供报价，不依赖中心化订单簿。
- **Liquidity Provider**：按价格范围存入两种资产并获得手续费份额。
- **V3 concentrated liquidity**：资金只在指定价格区间工作。
- **Slippage protection**：交易前设置最低可接受输出。
- **Token ordering**：池内部按地址排序为 token0/token1，与 UI 输入顺序无关。

### 本项目初始价格

建议测试价格：

```text
1 YD = 0.1 mUSDC
1 WETH = 20,000 YD（仅测试展示，不代表真实价值）
```

第一池可以投入：

```text
10,000 YD + 1,000 mUSDC
```

第二池资金较少即可：

```text
2,000 YD + 0.1 WETH
```

实际存入比例由创建池时设置的初始价格和当前价格决定。不要把测试价格描述为市场公允价值。

### 操作步骤

画出两种价格方向：

```text
mUSDC per YD = 0.1
YD per mUSDC = 10
```

练习 0.5% 滑点：报价 100 YD，最低输出为：

```text
100 * (1 - 0.005) = 99.5 YD
```

整数计算：

```ts
const minimumOut = (quotedOut * 995n) / 1000n;
```

### 常见错误

- 忽略 YD 18 位、mUSDC 6 位精度，初始价格会差 10^12 倍。
- 把地址顺序当 token0/token1 顺序，池价格倒置。
- amountOutMinimum 设 0，失去滑点保护。

### 验收清单

- [ ] 能解释 LP 与交易者的区别。
- [ ] 能计算 0.5% 最低输出。
- [ ] 明白测试价格不代表真实价值。

### Git 提交建议

无代码提交。

## 节点 46：创建 YD/MockUSDC 池并添加流动性（1.5～2 小时）

### 本节点目标

使用 Uniswap V3 界面完成第一个池，降低新人直接构造 tick/sqrtPrice 的错误概率。

### 当前节点使用的技术能力

- **ERC-20 approval to PositionManager**：允许 PositionManager 转入 LP 资产。
- **Pool initialization**：第一次创建时确定初始价格。
- **LP NFT**：V3 流动性仓位本身是 NFT。
- **Testnet UI inspection**：连接 Sepolia 并导入自定义代币地址。

### 操作步骤

1. 连接持有 YD 和 mUSDC 的测试钱包，确认网络是 Ethereum Sepolia。
2. 在 Etherscan 检查 YD、MockUSDC 合约地址与部署记录。
3. 如果钱包没有 mUSDC，调用 `faucet()`：

```bash
cast send <MUSDC_ADDRESS> "faucet()" \
  --private-key "$TEST_USER_PRIVATE_KEY" \
  --rpc-url "$SEPOLIA_RPC_URL"
```

4. treasury 向 LP 钱包转入 10,000 YD。
5. 打开 Uniswap 官方界面，打开 Testnet 模式，选择 Sepolia。
6. 导入 YD 和 mUSDC 合约地址，仔细核对 symbol/decimals。
7. 选择 0.3% fee tier。
8. 初始价格填写 `1 YD = 0.1 mUSDC`。
9. 为第一次学习选择 Full Range；它资本效率较低，但不容易因价格出范围而停止交易。
10. 分别批准 YD 和 mUSDC，然后创建仓位。
11. 保存 pool 地址、position tokenId 和创建交易 hash。

如果官方 UI 不支持目标测试网，不要使用未知第三方界面；改用官方 NonfungiblePositionManager，并按官方 SDK 计算 `sqrtPriceX96` 和 tick。此时暂停节点，先在 Anvil fork 模拟。

### 验证

```bash
cast call <V3_FACTORY> \
  "getPool(address,address,uint24)(address)" \
  <YD_ADDRESS> <MUSDC_ADDRESS> 3000 \
  --rpc-url "$SEPOLIA_RPC_URL"
```

返回值不得为零地址。将公开信息加入 `packages/contracts/src/uniswap.ts`：

```ts
export const uniswapSepolia = {
  factory: "0x0227...",
  positionManager: "0x1238...",
  swapRouter02: "0x3bFA...",
  quoterV2: "0xEd1f...",
  weth: "0xfFf9...",
  ydMusdcPool: "0x...",
  fee: 3000,
} as const;
```

### 常见错误

- Token import 警告是正常风险提示，但必须核对合约地址。
- 初始价格一旦设置错误，简单补资金不能恢复；测试池应重新分析而不是盲目交易。
- LP NFT 不要发送到不支持 ERC-721 的地址。

### 验收清单

- [ ] Factory 返回非零 pool 地址。
- [ ] 池中有 liquidity。
- [ ] 初始价格量级正确。
- [ ] 记录了 LP NFT 和交易 hash。

### Git 提交建议

```bash
git add packages/contracts/src/uniswap.ts
git commit -m "chore(contracts): record sepolia YD liquidity"
```

## 节点 47：创建 YD/WETH 池并验证兑换（1.5～2 小时）

### 本节点目标

把 Sepolia ETH 包装成 WETH，创建 YD/WETH 池并进行小额测试。

### 当前节点使用的技术能力

- **WETH**：把原生 ETH 包装成 ERC-20，方便 AMM 按统一接口处理。
- **payable call**：调用 `deposit()` 时附带 ETH value。
- **Small-amount smoke test**：先用极小金额验证方向和精度。

### 操作步骤

包装 0.1 Sepolia ETH：

```bash
cast send <WETH_ADDRESS> "deposit()" \
  --value 0.1ether \
  --private-key "$LP_PRIVATE_KEY" \
  --rpc-url "$SEPOLIA_RPC_URL"
```

确认：

```bash
cast call <WETH_ADDRESS> "balanceOf(address)(uint256)" <LP_ADDRESS> \
  --rpc-url "$SEPOLIA_RPC_URL"
```

按照节点 46 的安全流程创建 0.3% YD/WETH Full Range 仓位。初始展示价格 `0.1 WETH = 2,000 YD`。

使用 Uniswap 官方 Swap 界面做极小测试：

```text
0.001 WETH -> YD
少量 YD -> WETH
```

### 原理说明

要求写“ETH → YD”时，底层池实际上是 WETH。前端第一版可以明确显示“先包装 ETH，再兑换”；后期再通过 Universal Router 合并交互。

### 常见错误

- 把全部测试 ETH 包装，钱包没有 Gas：至少保留足够 Sepolia ETH。
- WETH 地址错误：假代币可以骗取授权，必须从官方部署资料核对。

### 验收清单

- [ ] LP 钱包仍保留 Gas ETH。
- [ ] YD/WETH pool 非零且有 liquidity。
- [ ] 双向小额兑换成功。

### Git 提交建议

```bash
git add packages/contracts/src/uniswap.ts
git commit -m "chore(contracts): record sepolia YD WETH pool"
```

## 节点 48：实现前端 Quote 与 Swap 页面（1.5～2 小时）

### 本节点目标

在 `/swap` 展示报价、滑点、授权和 SwapRouter02 交易状态。

### 当前节点使用的技术能力

- **QuoterV2 simulation**：调用报价合约计算当前输出，不把报价当承诺。
- **SwapRouter02 `exactInputSingle`**：单池、单跳兑换。
- **Slippage minimum**：把最低输出写入链上参数。
- **Allowance reuse**：只有输入 token allowance 不足才发 approve。

### 关键 ABI

创建 `packages/contracts/src/uniswap.ts`：

```ts
import { parseAbi } from "viem";

export const quoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
```

报价：

```ts
const quote = await publicClient.simulateContract({
  address: uniswapSepolia.quoterV2,
  abi: quoterV2Abi,
  functionName: "quoteExactInputSingle",
  args: [{
    tokenIn,
    tokenOut,
    amountIn: parseUnits(inputAmount, inputDecimals),
    fee: 3000,
    sqrtPriceLimitX96: 0n,
  }],
});
const quotedOut = quote.result[0];
const minimumOut = (quotedOut * 995n) / 1000n;
```

先检查/授权 tokenIn 给 SwapRouter02，再交易：

```ts
const request = await publicClient.simulateContract({
  account,
  address: uniswapSepolia.swapRouter02,
  abi: swapRouter02Abi,
  functionName: "exactInputSingle",
  args: [{
    tokenIn,
    tokenOut,
    fee: 3000,
    recipient: account.address,
    amountIn,
    amountOutMinimum: minimumOut,
    sqrtPriceLimitX96: 0n,
  }],
});
const hash = await walletClient.writeContract(request.request);
```

报价显示：输入、预计输出、最低输出、0.3% pool fee、0.5% slippage、Gas 另计。

### 常见错误

- Quoter 不是普通 view 函数，使用 simulate/call，不发送真实交易。
- 报价后等待太久，价格变化会造成 slippage revert；提供刷新报价按钮。
- mUSDC 使用 6 位，YD/WETH 使用 18 位。

### 验收清单

- [ ] 非法/空输入不报价。
- [ ] approve spender 是官方 SwapRouter02。
- [ ] amountOutMinimum 不为 0。
- [ ] 交易成功后刷新两种余额。
- [ ] 页面明确 mUSDC 是测试代币。

### Git 提交建议

```bash
git add apps/web/src/routes/swap.tsx packages/contracts/src/uniswap.ts
git commit -m "feat(web): add protected Uniswap V3 swap"
```

## 阶段验收

分别用 10 mUSDC、0.001 WETH 兑换 YD，再用 YD 反向兑换。记录每笔 hash、报价、最低输出和实际输出，解释差异来源。

通过后进入[阶段 G](./07-Chainlink预言机.md)。

## 完整实现附录

### A. `packages/contracts/src/uniswap.ts`

```ts
import { parseAbi, type Address } from "viem";

export const quoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);

export type UniswapSepoliaConfig = {
  factory: Address;
  positionManager: Address;
  swapRouter02: Address;
  quoterV2: Address;
  weth: Address;
  ydMusdcPool: Address;
  ydWethPool: Address;
  fee: 3000;
};

export const uniswapSepolia = {
  factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
  swapRouter02: "0x3bFA4769FB09eefC5a80d6E87C3B9C650f7Ae48E",
  quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  ydMusdcPool: "0x替换为实际YD_MUSDC池地址",
  ydWethPool: "0x替换为实际YD_WETH池地址",
  fee: 3000,
} as const satisfies UniswapSepoliaConfig;
```

最后两个占位符必须在创建池后替换。替换前该文件不会通过 `Address` 类型检查，这是刻意的失败保护。

### B. `apps/web/src/lib/swap.ts`

```ts
import { erc20Abi, parseUnits, type Address } from "viem";

import { publicClient, getWalletClient } from "./chain";
import {
  quoterV2Abi,
  swapRouter02Abi,
  uniswapSepolia,
} from "@web3-school/contracts/uniswap";
import type { ConnectedWallet } from "@privy-io/react-auth";

export type SwapQuote = {
  amountIn: bigint;
  quotedOut: bigint;
  minimumOut: bigint;
};

export async function getSwapQuote(input: {
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  inputDecimals: number;
}): Promise<SwapQuote> {
  if (!input.amount || Number(input.amount) <= 0) {
    throw new Error("请输入大于 0 的数量");
  }

  const amountIn = parseUnits(input.amount, input.inputDecimals);
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
  });

  const quotedOut = simulation.result[0];
  return {
    amountIn,
    quotedOut,
    minimumOut: (quotedOut * 995n) / 1000n,
  };
}

export async function executeSwap(input: {
  wallet: ConnectedWallet;
  tokenIn: Address;
  tokenOut: Address;
  quote: SwapQuote;
}) {
  const walletClient = await getWalletClient(input.wallet);
  const account = walletClient.account;
  if (!account) throw new Error("钱包账户不可用");

  const allowance = await publicClient.readContract({
    address: input.tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, uniswapSepolia.swapRouter02],
  });

  if (allowance < input.quote.amountIn) {
    const approvalHash = await walletClient.writeContract({
      address: input.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [uniswapSepolia.swapRouter02, input.quote.amountIn],
    });
    const approvalReceipt = await publicClient.waitForTransactionReceipt({
      hash: approvalHash,
      confirmations: 1,
    });
    if (approvalReceipt.status !== "success") {
      throw new Error("代币授权失败");
    }
  }

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
  });

  const hash = await walletClient.writeContract(simulation.request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  });
  if (receipt.status !== "success") throw new Error("兑换交易失败");
  return { hash, receipt };
}
```

### C. Swap 页面状态机

页面不能只放一个“兑换”按钮。至少维护：

```ts
type SwapStatus =
  | "idle"
  | "quoting"
  | "quoted"
  | "approving"
  | "swapping"
  | "confirming"
  | "success"
  | "error";
```

核心提交逻辑：

```ts
async function submitSwap() {
  if (!wallet || !quote) return;
  setStatus("swapping");
  setError(null);
  try {
    const result = await executeSwap({ wallet, tokenIn, tokenOut, quote });
    setTransactionHash(result.hash);
    setStatus("success");
    await Promise.all([refetchInputBalance(), refetchOutputBalance()]);
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "兑换失败");
    setStatus("error");
  }
}
```

报价与交易之间可能发生价格变化，所以用户点击兑换时仍必须重新 `simulateContract`，不能直接发送旧报价请求。

### D. 池地址验证

```bash
cast call "$V3_FACTORY" \
  "getPool(address,address,uint24)(address)" \
  "$YD_ADDRESS" "$MUSDC_ADDRESS" 3000 \
  --rpc-url "$SEPOLIA_RPC_URL"

cast call "$V3_FACTORY" \
  "getPool(address,address,uint24)(address)" \
  "$YD_ADDRESS" "$WETH_ADDRESS" 3000 \
  --rpc-url "$SEPOLIA_RPC_URL"
```

两次结果都必须非零，并与 `uniswapSepolia` 中记录的池地址一致。
