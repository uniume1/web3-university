# 阶段 C：课程证书 NFT

> 节点范围：17～21  
> 阶段目标：使用 EIP-712 平台证明领取不可转让 ERC-721 证书  
> 预计用时：7～9 小时

## 节点 17：理解 ERC-721、metadata 和 Soulbound（1～1.5 小时）

### 本节点目标

理解 NFT 所有权、metadata URI 与“课程证书不可转让”的原因。

### 当前节点使用的技术能力

- **ERC-721**：每个 tokenId 唯一的非同质化资产标准。
- **ERC-721 Metadata**：`tokenURI` 指向名称、图片和属性 JSON。
- **Soulbound pattern**：保留 NFT 可验证性，但禁止普通转账。
- **EIP-712**：对有明确字段和域的结构化数据签名，防止歧义与重放。

### Metadata 示例

```json
{
  "name": "Web3 University - Solidity Basics",
  "description": "Course completion certificate",
  "image": "ipfs://CID/certificate.png",
  "attributes": [
    { "trait_type": "Course ID", "value": 1 },
    { "trait_type": "Network", "value": "Ethereum Sepolia" }
  ]
}
```

证书不能自由转移，否则完成课程的人可以把证书卖给别人。MVP 采用 ERC-721 接口并禁止非 mint/burn 的 transfer。

### 验收清单

- [ ] 能解释 tokenId、owner 和 tokenURI。
- [ ] 能解释为什么证书不可转让。
- [ ] 能说明 metadata 本身通常不在链上。

### Git 提交建议

无代码提交。

## 节点 18：实现不可转让 `CourseCertificate`（1.5～2 小时）

### 本节点目标

完成证书存储、课程唯一领取限制和不可转让规则。

### 当前节点使用的技术能力

- **ERC721URIStorage**：为每个 tokenId 保存 URI。
- **State uniqueness**：`certificateOf[student][courseId]` 防止重复领取。
- **OpenZeppelin v5 `_update` hook**：统一拦截 transfer、mint 和 burn。

### 关键代码（基础部分）

创建 `apps/contracts/src/CourseCertificate.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract CourseCertificate is ERC721URIStorage, AccessControl, EIP712 {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant COMPLETION_TYPEHASH = keccak256(
        "CourseCompletion(address student,uint256 courseId,bytes32 tokenURIHash,bytes32 nonce,uint256 deadline)"
    );

    uint256 private _nextTokenId = 1;
    mapping(address => mapping(uint256 => uint256)) public certificateOf;
    mapping(bytes32 => bool) public usedNonces;

    error CertificateAlreadyExists();
    error CertificateIsSoulbound();
    error ExpiredProof();
    error NonceAlreadyUsed();
    error InvalidSigner();

    event CertificateMinted(
        address indexed student,
        uint256 indexed courseId,
        uint256 indexed tokenId,
        string tokenURI
    );

    constructor(address admin, address signer)
        ERC721("Web3 University Certificate", "W3UC")
        EIP712("Web3 University Certificate", "1")
    {
        if (admin == address(0) || signer == address(0)) revert InvalidSigner();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ROLE, signer);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address previousOwner)
    {
        previousOwner = _ownerOf(tokenId);
        if (previousOwner != address(0) && to != address(0)) {
            revert CertificateIsSoulbound();
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

### 原理说明

`previousOwner == address(0)` 表示 mint；`to == address(0)` 表示 burn。只有普通地址到普通地址的转移被禁止。本项目不主动暴露 burn，但保留标准内部语义。

### 验证

```bash
forge fmt
forge build
```

### 常见错误

- OpenZeppelin v4 与 v5 hook 不同。本项目按 v5 编写，不复制旧版 `_beforeTokenTransfer` 示例。
- 只禁用一个 `transferFrom` 不够，ERC-721 有多个转移入口。

### 验收清单

- [ ] 合约可编译。
- [ ] 所有 transfer 路径最终经过 `_update`。
- [ ] mint 仍然允许。

### Git 提交建议

等待节点 19 完成 claim 后提交。

## 节点 19：加入 EIP-712 完成证明（1.5～2 小时）

### 本节点目标

学生提交平台签名，自助领取证书；平台不代替学生持有钱包。

### 当前节点使用的技术能力

- **EIP-712 domain**：签名自动绑定 chainId 和 verifyingContract。
- **ECDSA recovery**：合约从签名恢复签名人地址。
- **Nonce**：一次性标识，阻止同一证明重复使用。
- **Deadline**：限制签名有效期。

### 关键代码

在 `CourseCertificate` 中加入：

```solidity
    function claimCertificate(
        uint256 courseId,
        string calldata tokenURI_,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert ExpiredProof();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        if (certificateOf[msg.sender][courseId] != 0) {
            revert CertificateAlreadyExists();
        }

        bytes32 structHash = keccak256(
            abi.encode(
                COMPLETION_TYPEHASH,
                msg.sender,
                courseId,
                keccak256(bytes(tokenURI_)),
                nonce,
                deadline
            )
        );
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (!hasRole(SIGNER_ROLE, recovered)) revert InvalidSigner();

        usedNonces[nonce] = true;
        tokenId = _nextTokenId++;
        certificateOf[msg.sender][courseId] = tokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        emit CertificateMinted(msg.sender, courseId, tokenId, tokenURI_);
    }
```

### 原理说明

签名字段包含 student、courseId、tokenURIHash、nonce、deadline；EIP-712 domain 还包含合约地址与 chainId。因此攻击者不能更换学生、课程、URI、网络或目标合约。

### 验证

```bash
forge fmt --check
forge build
```

### 常见错误

- 前后端字段顺序或类型不同会导致 signer 恢复错误。
- 对字符串直接 `abi.encode` 和对字符串 hash 的定义必须与后端完全一致。
- nonce 不能只在数据库标记使用，合约也必须记录。

### 验收清单

- [ ] 证明绑定学生地址。
- [ ] 证明绑定 URI hash。
- [ ] 有 nonce 和 deadline。
- [ ] 签名人可通过角色轮换。

### Git 提交建议

```bash
git add apps/contracts/src/CourseCertificate.sol
git commit -m "feat(contracts): add signed soulbound certificates"
```

## 节点 20：测试签名、重放、过期和重复领取（1.5～2 小时）

### 本节点目标

证明只有正确签名能领取，常见重放路径全部失败。

### 当前节点使用的技术能力

- **Foundry `vm.sign`**：使用测试私钥签署 ECDSA digest。
- **Typed data digest**：测试侧重建与合约完全一致的 EIP-712 hash。
- **Time warp**：模拟签名过期。

### 关键代码骨架

创建 `apps/contracts/test/CourseCertificate.t.sol`。测试使用 Harness 暴露 EIP-712 digest 计算，但不会给正式部署合约增加测试后门：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CourseCertificate} from "../src/CourseCertificate.sol";

contract CourseCertificateHarness is CourseCertificate {
    constructor(address admin, address signer) CourseCertificate(admin, signer) {}

    function hashTypedData(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }
}

contract CourseCertificateTest is Test {
    CourseCertificateHarness internal cert;
    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal student = makeAddr("student");
    address internal attacker = makeAddr("attacker");
    string internal constant URI = "ipfs://course-1";

    function setUp() public {
        signer = vm.addr(signerKey);
        cert = new CourseCertificateHarness(address(this), signer);
    }

    function _signature(
        address who,
        uint256 courseId,
        string memory uri,
        bytes32 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                cert.COMPLETION_TYPEHASH(),
                who,
                courseId,
                keccak256(bytes(uri)),
                nonce,
                deadline
            )
        );
        bytes32 digest = cert.hashTypedData(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function testValidProofMintsCertificate() public {
        bytes32 nonce = keccak256("proof-1");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.prank(student);
        uint256 tokenId = cert.claimCertificate(1, URI, nonce, deadline, sig);

        assertEq(cert.ownerOf(tokenId), student);
        assertEq(cert.tokenURI(tokenId), URI);
        assertEq(cert.certificateOf(student, 1), tokenId);
    }

    function testCannotReuseNonce() public {
        bytes32 nonce = keccak256("proof-1");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.startPrank(student);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
        vm.expectRevert(CourseCertificate.NonceAlreadyUsed.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
        vm.stopPrank();
    }

    function testExpiredProofFails() public {
        bytes32 nonce = keccak256("expired");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);
        vm.warp(deadline + 1);

        vm.prank(student);
        vm.expectRevert(CourseCertificate.ExpiredProof.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
    }

    function testWrongStudentFails() public {
        bytes32 nonce = keccak256("wrong-student");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);

        vm.prank(attacker);
        vm.expectRevert(CourseCertificate.InvalidSigner.selector);
        cert.claimCertificate(1, URI, nonce, deadline, sig);
    }

    function testCertificateCannotTransfer() public {
        bytes32 nonce = keccak256("soulbound");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signature(student, 1, URI, nonce, deadline);
        vm.prank(student);
        uint256 tokenId = cert.claimCertificate(1, URI, nonce, deadline, sig);

        vm.prank(student);
        vm.expectRevert(CourseCertificate.CertificateIsSoulbound.selector);
        cert.transferFrom(student, attacker, tokenId);
    }
}
```

继续补充重复课程和错误 signer 用例，最终至少覆盖：

```text
testValidProofMintsCertificate
testCannotReuseNonce
testCannotClaimSameCourseTwice
testExpiredProofFails
testWrongStudentFails
testWrongSignerFails
testCertificateCannotTransfer
```

### 验证

```bash
forge test --match-contract CourseCertificateTest -vvv
```

### 常见错误

- 直接调用内部 `_hashTypedDataV4`：测试合约访问不到，使用 Harness。
- 签名字节顺序必须是 `r || s || v`。
- `vm.warp(deadline + 1)` 后再调用才能验证过期。

### 验收清单

- [ ] 七类成功/失败测试均存在。
- [ ] 没有为了测试给正式合约增加公开后门。
- [ ] transfer 测试会 revert。

### Git 提交建议

```bash
git add apps/contracts/test/CourseCertificate.t.sol
git commit -m "test(contracts): cover certificate proof security"
```

## 节点 21：更新部署脚本并导出 ABI（1～1.5 小时）

### 本节点目标

部署证书合约，并建立前后端共享 ABI 与地址的单一来源。

### 当前节点使用的技术能力

- **ABI**：描述合约函数、事件和错误，供 viem 编解码。
- **Workspace package**：让 Web 和 Server 使用同一份地址/ABI。
- **Deployment registry**：按 chainId 保存部署地址。

### 操作步骤

在 `DeployCore.s.sol` 增加：

```solidity
address proofSigner = vm.envAddress("COURSE_PROOF_SIGNER_ADDRESS");
CourseCertificate certificate = new CourseCertificate(deployer, proofSigner);
console2.log("CourseCertificate", address(certificate));
```

部署成功后更新 `deployments/sepolia.json`。

创建 `packages/contracts/package.json`：

```json
{
  "name": "@web3-school/contracts",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

生成 ABI JSON：

```bash
mkdir -p packages/contracts/src/abi
jq '.abi' out/UNIToken.sol/UNIToken.json > ../../packages/contracts/src/abi/UNIToken.json
jq '.abi' out/CourseMarket.sol/CourseMarket.json > ../../packages/contracts/src/abi/CourseMarket.json
jq '.abi' out/CourseCertificate.sol/CourseCertificate.json > ../../packages/contracts/src/abi/CourseCertificate.json
```

创建 `packages/contracts/src/index.ts`：

```ts
import ydTokenAbiJson from "./abi/UNIToken.json" with { type: "json" };
import courseMarketAbiJson from "./abi/CourseMarket.json" with { type: "json" };
import certificateAbiJson from "./abi/CourseCertificate.json" with { type: "json" };

export const CHAIN_ID = 11155111 as const;
export const ydTokenAbi = ydTokenAbiJson;
export const courseMarketAbi = courseMarketAbiJson;
export const certificateAbi = certificateAbiJson;

export const addresses = {
  11155111: {
    ydToken: "0x...",
    courseMarket: "0x...",
    certificate: "0x...",
  },
} as const;
```

如果当前 TypeScript 配置不支持 JSON import attributes，就把 ABI 转成 `as const` 的 `.ts` 文件；不要使用 `any` 绕过。

### 验证

```bash
pnpm install
pnpm check-types
cd apps/contracts && forge test
```

### 常见错误

- 每次重新部署后忘记更新地址：前端会调用旧合约。
- ABI 手工复制漏事件：后端无法 decode log。用 `forge inspect` 自动生成。

### 验收清单

- [ ] 证书已部署并验证。
- [ ] 三份 ABI 来自实际编译产物。
- [ ] 地址只有一个共享来源。
- [ ] 前后端都能依赖 `@web3-school/contracts`。

### Git 提交建议

```bash
git add apps/contracts packages/contracts pnpm-lock.yaml
git commit -m "feat(contracts): export deployed contract interfaces"
```

## 阶段验收

```bash
cd apps/contracts
forge fmt --check
forge test -vvv
forge build --sizes
cd ../..
pnpm check-types
```

通过后进入[阶段 D](./04-数据库与后端.md)。
