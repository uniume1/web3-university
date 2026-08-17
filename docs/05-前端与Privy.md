# 阶段 E：前端与 Privy

> 节点范围：33～44  
> 阶段目标：完成登录、课程、购买、学习、个人中心、证书和最小后台  
> 预计用时：17～22 小时

## 节点 33：整理路由、布局和页面骨架（1～1.5 小时）

### 本节点目标

先建立所有业务页面入口和统一布局，不在首页组件中堆完整应用。

### 当前节点使用的技术能力

- **TanStack Router file-based routes**：文件名生成类型安全路由树。
- **Nested layout**：根路由统一承载 Header、主题和 Outlet。
- **Route pending/error state**：页面级处理加载和错误。

### 操作步骤

建立路由文件：

```text
apps/web/src/routes/courses.index.tsx
apps/web/src/routes/courses.$courseId.tsx
apps/web/src/routes/learn.$courseId.tsx
apps/web/src/routes/profile.tsx
apps/web/src/routes/swap.tsx
apps/web/src/routes/teacher.courses.tsx
apps/web/src/routes/admin.courses.tsx
```

通用骨架：

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/courses/")({
  component: CoursesPage,
  pendingComponent: () => <div>正在加载课程…</div>,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

function CoursesPage() {
  return <main className="container mx-auto px-4 py-8">课程列表</main>;
}
```

更新 Header，至少提供：首页、课程、兑换、个人中心。老师和管理员入口根据后端角色显示，但真正权限仍由后端检查。

### 验证

```bash
pnpm dev:web
pnpm check-types
```

逐个点击 URL，确认 routeTree 自动更新且刷新不 404。

### 常见错误

- `$courseId` 在 shell 中会展开变量，创建文件时用编辑器或对路径加单引号。
- 隐藏 Admin 菜单不等于授权，用户仍可手输 URL。

### 验收清单

- [ ] 七个页面均可访问。
- [ ] Header 导航正确。
- [ ] 页面有加载和错误占位。

### Git 提交建议

```bash
git add apps/web/src/routes apps/web/src/components/header.tsx
git commit -m "feat(web): add product route skeleton"
```

## 节点 34：接入 Privy 登录和嵌入式钱包（1.5～2 小时）

### 本节点目标

使用 Privy 登录，自动为没有钱包的用户创建 Ethereum 嵌入式钱包。

### 当前节点使用的技术能力

- **PrivyProvider**：向 React 组件提供认证和钱包上下文。
- **Progressive onboarding**：用户可先用邮箱登录，再获得钱包。
- **Embedded wallet**：私钥材料由 Privy 客户端安全体系管理，应用不接触明文私钥。

### 操作步骤

在 Privy Dashboard 创建 Development App，允许：

```text
http://localhost:3001
部署后的 Vercel 域名（上线时添加）
```

安装：

```bash
pnpm --filter web add @privy-io/react-auth viem
```

在 `packages/env/src/web.ts` 增加 `VITE_PRIVY_APP_ID` 非空校验。

更新 `apps/web/src/main.tsx`：

```tsx
import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";

root.render(
  <PrivyProvider
    appId={import.meta.env.VITE_PRIVY_APP_ID}
    config={{
      defaultChain: sepolia,
      supportedChains: [sepolia],
      loginMethods: ["email", "wallet", "google"],
      embeddedWallets: {
        ethereum: { createOnLogin: "users-without-wallets" },
      },
    }}
  >
    <RouterProvider router={router} />
  </PrivyProvider>,
);
```

登录按钮：

```tsx
import { usePrivy } from "@privy-io/react-auth";

export function LoginButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  if (!ready) return <button disabled>初始化钱包…</button>;
  return authenticated
    ? <button onClick={logout}>退出</button>
    : <button onClick={login}>登录</button>;
}
```

### 原理说明

必须等待 `ready`。否则初始化期间 `authenticated=false` 可能让页面闪烁成未登录状态。

### 验证

- 邮箱登录成功。
- 首次用户产生 Ethereum wallet。
- 刷新后 session 恢复。
- 退出后 protected UI 隐藏。

### 常见错误

- `Origin not allowed`：Dashboard 漏配 localhost 或端口。
- 把 Privy App Secret 写入 `VITE_`：Vite 会暴露给浏览器，立即删除并轮换。

### 验收清单

- [ ] App ID 在前端，Secret 只在后端。
- [ ] 未登录用户仍可看公开课程。
- [ ] 登录用户至少有一个钱包。

### Git 提交建议

```bash
git add apps/web packages/env pnpm-lock.yaml
git commit -m "feat(web): add privy authentication"
```

## 节点 35：建立 viem Public/Wallet Client（1.5～2 小时）

### 本节点目标

区分公共链读取与用户签名写入，并让 tRPC 自动带 Privy Access Token。

### 当前节点使用的技术能力

- **viem Public Client**：无需钱包即可读区块、合约和 receipt。
- **viem Wallet Client**：基于 Privy EIP-1193 Provider 请求用户签名。
- **EIP-1193**：钱包与 DApp 的标准 Provider 接口。
- **Authenticated tRPC link**：每次 API 请求加入 Bearer Token。

### 关键代码

创建 `apps/web/src/lib/chain.ts`：

```ts
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import type { ConnectedWallet } from "@privy-io/react-auth";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
});

export async function getWalletClient(wallet: ConnectedWallet) {
  await wallet.switchChain(sepolia.id);
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as Hex,
    chain: sepolia,
    transport: custom(provider),
  });
}
```

更新 `apps/web/src/utils/trpc.ts`：

```ts
import { getAccessToken } from "@privy-io/react-auth";

httpBatchLink({
  url: `${getServerUrl(env.VITE_SERVER_URL)}/trpc`,
  async headers() {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
})
```

### 原理说明

Public Client 使用项目 RPC，不代表用户身份；Wallet Client 使用当前 Privy 钱包签名。不要把后端部署私钥放 Wallet Client。

### 验证

```ts
await publicClient.getChainId(); // 11155111
await publicClient.getBlockNumber();
```

登录后打印钱包地址，但不打印 Provider 内部对象或 token。

### 验收清单

- [ ] Public Client Chain ID 为 11155111。
- [ ] 钱包会切换到 Sepolia。
- [ ] protected API 带 Access Token。

### Git 提交建议

```bash
git add apps/web/src/lib apps/web/src/utils/trpc.ts
git commit -m "feat(web): configure authenticated web3 clients"
```

## 节点 36：实现课程列表与课程详情（1.5～2 小时）

### 本节点目标

用 TanStack Query + tRPC 展示数据库课程。

### 当前节点使用的技术能力

- **Server state cache**：TanStack Query 管理加载、缓存、错误和刷新。
- **tRPC queryOptions**：从后端 Router 推导输入输出类型。
- **Route params**：详情页通过 `$courseId` 获取 UUID。

### 关键代码

课程列表：

```tsx
const result = useQuery(trpc.courses.list.queryOptions({
  page: 1,
  pageSize: 20,
}));

if (result.isLoading) return <CourseGridSkeleton />;
if (result.isError) return <ErrorState error={result.error} />;
if (!result.data.length) return <EmptyState title="暂无课程" />;
```

详情页：

```tsx
export const Route = createFileRoute("/courses/$courseId")({
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const course = useQuery(trpc.courses.byId.queryOptions({ id: courseId }));
  // 展示标题、老师、简介、章节、链上价格和购买按钮
}
```

### 验证

- active 课程显示。
- paused/draft 不显示。
- 无效 UUID 得到友好 400/NOT_FOUND 页面。
- Network 中没有 videoAssetId。

### 验收清单

- [ ] 有 loading/error/empty/success 四态。
- [ ] 不使用 mock 数组代替 API。
- [ ] 课程详情不泄露视频地址。

### Git 提交建议

```bash
git add apps/web/src/routes apps/web/src/components
git commit -m "feat(web): render course catalog"
```

## 节点 37：展示 YD 余额、价格和购买状态（1～1.5 小时）

### 本节点目标

从合约读取余额、allowance、课程状态和购买状态。

### 当前节点使用的技术能力

- **readContract**：通过 ABI 执行只读 `eth_call`。
- **BigInt**：无精度损失处理 uint256。
- **formatUnits**：把 18 位整数转换为用户可读字符串。

### 关键代码

```ts
const [balance, allowance, purchased, course] = await Promise.all([
  publicClient.readContract({
    address: addresses[11155111].ydToken,
    abi: ydTokenAbi,
    functionName: "balanceOf",
    args: [walletAddress],
  }),
  publicClient.readContract({
    address: addresses[11155111].ydToken,
    abi: ydTokenAbi,
    functionName: "allowance",
    args: [walletAddress, addresses[11155111].courseMarket],
  }),
  publicClient.readContract({
    address: addresses[11155111].courseMarket,
    abi: courseMarketAbi,
    functionName: "hasPurchased",
    args: [walletAddress, BigInt(chainCourseId)],
  }),
  publicClient.readContract({
    address: addresses[11155111].courseMarket,
    abi: courseMarketAbi,
    functionName: "courses",
    args: [BigInt(chainCourseId)],
  }),
]);
```

显示使用 `formatUnits(value, 18)`，比较使用 BigInt：

```ts
const canAfford = balance >= price;
const needsApproval = allowance < price;
```

### 常见错误

- `Number(balance)` 会丢精度。
- 数据库价格只用于首屏，点击购买前必须重新读链上价格。

### 验收清单

- [ ] BigInt 不转换 Number。
- [ ] 余额不足有兑换入口。
- [ ] 已购买隐藏购买按钮。

### Git 提交建议

```bash
git add apps/web/src
git commit -m "feat(web): show onchain course purchase state"
```

## 节点 38：实现 approve 交易步骤（1.5～2 小时）

### 本节点目标

完成购买第 1/2 步，授权精确课程价格。

### 当前节点使用的技术能力

- **Contract simulation**：发送前由节点模拟，提前发现余额和参数错误。
- **Transaction hash**：钱包广播后的链上交易标识。
- **Receipt confirmation**：等待交易成功后再进入 buy。

### 关键代码

```ts
async function approveYD(price: bigint) {
  if (!wallet) throw new Error("请先登录");
  setStep("approving-wallet");
  const walletClient = await getWalletClient(wallet);
  const account = walletClient.account!;

  const simulation = await publicClient.simulateContract({
    account,
    address: addresses[11155111].ydToken,
    abi: ydTokenAbi,
    functionName: "approve",
    args: [addresses[11155111].courseMarket, price],
  });
  const hash = await walletClient.writeContract(simulation.request);
  setStep("approving-chain");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("YD 授权失败");
  setStep("approved");
  return hash;
}
```

UI 明确显示：

```text
1. 授权 YD：等待钱包 / 链上确认 / 完成
2. 购买课程：尚未开始
```

### 原理说明

推荐只授权当前价格，不用无限授权。无限授权交互少，但课程合约如果出现漏洞会扩大损失。

### 验收清单

- [ ] spender 是 CourseMarket。
- [ ] amount 使用最新链上 price。
- [ ] approve 失败不会调用 buy。
- [ ] 有 Etherscan 交易链接。

### Git 提交建议

```bash
git add apps/web/src
git commit -m "feat(web): add exact YD approval step"
```

## 节点 39：实现 buy、确认和后端验证（1.5～2 小时）

### 本节点目标

完成购买第 2/2 步，并让后端验证 receipt 后开放课程。

### 当前节点使用的技术能力

- **Sequential transaction state machine**：严格串行 approve → buy → verify。
- **Cache invalidation**：购买完成后刷新余额、购买状态和个人课程。
- **Backend settlement**：链上成功不等于数据库已经索引。

### 关键代码

```ts
const simulation = await publicClient.simulateContract({
  account,
  address: addresses[11155111].courseMarket,
  abi: courseMarketAbi,
  functionName: "buy",
  args: [BigInt(chainCourseId)],
});
const hash = await walletClient.writeContract(simulation.request);
const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  confirmations: 2,
});
if (receipt.status !== "success") throw new Error("课程购买失败");

await verifyPurchase.mutateAsync({ courseId, txHash: hash });
await queryClient.invalidateQueries();
```

刷新页面时如果 localStorage 有未完成 txHash，应读取 receipt 并恢复“链上成功，正在同步课程”状态。localStorage 只保存公开 hash，不保存 token 或签名。

### 常见错误

- 钱包显示成功就直接进入学习页：后端尚未验证，页面会 403。
- buy revert `AlreadyPurchased`：刷新链上购买状态，不要再次 approve。

### 验收清单

- [ ] 两笔交易状态独立。
- [ ] 等待 2 个 confirmations。
- [ ] 后端验证成功后才显示“已开通”。
- [ ] 刷新可恢复未完成状态。

### Git 提交建议

```bash
git add apps/web/src
git commit -m "feat(web): complete verified course purchase"
```

## 节点 40：实现学习页面与进度（1.5～2 小时）

### 本节点目标

已购买用户播放课程、切换章节并上报进度。

### 当前节点使用的技术能力

- **Protected query**：学习数据必须经过后端购买校验。
- **Debounce/throttle**：降低视频 timeupdate 高频请求。
- **Monotonic progress**：UI 与后端都不让进度倒退。

### 操作步骤

`/learn/$courseId` 调用 `learning.getCourse`。视频 URL 从响应获取并设置到 `<video controls>`；每 15～30 秒或章节结束上报，而不是每个 `timeupdate` 都请求。

```tsx
const onProgress = throttle((percent: number) => {
  updateProgress.mutate({ courseId, progress: Math.floor(percent) });
}, 15_000);
```

页面显示：章节、当前进度、完成阈值、测验状态、领取证书入口。

### 验收清单

- [ ] 未购买得到明确提示而不是空白页。
- [ ] 请求频率受控。
- [ ] 刷新后进度恢复。
- [ ] 达到条件后显示 completed。

### Git 提交建议

```bash
git add apps/web/src/routes/learn.* apps/web/src/components
git commit -m "feat(web): add protected course learning"
```

## 节点 41：实现评论区（1～1.5 小时）

### 本节点目标

展示分页评论，已购买学生可以发表和删除自己的评论。

### 当前节点使用的技术能力

- **Mutation optimistic UX**：提交期间禁用按钮，成功后刷新列表。
- **Accessible form**：label、错误提示和 disabled 状态明确。
- **XSS-safe rendering**：把评论当纯文本。

### 关键交互

```tsx
const createComment = useMutation(trpc.comments.create.mutationOptions({
  onSuccess: async () => {
    setContent("");
    await queryClient.invalidateQueries({
      queryKey: trpc.comments.list.queryKey({ courseId }),
    });
  },
}));
```

不要使用：

```tsx
<div dangerouslySetInnerHTML={{ __html: comment.content }} />
```

### 验收清单

- [ ] 空评论不能提交。
- [ ] 1001 字符被前后端拒绝。
- [ ] 只有作者看到删除按钮，但后端仍验证作者。

### Git 提交建议

```bash
git add apps/web/src
git commit -m "feat(web): add course comments"
```

## 节点 42：实现个人中心和签名修改用户名（1.5～2 小时）

### 本节点目标

展示钱包、YD、已购课程和进度，并通过 EIP-712 修改用户名。

### 当前节点使用的技术能力

- **EIP-712 wallet signing**：用户确认结构化资料更新。
- **Client-side validation**：提前提示格式；最终规则仍由后端执行。
- **Profile aggregation**：一个页面组合链上余额和链下课程数据。

### 关键代码

先请求 nonce，再签名：

```ts
const proof = await usernameNonce.mutateAsync();
const walletClient = await getWalletClient(wallet);
const signature = await walletClient.signTypedData({
  account: walletClient.account!,
  domain: {
    name: "Web3 University Profile",
    version: "1",
    chainId: 11155111,
    verifyingContract: addresses[11155111].courseMarket,
  },
  types: {
    UpdateUsername: [
      { name: "wallet", type: "address" },
      { name: "username", type: "string" },
      { name: "nonce", type: "bytes32" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "UpdateUsername",
  message: {
    wallet: wallet.address,
    username,
    nonce: proof.nonce,
    deadline: BigInt(proof.deadline),
  },
});
await updateUsername.mutateAsync({ ...proof, username, signature });
```

### 验收清单

- [ ] 签名弹窗能看到目标用户名。
- [ ] 过期/重复 nonce 失败。
- [ ] 用户名成功后刷新 me query。
- [ ] 页面显示钱包缩写但支持复制完整地址。

### Git 提交建议

```bash
git add apps/web/src/routes/profile.tsx
git commit -m "feat(web): add signed profile updates"
```

## 节点 43：实现证书领取与展示（1.5～2 小时）

### 本节点目标

完成课程后请求证明，调用合约铸造，并在个人中心展示 NFT。

### 当前节点使用的技术能力

- **Server-authorized mint**：服务器只签证明，用户自己发交易。
- **Contract write with bytes signature**：把 EIP-712 签名作为参数交给证书合约。
- **Event reconciliation**：receipt 成功后解析 tokenId 并写数据库索引。

### 关键代码

```ts
const proof = await getCertificateProof.mutateAsync({ courseId });
const simulation = await publicClient.simulateContract({
  account,
  address: addresses[11155111].certificate,
  abi: certificateAbi,
  functionName: "claimCertificate",
  args: [
    BigInt(proof.chainCourseId),
    proof.tokenUri,
    proof.nonce,
    BigInt(proof.deadline),
    proof.signature,
  ],
});
const hash = await walletClient.writeContract(simulation.request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

后端 `certificates.confirm` 验证 `CertificateMinted` 事件后写 certificates 表。

### 常见错误

- 证明已过期：重新请求，不重试旧签名。
- 合约 `InvalidSigner`：检查 Server signer 地址是否有 `SIGNER_ROLE`。

### 验收清单

- [ ] 未完成不显示可用领取按钮。
- [ ] 重复领取得到明确提示。
- [ ] NFT 显示 tokenId、metadata 和 Etherscan 链接。
- [ ] 尝试 transfer 会失败。

### Git 提交建议

```bash
git add apps/web/src packages/api/src
git commit -m "feat(web): claim and display course certificates"
```

## 节点 44：实现老师与管理员最小后台（1.5～2 小时）

### 本节点目标

老师能提交课程，管理员能审核并引导完成链上上架。

### 当前节点使用的技术能力

- **Role-gated navigation**：根据 me.role 展示入口。
- **Form schema**：React Hook Form + Zod 复用字段约束。
- **Multi-system status UI**：区分数据库审核与链上确认状态。

### 操作步骤

```bash
pnpm --filter web add react-hook-form @hookform/resolvers
```

老师页：草稿列表、创建、编辑、提交审核。管理员页：pending_review 列表、驳回、批准；批准后展示链上 `createCourse` 参数和按钮；receipt 验证后调用 `confirmOnchainListing`。

状态标签必须区分：

```text
待审核 pending_review
等待链上交易 pending_chain
已上架 active
已暂停 paused
```

管理员合约调用仍需要连接拥有 OPERATOR_ROLE 的钱包；数据库 role 不能替代合约权限。

### 验收清单

- [ ] 老师只能编辑自己的草稿。
- [ ] 管理员批准不会直接标 active。
- [ ] 链上失败保持 pending_chain，可安全重试。
- [ ] 非管理员手输 URL 得到 FORBIDDEN。

### Git 提交建议

```bash
git add apps/web/src/routes packages/api/src
git commit -m "feat(app): add teacher and course review workflow"
```

## 阶段验收

```bash
pnpm check-types
pnpm check
pnpm build
```

用两个浏览器 Profile 测试管理员和学生，跑通：登录 → 查看课程 → approve → buy → 学习 → 评论 → 完成 → 领取证书。

通过后进入[阶段 F](./06-Uniswap交易池.md)。

## 完整实现附录

上文各节点强调交互边界，下面补齐容易被误认为完整文件的关键实现。文件名以当前项目为准。

### A. `apps/web/src/lib/chain.ts`

```ts
import type { ConnectedWallet } from "@privy-io/react-auth";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("VITE_SEPOLIA_RPC_URL is required");

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

export async function getWalletClient(wallet: ConnectedWallet) {
  await wallet.switchChain(sepolia.id);
  const provider = await wallet.getEthereumProvider();
  return createWalletClient({
    account: wallet.address as Address,
    chain: sepolia,
    transport: custom(provider),
  });
}
```

### B. `apps/web/src/utils/trpc.ts` 的认证 headers

保留现有 QueryClient，只把 `httpBatchLink` 配置改成：

```ts
import { getAccessToken } from "@privy-io/react-auth";

httpBatchLink({
  url: `${getServerUrl(env.VITE_SERVER_URL)}/trpc`,
  async headers() {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
```

不要把 Privy App Secret 放入 Vite 环境变量。

### C. `apps/web/src/hooks/use-course-purchase.ts`

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { addresses, CHAIN_ID, courseMarketAbi, ydTokenAbi } from "@web3-school/contracts";
import { erc20Abi, parseUnits } from "viem";

import { getWalletClient, publicClient } from "@/lib/chain";
import { trpc } from "@/utils/trpc";

export function useCoursePurchase(courseId: string, chainCourseId: bigint) {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const verify = useMutation(trpc.purchases.verify.mutationOptions());

  return useMutation({
    mutationFn: async () => {
      const wallet = wallets[0];
      if (!wallet) throw new Error("请先连接钱包");

      const client = await getWalletClient(wallet);
      const account = client.account;
      if (!account) throw new Error("钱包账户不可用");

      const price = parseUnits("4", 18);
      const allowance = await publicClient.readContract({
        address: addresses[CHAIN_ID].ydToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, addresses[CHAIN_ID].courseMarket],
      });

      if (allowance < price) {
        const approveHash = await client.writeContract({
          address: addresses[CHAIN_ID].ydToken,
          abi: ydTokenAbi,
          functionName: "approve",
          args: [addresses[CHAIN_ID].courseMarket, price],
        });
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
          confirmations: 1,
        });
        if (approveReceipt.status !== "success") {
          throw new Error("授权交易失败");
        }
      }

      const buyHash = await client.writeContract({
        address: addresses[CHAIN_ID].courseMarket,
        abi: courseMarketAbi,
        functionName: "buy",
        args: [chainCourseId],
      });
      const buyReceipt = await publicClient.waitForTransactionReceipt({
        hash: buyHash,
        confirmations: 2,
      });
      if (buyReceipt.status !== "success") throw new Error("购买交易失败");

      return verify.mutateAsync({ courseId, txHash: buyHash });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
```

课程价格不能长期硬编码为 `4`。正式页面应使用后端返回的 `priceYd`：

```ts
const price = BigInt(course.priceYd);
```

### D. `apps/web/src/routes/courses/index.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatUnits } from "viem";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/courses/")({
  component: CoursesPage,
});

function CoursesPage() {
  const courses = useQuery(
    trpc.courses.list.queryOptions({ page: 1, pageSize: 20 }),
  );

  if (courses.isLoading) return <p>正在加载课程…</p>;
  if (courses.isError) return <p role="alert">{courses.error.message}</p>;
  if (!courses.data?.length) return <p>暂无课程</p>;

  return (
    <main className="container mx-auto grid gap-4 px-4 py-8 md:grid-cols-3">
      {courses.data.map((course) => (
        <article className="rounded border p-4" key={course.id}>
          <img alt="" className="aspect-video w-full object-cover" src={course.coverUrl} />
          <h2 className="mt-3 font-semibold">{course.title}</h2>
          <p>{formatUnits(BigInt(course.priceYd), 18)} YD</p>
          <Link params={{ courseId: course.id }} to="/courses/$courseId">
            查看课程
          </Link>
        </article>
      ))}
    </main>
  );
}
```

### E. 学习页进度上报

不要监听每一个 `timeupdate` 就请求后端。使用节流后的上报函数：

```tsx
const updateProgress = useMutation(trpc.learning.updateProgress.mutationOptions());

function reportProgress(currentTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const progress = Math.floor((currentTime / duration) * 100);
  updateProgress.mutate({ courseId, progress });
}

<video
  controls
  onEnded={(event) => reportProgress(event.currentTarget.duration, event.currentTarget.duration)}
  onTimeUpdate={(event) => {
    const video = event.currentTarget;
    if (Math.floor(video.currentTime) % 20 === 0) {
      reportProgress(video.currentTime, video.duration);
    }
  }}
  src={section.playbackUrl}
/>
```

生产实现应使用 `throttle` 或定时器记录最近一次上报时间，避免同一秒产生多次请求。

### F. 评论安全渲染

正确：

```tsx
<p className="whitespace-pre-wrap">{comment.content}</p>
```

禁止：

```tsx
<div dangerouslySetInnerHTML={{ __html: comment.content }} />
```

### G. 证书领取

```ts
const proof = await trpcClient.proofs.certificate.mutate({
  courseId,
  tokenUri,
});

const walletClient = await getWalletClient(wallet);
const hash = await walletClient.writeContract({
  address: addresses[CHAIN_ID].certificate,
  abi: certificateAbi,
  functionName: "claimCertificate",
  args: [
    BigInt(proof.courseId),
    proof.tokenUri,
    proof.nonce,
    BigInt(proof.deadline),
    proof.signature,
  ],
});

const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  confirmations: 2,
});
if (receipt.status !== "success") throw new Error("证书领取失败");
```

`addresses[CHAIN_ID].certificate` 必须是真实 Sepolia 部署地址。证书未部署时应禁用入口并显示明确提示，不能填写 `0x...` 或零地址。

### H. 前端完整验证

```bash
pnpm check-types
pnpm --filter web build
pnpm dev
```

浏览器分别验证：游客列表、登录、余额、approve、buy、后端交易确认、学习权限、评论、用户名签名和证书领取。每个写操作都必须显示 pending、success、error 三种状态。
