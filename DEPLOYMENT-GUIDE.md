# DogePad 合约重新部署指南

## 问题诊断结果

经过全面链上诊断，发现以下关键问题：

| 组件 | 问题 | 影响 |
|------|------|------|
| BondingCurve | 缺少所有核心函数 (0/6) | 无法创建/买卖代币 |
| LaunchDAO | bondingCurve 未设置 | 无法调用 createTokenForDao |
| 代币发射 | 流程在第2步失败 | 代币未注册到 BondingCurve |

**根本原因**: 链上部署的 BondingCurve 合约是错误版本，缺少所有核心功能函数。

---

## 重新部署流程

### 步骤 1: 检查环境

```bash
# 确保在项目目录
cd g:\lanchpad

# 检查 .env 文件是否存在
dir .env
```

### 步骤 2: 添加部署私钥

在 `.env` 文件中添加:

```
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

**注意**: 不要提交 `.env` 文件到 GitHub！

### 步骤 3: 编译合约

```bash
npx hardhat compile
```

如果编译成功，应该看到:
```
Compiling 15 files with Solidity 0.8.xx
Compilation finished successfully
```

### 步骤 4: 部署合约

```bash
npx ts-node scripts/deploy-arc.ts
```

部署脚本会:
1. 部署所有核心合约
2. 配置合约间引用
3. 将地址写入 `.env` 文件

### 步骤 5: 验证部署

```bash
node scripts/diagnose-contracts.mjs
```

应该看到:
```
BondingCurve 函数检查:
  createTokenForDao    ✓
  buy                  ✓
  sell                 ✓
  getTokenInfo         ✓
  isListed             ✓
  listOnDex            ✓

通过: 6/6

LaunchDAO 引用检查:
  bondingCurve: 0x0412839B2c0007D0642aD437B3E7b95c3680C765

✓ 所有核心功能正常!
```

---

## 部署后操作

### 1. 更新前端环境变量

部署脚本会自动更新 `.env` 文件，但前端需要 `.env.local`:

```bash
# 复制 .env 到 .env.local (不会提交到 Git)
copy .env .env.local
```

### 2. 更新 GitHub Actions (如需要)

如果前端从不同环境变量读取地址，确保 GitHub Secrets 中有相应的环境变量。

### 3. 重新部署网站

```bash
git add .
git commit -m "Deploy with fixed BondingCurve"
git push
```

---

## 测试发射流程

### 方式 A: 使用网站

1. 打开 https://dogepad.pro
2. 连接钱包
3. 进入创建代币页面
4. 填写代币信息并提交
5. 使用另一个账户认购达到 20 USDC
6. 等待自动调用 processQueue()
7. 验证代币出现在 BondingCurve 中
8. 验证 DEX 上架成功

### 方式 B: 使用脚本测试

创建测试脚本 `scripts/test-launch.ts`:

```typescript
import { ethers } from 'ethers';

const RPC = 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = 'your_test_key';
const BONDING_CURVE = '0x...'; // 从部署输出获取

async function test() {
  const wallet = new ethers.Wallet(PRIVATE_KEY, new ethers.providers.JsonRpcProvider(RPC));
  
  // 1. 创建一个测试代币
  const bondingCurve = new ethers.Contract(BONDING_CURVE, [
    'function createToken(string,string,uint256) payable',
    'function getTokenInfo(address) view returns (...)'
  ], wallet);
  
  // ... 测试代码
}
```

---

## 故障排除

### 问题 1: 编译失败

```
Error: Cannot find module '@openzeppelin/contracts'
```

解决方案:
```bash
npm install @openzeppelin/contracts
```

### 问题 2: 部署失败 - 余额不足

```
ERROR: Deployer needs at least 0.05 USDC to deploy!
```

解决方案:
- 从 faucet 获取测试网 USDC: https://faucet.circle.com
- 或联系项目方获取测试代币

### 问题 3: 部署失败 - RPC 连接问题

```
Error: connection not established
```

解决方案:
- 检查网络 URL: https://arc-testnet.drpc.org
- 尝试备用 RPC: https://rpc.testnet.arc.network

### 问题 4: 部署后函数仍然不存在

检查:
1. 部署脚本是否成功完成
2. `.env` 文件是否更新
3. 合约地址是否正确

---

## 部署检查清单

- [ ] DEPLOYER_PRIVATE_KEY 已设置
- [ ] 测试网余额充足 (>0.1 USDC)
- [ ] `npx hardhat compile` 成功
- [ ] `npx ts-node scripts/deploy-arc.ts` 成功
- [ ] `node scripts/diagnose-contracts.mjs` 显示 6/6 通过
- [ ] `.env.local` 已创建
- [ ] 网站可以连接钱包
- [ ] 可以创建候选者
- [ ] 可以认购达到 20 USDC
- [ ] processQueue() 被调用
- [ ] 代币出现在 BondingCurve 中
- [ ] 代币成功上架 DEX

---

## 联系支持

如果遇到问题，请提供:
1. 完整的错误信息
2. 部署脚本的输出
3. 诊断脚本的输出
4. 使用的 RPC URL
