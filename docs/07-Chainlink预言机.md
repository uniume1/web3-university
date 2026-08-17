# 阶段 G：Chainlink Functions 预言机

> 节点范围：49～52  
> 阶段目标：让 Ethereum Sepolia 合约通过 Chainlink DON 查询课程完成状态  
> 预计用时：6～8 小时  
> 定位：加分/作业要求模块；默认产品路径仍保留 EIP-712 完成证明

## 架构说明

```text
学生调用 requestCompletion
  -> Consumer 发出 Chainlink Functions 请求
  -> DON 节点访问公开只读完成状态 API
  -> DON 聚合响应并回调 fulfillRequest
  -> Consumer 记录 verifiedCompletion=true
  -> 学生调用 CourseCertificate.claimWithOracle
```

Chainlink 只能提高“链下结果如何送上链”的可验证性。完成状态 API 仍由平台控制，因此它没有消除平台信任。

## 节点 49：理解预言机信任边界和异步请求（1～1.5 小时）

### 本节点目标

理解合约为什么不能直接 `fetch()`，以及 request/fulfill 为什么是两笔不同交易。

### 当前节点使用的技术能力

- **Oracle**：把链外数据传入确定性的 EVM。
- **DON**：多个预言机节点执行并聚合结果。
- **Async callback**：用户交易只创建 request，稍后 Router 回调结果。
- **Subscription billing**：请求费用从 Chainlink Functions subscription 扣除。

### 必须回答

1. 合约执行为什么不能访问互联网？不同节点必须对同一交易得到确定结果。
2. 为什么不能在按钮点击后立即得到 completed？DON 执行和回调需要时间。
3. Chainlink 是否能证明平台 API 没撒谎？不能，只能证明 DON 获取并聚合了该 API 结果。

### 状态机

```text
idle -> requesting -> pending -> fulfilled(true/false) | failed
```

### 验收清单

- [ ] 能解释 requestId 的用途。
- [ ] UI 不把 request 交易成功当成验证成功。
- [ ] 明白 API 仍是信任来源。

### Git 提交建议

无代码提交。

## 节点 50：创建 Functions 订阅与完成状态 API（1.5～2 小时）

### 本节点目标

准备 Sepolia LINK/Subscription，并提供 DON 可访问的最小 API。

### 当前节点使用的技术能力

- **Functions Subscription Manager**：管理余额、Consumer allowlist 和请求费用。
- **Public read-only endpoint**：DON 无法访问 localhost，需要 HTTPS 公网地址。
- **Data minimization**：接口只返回完成布尔值，不公开学习细节。

### 操作步骤

1. 打开 Chainlink Functions 官方 Subscription Manager。
2. 切换 Ethereum Sepolia。
3. 创建 subscription，记录 `subscriptionId`。
4. 从官方 Faucet 获取少量 Sepolia LINK 并充值 subscription。
5. Consumer 部署后再加入 allowlist。

在 Hono 增加普通 HTTP 路由，而不是 tRPC batch 路由：

```ts
app.get("/oracle/completion", async (c) => {
  const wallet = c.req.query("wallet")?.toLowerCase();
  const chainCourseId = c.req.query("courseId");
  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet) || !chainCourseId) {
    return c.json({ error: "invalid input" }, 400);
  }
  const completed = await lookupCompletion(wallet, chainCourseId);
  return c.json({ completed });
});
```

`lookupCompletion` 必须从数据库购买和进度表计算，不能接收客户端提供的 completed：

```ts
async function lookupCompletion(wallet: string, chainCourseId: string) {
  const [row] = await db
    .select({ status: learningProgress.status })
    .from(learningProgress)
    .innerJoin(users, eq(users.id, learningProgress.userId))
    .innerJoin(courses, eq(courses.id, learningProgress.courseId))
    .innerJoin(purchases, and(
      eq(purchases.userId, users.id),
      eq(purchases.courseId, courses.id),
    ))
    .where(and(
      eq(users.walletAddress, wallet),
      eq(courses.chainCourseId, chainCourseId),
    ))
    .limit(1);
  return row?.status === "completed";
}
```

生产部署需要限流。接口不得返回邮箱、视频记录或测验详情。

Chainlink Functions JavaScript source：

```js
const baseUrl = args[0];
const wallet = args[1];
const courseId = args[2];
const response = await Functions.makeHttpRequest({
  url: `${baseUrl}/oracle/completion`,
  params: { wallet, courseId },
  timeout: 9000,
});
if (response.error) throw Error("completion API request failed");
return Functions.encodeUint256(response.data.completed ? 1 : 0);
```

### 验证

先部署 API 到 Preview URL，再从本机请求：

```bash
curl "https://<PREVIEW_DOMAIN>/api/oracle/completion?wallet=0x...&courseId=1"
```

### 常见错误

- 使用 localhost：DON 无法访问。
- Preview 有登录保护：DON 会拿到 HTML/401，需要为该 API 配置可访问路径。
- 免费测试 LINK 也有限额，不重复发送无意义请求。

### 验收清单

- [ ] subscription 有余额。
- [ ] API 是 HTTPS 且 DON 可访问。
- [ ] API 只返回 `{ completed: boolean }`。

### Git 提交建议

```bash
git add apps/server packages/api
git commit -m "feat(api): expose minimal completion oracle endpoint"
```

## 节点 51：实现 Functions Consumer 合约（1.5～2 小时）

### 本节点目标

发送 Functions 请求并按 requestId 把响应关联到学生和课程。

### 当前节点使用的技术能力

- **FunctionsClient**：只允许官方 Router 调用内部 fulfill 流程。
- **CBOR request**：把 source 和 args 编码给 DON。
- **Pending request mapping**：防止响应关联错用户。
- **Owner/admin configuration**：subscription、DON ID、gas limit 集中配置。

### 操作步骤

```bash
cd apps/contracts
forge install smartcontractkit/chainlink-brownie-contracts --no-git
```

remapping：

```text
@chainlink/contracts/=lib/chainlink-brownie-contracts/contracts/
```

创建 `apps/contracts/src/CourseCompletionOracle.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract CourseCompletionOracle is FunctionsClient, Ownable {
    using FunctionsRequest for FunctionsRequest.Request;

    struct PendingRequest { address student; uint256 courseId; }

    uint64 public subscriptionId;
    bytes32 public donId;
    uint32 public callbackGasLimit = 300_000;
    string public source;
    string public apiBaseUrl;

    mapping(bytes32 => PendingRequest) public pending;
    mapping(address => mapping(uint256 => bool)) public verifiedCompletion;

    event CompletionRequested(bytes32 indexed requestId, address indexed student, uint256 indexed courseId);
    event CompletionFulfilled(bytes32 indexed requestId, bool completed, bytes errorData);
    event ConfigurationUpdated(uint64 subscriptionId, bytes32 donId, uint32 callbackGasLimit);

    constructor(
        address router,
        uint64 subscriptionId_,
        bytes32 donId_,
        string memory source_,
        string memory apiBaseUrl_
    ) FunctionsClient(router) Ownable(msg.sender) {
        subscriptionId = subscriptionId_;
        donId = donId_;
        source = source_;
        apiBaseUrl = apiBaseUrl_;
    }

    function requestCompletion(uint256 courseId) external returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        string[] memory args = new string[](3);
        args[0] = apiBaseUrl;
        args[1] = Strings.toHexString(uint160(msg.sender), 20);
        args[2] = Strings.toString(courseId);
        req.setArgs(args);

        requestId = _sendRequest(
            req.encodeCBOR(), subscriptionId, callbackGasLimit, donId
        );
        pending[requestId] = PendingRequest(msg.sender, courseId);
        emit CompletionRequested(requestId, msg.sender, courseId);
    }

    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err)
        internal
        override
    {
        PendingRequest memory item = pending[requestId];
        require(item.student != address(0), "unknown request");
        delete pending[requestId];

        bool completed = err.length == 0
            && response.length == 32
            && abi.decode(response, (uint256)) == 1;
        if (completed) verifiedCompletion[item.student][item.courseId] = true;
        emit CompletionFulfilled(requestId, completed, err);
    }

    function isCompleted(address student, uint256 courseId) external view returns (bool) {
        return verifiedCompletion[student][courseId];
    }

    function setConfiguration(
        uint64 subscriptionId_,
        bytes32 donId_,
        uint32 callbackGasLimit_,
        string calldata source_,
        string calldata apiBaseUrl_
    ) external onlyOwner {
        require(callbackGasLimit_ > 0, "invalid gas limit");
        subscriptionId = subscriptionId_;
        donId = donId_;
        callbackGasLimit = callbackGasLimit_;
        source = source_;
        apiBaseUrl = apiBaseUrl_;
        emit ConfigurationUpdated(subscriptionId_, donId_, callbackGasLimit_);
    }
}
```

### 证书连接

为 `CourseCertificate` 增加管理员可设置的 oracle 和课程 URI。先定义最小接口：

```solidity
interface ICourseCompletionOracle {
    function isCompleted(address student, uint256 courseId) external view returns (bool);
}
```

加入状态、配置和领取入口：

```solidity
ICourseCompletionOracle public completionOracle;
mapping(uint256 => string) public courseTokenURI;

error OracleNotConfigured();
error CompletionNotVerified();
error CourseUriNotConfigured();

function setCompletionOracle(address oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
    completionOracle = ICourseCompletionOracle(oracle);
}

function setCourseTokenURI(uint256 courseId, string calldata uri)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
{
    courseTokenURI[courseId] = uri;
}

function claimWithOracle(uint256 courseId) external returns (uint256) {
    if (address(completionOracle) == address(0)) revert OracleNotConfigured();
    if (!completionOracle.isCompleted(msg.sender, courseId)) {
        revert CompletionNotVerified();
    }
    string memory uri = courseTokenURI[courseId];
    if (bytes(uri).length == 0) revert CourseUriNotConfigured();
    return _mintCertificate(msg.sender, courseId, uri);
}
```

把 EIP-712 claim 中 mint 的部分也替换为同一个内部函数，避免两套唯一性规则：

```solidity
function _mintCertificate(address student, uint256 courseId, string memory uri)
    internal
    returns (uint256 tokenId)
{
    if (certificateOf[student][courseId] != 0) revert CertificateAlreadyExists();
    tokenId = _nextTokenId++;
    certificateOf[student][courseId] = tokenId;
    _safeMint(student, tokenId);
    _setTokenURI(tokenId, uri);
    emit CertificateMinted(student, courseId, tokenId, uri);
}
```

### 配置

Router、DON ID 必须从执行当天的 [Chainlink Functions Supported Networks](https://docs.chain.link/chainlink-functions/supported-networks) 获取。Sepolia 常见 DON ID 为 `fun-ethereum-sepolia-1`，应转换 `bytes32`，不要凭记忆硬编码地址。

### 验收清单

- [ ] 只有 Functions Router 能触发 fulfill。
- [ ] requestId 关联学生和课程。
- [ ] err 不为空时不标记完成。
- [ ] source/API 配置有管理员更新方案并有事件。
- [ ] CourseCertificate 两种 claim 共享唯一性检查。

### Git 提交建议

```bash
git add apps/contracts
git commit -m "feat(contracts): verify completion with Chainlink Functions"
```

## 节点 52：完成 Sepolia 请求、回调和失败处理（1.5～2 小时）

### 本节点目标

部署 Consumer、加入 subscription，并在前端展示完整异步状态。

### 当前节点使用的技术能力

- **Consumer allowlist**：只有登记的 Consumer 能消耗 subscription。
- **Event polling**：前端等待 `CompletionFulfilled`，不是一直重发 request。
- **Operational recovery**：API/DON 失败时允许新 request，不伪造完成状态。

### 操作步骤

1. 用当前官方 Router/DON ID 更新部署脚本。
2. `forge script` 部署 Oracle 和更新后的 Certificate。
3. 在 Subscription Manager 添加 Oracle 地址作为 Consumer。
4. 给一门课程设置 certificate token URI。
5. 完成课程的学生调用 `requestCompletion(courseId)`。
6. 保存 requestId，在 Etherscan 查看 request 事件。
7. 等待 `CompletionFulfilled`。
8. `isCompleted(student, courseId)` 为 true 后调用 `claimWithOracle`。

前端状态：

```text
等待钱包确认请求
请求已上链
Chainlink 正在获取完成状态
验证通过 / 尚未完成 / 请求失败
领取 NFT
```

不要设置 1 秒高频轮询；使用事件 watch 或 5～10 秒轮询，并在超时后提供“查看 requestId”。

### 失败测试

- API 返回 500。
- API 返回 completed=false。
- subscription LINK 不足。
- Consumer 未加入 allowlist。
- callback gas limit 太低。
- 未完成学生请求。

### 验收清单

- [ ] request 和 fulfill 是两笔不同交易。
- [ ] false/error 不铸造证书。
- [ ] 成功后可领取且不能重复领取。
- [ ] UI 显示 requestId 和 Etherscan 链接。

### Git 提交建议

```bash
git add apps/contracts apps/web packages/contracts
git commit -m "feat(app): complete Chainlink certificate flow"
```

## 阶段验收

保留一组成功和一组失败的 requestId，答辩时解释信任边界、异步回调、subscription 费用和 EIP-712 默认方案为什么更便宜。

通过后进入[阶段 H](./08-部署测试与答辩.md)。

## 完整实现附录

Chainlink Functions 是可选增强路径。默认 EIP-712 证书流程已经能够工作，不应为了演示预言机而破坏默认路径。

### A. `apps/server/src/routes/oracle.ts`

该接口只返回最小完成状态，不返回课程内容、邮箱或 Privy 资料。生产环境必须增加仅供 DON 请求使用的认证机制；下面使用单独的只读密钥。

```ts
import { db } from "@web3-school/db";
import { courses, users } from "@web3-school/db/schema/core";
import { learningProgress } from "@web3-school/db/schema/learning";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAddress } from "viem";
import { z } from "zod";

const querySchema = z.object({
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  courseId: z.string().regex(/^\d+$/),
});

export const oracleRoutes = new Hono().get("/completion", async (c) => {
  const expectedKey = process.env.ORACLE_READ_API_KEY;
  if (!expectedKey || c.req.header("x-oracle-key") !== expectedKey) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "BAD_REQUEST" }, 400);

  const wallet = getAddress(parsed.data.wallet).toLowerCase();
  const [record] = await db
    .select({ status: learningProgress.status })
    .from(learningProgress)
    .innerJoin(users, eq(users.id, learningProgress.userId))
    .innerJoin(courses, eq(courses.id, learningProgress.courseId))
    .where(
      and(
        eq(users.walletAddress, wallet),
        eq(courses.chainCourseId, parsed.data.courseId),
      ),
    )
    .limit(1);

  return c.json({ completed: record?.status === "completed" });
});
```

在 `apps/server/src/index.ts` 注册：

```ts
import { oracleRoutes } from "./routes/oracle";

app.route("/api/oracle", oracleRoutes);
```

`apps/server/.env` 增加：

```dotenv
ORACLE_READ_API_KEY=使用密码管理器生成的随机值
```

### B. Chainlink Functions JavaScript Source

文件：`apps/contracts/functions/course-completion.js`

```js
const wallet = args[0];
const courseId = args[1];
const baseUrl = args[2].replace(/\/$/, "");

if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
  throw Error("invalid wallet");
}
if (!/^\d+$/.test(courseId)) {
  throw Error("invalid course id");
}

const response = await Functions.makeHttpRequest({
  url: `${baseUrl}/api/oracle/completion`,
  method: "GET",
  headers: {
    "x-oracle-key": secrets.oracleReadApiKey,
  },
  params: { wallet, courseId },
  timeout: 9000,
});

if (response.error) throw Error("completion API request failed");
if (typeof response.data?.completed !== "boolean") {
  throw Error("invalid completion API response");
}

return Functions.encodeBool(response.data.completed);
```

不要把 `ORACLE_READ_API_KEY` 写进 source 或 args，必须使用 Chainlink Functions encrypted secrets。

### C. `CourseCompletionOracle` 的完整状态边界

原文 Consumer 合约必须至少保证：

```solidity
mapping(bytes32 requestId => address student) public requestStudent;
mapping(bytes32 requestId => uint256 courseId) public requestCourse;
mapping(bytes32 requestId => bool fulfilled) public requestFulfilled;
mapping(address student => mapping(uint256 courseId => bool completed))
    public completionVerified;
```

发送请求时写入关联关系：

```solidity
bytes32 requestId = _sendRequest(
    request.encodeCBOR(),
    subscriptionId,
    callbackGasLimit,
    donId
);
requestStudent[requestId] = student;
requestCourse[requestId] = courseId;
emit CompletionRequested(requestId, student, courseId);
```

回调必须拒绝重复处理，并分别记录 error、false、true：

```solidity
function fulfillRequest(
    bytes32 requestId,
    bytes memory response,
    bytes memory err
) internal override {
    if (requestStudent[requestId] == address(0)) {
        revert UnknownRequest();
    }
    if (requestFulfilled[requestId]) revert RequestAlreadyFulfilled();
    requestFulfilled[requestId] = true;

    address student = requestStudent[requestId];
    uint256 courseId = requestCourse[requestId];

    if (err.length != 0) {
        emit CompletionFailed(requestId, student, courseId, err);
        return;
    }
    if (response.length != 32) {
        emit CompletionFailed(requestId, student, courseId, response);
        return;
    }

    bool completed = abi.decode(response, (bool));
    if (completed) {
        completionVerified[student][courseId] = true;
    }
    emit CompletionFulfilled(requestId, student, courseId, completed);
}
```

### D. 证书连接接口

`CourseCertificate.sol` 增加最小只读接口：

```solidity
interface ICourseCompletionOracle {
    function completionVerified(address student, uint256 courseId)
        external
        view
        returns (bool);
}
```

状态和管理员设置：

```solidity
ICourseCompletionOracle public completionOracle;
mapping(uint256 courseId => string uri) public courseTokenURI;

event CompletionOracleUpdated(address indexed oracle);
event CourseTokenURIUpdated(uint256 indexed courseId, string tokenURI);

function setCompletionOracle(address oracle)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
{
    if (oracle == address(0)) revert ZeroAddress();
    completionOracle = ICourseCompletionOracle(oracle);
    emit CompletionOracleUpdated(oracle);
}

function setCourseTokenURI(uint256 courseId, string calldata tokenURI_)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
{
    if (bytes(tokenURI_).length == 0) revert InvalidTokenURI();
    courseTokenURI[courseId] = tokenURI_;
    emit CourseTokenURIUpdated(courseId, tokenURI_);
}
```

Oracle 领取入口必须保留与 EIP-712 相同的唯一性检查：

```solidity
function claimCertificateFromOracle(uint256 courseId)
    external
    returns (uint256 tokenId)
{
    if (address(completionOracle) == address(0)) revert OracleNotConfigured();
    if (!completionOracle.completionVerified(msg.sender, courseId)) {
        revert CompletionNotVerified();
    }
    if (certificateOf[msg.sender][courseId] != 0) {
        revert CertificateAlreadyExists();
    }

    string memory tokenURI_ = courseTokenURI[courseId];
    if (bytes(tokenURI_).length == 0) revert InvalidTokenURI();

    tokenId = _nextTokenId++;
    certificateOf[msg.sender][courseId] = tokenId;
    _safeMint(msg.sender, tokenId);
    _setTokenURI(tokenId, tokenURI_);
    emit CertificateMinted(msg.sender, courseId, tokenId, tokenURI_);
}
```

### E. 独立部署脚本结构

不要为了部署 Oracle 重跑整个 `DeployCore`。创建独立脚本：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CourseCompletionOracle} from "../src/CourseCompletionOracle.sol";

contract DeployCompletionOracle is Script {
    function run() external returns (CourseCompletionOracle oracle) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address router = vm.envAddress("CHAINLINK_FUNCTIONS_ROUTER");

        vm.startBroadcast(key);
        oracle = new CourseCompletionOracle(router);
        vm.stopBroadcast();

        console2.log("CourseCompletionOracle", address(oracle));
    }
}
```

具体构造参数必须与当前 `CourseCompletionOracle.sol` 一致；如果合约还要求 subscriptionId、DON ID，应在脚本内从环境变量读取，不能写死生产值。

### F. 请求与回调验证

```bash
cast call "$ORACLE_ADDRESS" \
  "requestStudent(bytes32)(address)" "$REQUEST_ID" \
  --rpc-url "$SEPOLIA_RPC_URL"

cast call "$ORACLE_ADDRESS" \
  "requestFulfilled(bytes32)(bool)" "$REQUEST_ID" \
  --rpc-url "$SEPOLIA_RPC_URL"

cast call "$ORACLE_ADDRESS" \
  "completionVerified(address,uint256)(bool)" \
  "$STUDENT_ADDRESS" "$COURSE_ID" \
  --rpc-url "$SEPOLIA_RPC_URL"
```

至少保留一组 `true`、一组 `false`、一组 `err` 的 requestId。只有 `completionVerified == true` 才能进入 Oracle 证书领取流程。
