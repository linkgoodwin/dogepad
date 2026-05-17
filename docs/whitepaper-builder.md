# FairForge 平台构建运维白皮书

> 版本: 1.0 | 目标读者: 平台构建与运维团队 | 链: BSC (BNB Chain)

---

## 1. 系统架构总览

FairForge 是部署在 BSC 上的代币发射与借贷协议平台，由 10 个核心智能合约、1 个前端应用和配套基础设施组成。

### 1.1 技术栈

| 层级 | 技术选型 |
|------|----------|
| 智能合约 | Solidity 0.8.24, Hardhat, viaIR:true, optimizer runs:1 |
| 前端 | React 18 + Vite 6 + TypeScript 5.8 + Tailwind CSS 3 |
| Web3 交互 | Wagmi v2 + Viem v2 |
| 状态管理 | Zustand v5 |
| 国际化 | 中英双语 i18n |
| 钱包 | MetaMask / OKX Wallet / Binance Wallet / WalletConnect |
| DEX | PancakeSwap V2 |
| 数学库 | PRBMath UD60x18 |

### 1.2 合约架构图

**第一层：DAO 治理层**

| 合约 | 职责 | 关键方法 |
|------|------|----------|
| LaunchDAO | DAO投票发射代币 | commit(), launchToken(), stakeFair() |

↓ createTokenForDao / buyForDao

**第二层：核心交易层**

| 合约 | 职责 | 关键方法 |
|------|------|----------|
| BondingCurve | 线性联合曲线买卖、DEX自动上线 | buy(), sell(), _checkAndListOnDex() |
| BondingCurveToken | ERC20税制代币 | _update(), setDexPair(), burn() |
| BondingCurveFactory | 代币创建工厂 | createToken() |

↓ DEX上线后资金分配

**第三层：DeFi生态层**

| 合约 | 职责 | 接收资金 | 关键方法 |
|------|------|----------|----------|
| LongPool | BNB借贷池 | 20% BNB | deposit(), borrow(), liquidate() |
| ShortPool | Token借贷池(做空) | 10% Token | openShort(), closeShort() |
| BuyAndBurnEngine | FAIR买入销毁引擎 | 10% BNB | executeBurn() |
| FeeDistributor | 费用分配给FAIR质押者 | 5% BNB + 交易税 | distributeFees(), claim() |
| PriceOracle | TWAP价格预言机 | — | updateTwapPrice() |
| CreatorRewardManager | 创作者归属管理 | LP分成 + 代币分配 | createVesting(), claim() |

### 1.3 核心数据流

用户通过 Factory 创建代币 → BondingCurve 执行线性曲线买卖 → 储备达 30 BNB 阈值自动上 DEX → BNB 分配至 LP(65%)/LongPool(20%)/BurnEngine(10%)/Platform(5%) → Token 分配至 LP(65%)/ShortPool(10%)/Burn剩余 → BuyAndBurnEngine 用 BNB 购买 FAIR 并销毁 → FeeDistributor 分红给 FAIR 质押者。

---

## 2. 合约部署指南

### 2.1 环境准备

```bash
# 克隆项目
cd /home/deploy
git clone <仓库地址> fairforge && cd fairforge
pnpm install

# 配置环境变量
cat > .env << 'EOF'
DEPLOYER_PRIVATE_KEY=你的私钥
BSCSCAN_API_KEY=你的API密钥
EOF
chmod 600 .env
```

确认 [hardhat.config.ts](hardhat.config.ts) 配置：Solidity 0.8.24, viaIR:true, optimizer runs:1。

### 2.2 分阶段部署

**Phase 1: 基础设施**

```bash
npx hardhat console --network bscTestnet

# 1. 部署 PriceOracle
const PriceOracle = await ethers.getContractFactory("PriceOracle")
const priceOracle = await PriceOracle.deploy()
await priceOracle.waitForDeployment()

# 2. 部署 ExponentialRateModel（早期利率模型）
const EarlyModel = await ethers.getContractFactory("ExponentialRateModel")
const earlyModel = await EarlyModel.deploy()
await earlyModel.waitForDeployment()

# 3. 部署 ExponentialRateModel（成熟期利率模型）
const MatureModel = await ethers.getContractFactory("ExponentialRateModel")
const matureModel = await MatureModel.deploy()
await matureModel.waitForDeployment()

# 4. 部署 FeeDistributor（需先部署FAIR代币）
# 构造参数: fairToken地址, pancakeSwapRouter, buyAndBurnEngine(先填零地址)
const FeeDistributor = await ethers.getContractFactory("FeeDistributor")
const feeDistributor = await FeeDistributor.deploy(
  fairTokenAddr, routerAddr, ethers.ZeroAddress
)
await feeDistributor.waitForDeployment()
```

**Phase 2: BondingCurve 系统**

```bash
# 5. 部署 BondingCurve
# 构造参数: pancakeSwapRouter, feeDistributor
const BondingCurve = await ethers.getContractFactory("BondingCurve")
const bondingCurve = await BondingCurve.deploy(routerAddr, feeDistributorAddr)
await bondingCurve.waitForDeployment()

# 6. 部署 BondingCurveFactory
# 构造参数: bondingCurve地址
const Factory = await ethers.getContractFactory("BondingCurveFactory")
const factory = await Factory.deploy(bondingCurveAddr)
await factory.waitForDeployment()

# 7. 部署 CreatorRewardManager
# 构造参数: bondingCurve地址
const CRM = await ethers.getContractFactory("CreatorRewardManager")
const crm = await CRM.deploy(bondingCurveAddr)
await crm.waitForDeployment()
```

**Phase 3: 借贷协议**

```bash
# 8. 部署 LongPool
# 构造参数: earlyRateModel, matureRateModel, priceOracle
const LongPool = await ethers.getContractFactory("LongPool")
const longPool = await LongPool.deploy(earlyModelAddr, matureModelAddr, priceOracleAddr)
await longPool.waitForDeployment()

# 9. 部署 ShortPool
# 构造参数: earlyRateModel, matureRateModel, oracle, burnEngine, longPool, platformTreasury
const ShortPool = await ethers.getContractFactory("ShortPool")
const shortPool = await ShortPool.deploy(
  earlyModelAddr, matureModelAddr, priceOracleAddr,
  burnEngineAddr, longPoolAddr, feeDistributorAddr
)
await shortPool.waitForDeployment()
```

**Phase 4: BuyAndBurn + DAO**

```bash
# 10. 部署 BuyAndBurnEngine
# 构造参数: pancakeSwapRouter, keeper地址
const BurnEngine = await ethers.getContractFactory("BuyAndBurnEngine")
const burnEngine = await BurnEngine.deploy(routerAddr, keeperAddr)
await burnEngine.waitForDeployment()

# 11. 部署 LaunchDAO
# 构造参数: bondingCurve, feeDistributor
const DAO = await ethers.getContractFactory("LaunchDAO")
const dao = await DAO.deploy(bondingCurveAddr, feeDistributorAddr)
await dao.waitForDeployment()
```

**Phase 5: 接线配置**

```bash
# BondingCurve 接线
await bondingCurve.setFactory(factoryAddr)
await bondingCurve.setLaunchDao(daoAddr)
await bondingCurve.setPools(longPoolAddr, shortPoolAddr)
await bondingCurve.setPriceOracle(priceOracleAddr)
await bondingCurve.setBuyAndBurnEngine(burnEngineAddr)
await bondingCurve.setCreatorRewardManager(crmAddr)

# PriceOracle 授权
await priceOracle.setAuthorizedUpdater(bondingCurveAddr, true)

# LongPool 接线
await longPool.setBurnEngine(burnEngineAddr)
await longPool.setBondingCurve(bondingCurveAddr)
await longPool.setShortPool(shortPoolAddr)

# ShortPool 接线
await shortPool.setBondingCurve(bondingCurveAddr)

# FeeDistributor 接线
await feeDistributor.setBuyAndBurnEngine(burnEngineAddr)

# LaunchDAO 接线
await dao.setFairToken(fairTokenAddr)
```

**Phase 6: 验证合约**

```bash
npx hardhat verify --network bscTestnet <地址> <构造参数...>
```

---

## 3. 合约配置参数

### 3.1 BondingCurve 参数

| 参数 | 当前值 | 设置函数 | 说明 |
|------|--------|----------|------|
| BASE_PRICE | 100 gwei | 常量 | 曲线起始价格 |
| SLOPE | 10000 | 常量 | 曲线斜率 |
| FEE_BPS | 100 (1%) | 常量 | 买卖手续费 |
| creationFee | 0.1 BNB | setCreationFee() | 代币创建费 |
| defaultDexThreshold | 30 BNB | setDexThreshold() | DEX上线阈值 |
| daoOnlyLaunch | false | setDaoOnlyLaunch() | 是否仅DAO发射 |
| maturityThreshold | 100 BNB | setMaturityThreshold() | 成熟度阈值 |
| lpRatio | 65 | setRatios() | LP BNB分配比例 |
| longPoolRatio | 20 | setRatios() | LongPool BNB比例 |
| shortPoolTokenRatio | 10 | setRatios() | ShortPool Token比例 |
| burnEngineRatio | 10 | setRatios() | BurnEngine BNB比例 |
| platformRatio | 5 | setRatios() | 平台 BNB比例 |

**创作者激励乘数**: 选1项→10000, 选2项→4500, 选3项→2800。激励选项: wantTaxShare / wantLpShare / wantTokenAllocation。

### 3.2 BondingCurveToken 参数

| 参数 | 当前值 | 设置函数 |
|------|--------|----------|
| buyTax | 100 (1%) | setTaxes() |
| sellTax | 200 (2%) | setTaxes() |
| maxHoldingPercent | 5% | setMaxHoldingPercent() |
| creatorTaxBps | 动态 | setCreatorTaxReceiver() (仅BondingCurve可调) |
| taxEnabled | true | setTaxEnabled() |

### 3.3 LaunchDAO 参数

| 参数 | 当前值 | 说明 |
|------|--------|------|
| EPOCH_DURATION | 1天 | 投票周期 |
| SUBSCRIPTION_DURATION | 3.5小时 | 认购阶段 |
| PRE_LAUNCH_DURATION | 30分钟 | 预发射阶段 |
| CANDIDATE_LIFETIME | 7天 | 候选有效期 |
| MIN_STAKE | 0.1 BNB | 最低质押 |
| MAX_STAKE | 300 BNB | 最高质押 |
| FAIR_WEIGHT_BONUS | 0.015 | FAIR质押权重加成 |
| FIXED_TOTAL_SUPPLY | 10亿 (1e27) | DAO发射代币总量 |
| candidateFee | 0.05 BNB | 候选提交费 |

### 3.4 CreatorRewardManager 归属

| 类型 | 悬崖期 | 线性释放期 |
|------|--------|-----------|
| Token | 90天 | 360天 |
| LP | 无 | 180天 |

### 3.5 LongPool 参数

| 参数 | 当前值 | 设置函数 |
|------|--------|----------|
| reserveFactor | 10% | setReserveFactor() |
| burnRatio (早期) | 1% | setEarlyBurnRatio() |
| burnRatio (成熟) | 5% | setMatureBurnRatio() |
| burnEngineShare (早期) | 5% | setEarlyBurnEngineShare() |
| burnEngineShare (成熟) | 10% | setMatureBurnEngineShare() |
| CLOSE_FACTOR | 50% | 常量 |
| LIQUIDATION_BONUS | 8% | 常量 |
| HEALTH_FACTOR_THRESHOLD | 1.0 | 常量 |
| 默认清算阈值 | 80% | setLiquidationThreshold() |

### 3.6 ShortPool 参数

| 参数 | 当前值 | 说明 |
|------|--------|------|
| COLLATERAL_RATIO | 150% | 开仓抵押率 |
| OPEN_FEE | 0.5% | 开仓费 |
| MAX_UTILIZATION | 90% | 最大利用率 |
| COOLDOWN_PERIOD | 86400秒 | DEX上线后冷却期 |
| LIQUIDATION_BONUS | 8% | 清算奖励 |

### 3.7 BuyAndBurnEngine 参数

| 参数 | 当前值 | 设置函数 |
|------|--------|----------|
| burnThreshold | 0.1 BNB | setBurnThreshold() |
| maxSlippage | 5% | setMaxSlippage() |
| maxSingleBurn | 1 BNB | 常量 |
| minInterval | 30秒 | 常量 |

### 3.8 FeeDistributor 参数

| 参数 | 当前值 | 设置函数 |
|------|--------|----------|
| dividendRatio | 70% | setDividendRatio() |
| burnRatio | 30% | 自动计算 (1 - dividendRatio) |

### 3.9 PriceOracle 参数

| 参数 | 当前值 | 说明 |
|------|--------|------|
| TWAP_PERIOD | 14400秒 (4小时) | TWAP周期 |
| DEVIATION_THRESHOLD | 10% | Chainlink偏差阈值 |
| PRICE_DELAY | 600秒 (10分钟) | 有效价格延迟 |

---

## 4. 前端部署

### 4.1 构建配置

```bash
cd /home/deploy/fairforge

# 配置环境变量
cat > .env.production << 'EOF'
VITE_WALLETCONNECT_PROJECT_ID=<你的ID>
VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org/
VITE_CHAIN_ID=56
VITE_BONDING_CURVE_ADDRESS=<地址>
VITE_FACTORY_ADDRESS=<地址>
VITE_LONG_POOL_ADDRESS=<地址>
VITE_SHORT_POOL_ADDRESS=<地址>
VITE_BUY_AND_BURN_ADDRESS=<地址>
VITE_LAUNCH_DAO_ADDRESS=<地址>
VITE_PRICE_ORACLE_ADDRESS=<地址>
EOF

# 构建
pnpm build
# 产物输出至 dist/
```

### 4.2 Nginx 部署

```bash
sudo mkdir -p /var/www/fairforge
sudo cp -r dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge
```

Nginx 配置要点: SPA 路由 `try_files $uri $uri/ /index.html`、`/assets/` 长缓存、HTML 不缓存、安全头 (X-Frame-Options, X-Content-Type-Options)、SSL 证书 (Let's Encrypt)。

### 4.3 一键部署脚本

```bash
#!/bin/bash
set -e
cd /home/deploy/fairforge
git pull origin main
pnpm install
pnpm build
sudo cp -r dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge
```

---

## 5. 主网迁移清单

| 序号 | 检查项 | 操作 |
|------|--------|------|
| 1 | chainId | 97 → 56 |
| 2 | RPC | 测试网 → `https://bsc-dataseed.binance.org/` |
| 3 | PancakeSwap Router | → `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| 4 | FAIR 代币地址 | 更新为真实主网地址 |
| 5 | FeeDistributor | 设置真实 buyAndBurnEngine 地址 |
| 6 | BuyAndBurnEngine | 设置主网 keeper 地址 |
| 7 | 合约验证 | 全部在 BscScan 主网验证 |
| 8 | Owner 转多签 | 全部合约 transferOwnership 至 Gnosis Safe |
| 9 | 小额测试 | 先用少量 BNB 完整走通流程 |
| 10 | 前端更新 | .env.production 填入主网合约地址，重新构建 |
| 11 | Chainlink 预言机 | PriceOracle 配置主网 Chainlink Feed 地址 |
| 12 | Gas 价格 | 确认主网 gasPrice 设置合理 (3-5 Gwei) |

---

## 6. 运维手册

### 6.1 每日检查

- DAO epoch 推进: 调用 `dao.currentDay()` 确认递增
- 代币发射: 检查 `dao.epochInfo(day).isLaunched`
- BuyAndBurn 执行: keeper 定时调用 `burnEngine.executeBurn(FAIR_ADDR, minTokensOut)`
- PriceOracle 更新: 确认 `priceOracle.updateEffectivePrice()` 正常调用

### 6.2 每周检查

- 借贷池健康: LongPool `totalDeposits` vs `totalBorrows`，利用率是否合理
- 清算状态: 检查是否有健康因子 < 1 的仓位需要清算
- ShortPool 利用率: `getUtilization(token)` 是否接近 90% 上限
- FeeDistributor 分红: 确认 `accRewardPerShare` 正常增长

### 6.3 每月检查

- FAIR 销毁量: `burnEngine.totalBurned(FAIR_ADDR)` 累计统计
- 费用分配: `feeDistributor.totalDistributed` 核对
- 创作者归属: `crm.pendingClaim()` 检查是否有异常大额待领取
- 合约余额审计: 确认各合约 BNB/Token 余额与预期一致

### 6.4 Hardhat 控制台操作

```bash
npx hardhat console --network bscMainnet

# 读取 DAO 状态
const dao = await ethers.getContractAt("LaunchDAO", "0x...")
await dao.currentDay()
await dao.getPhase()
await dao.getEpochTimeRemaining()

# 读取 BondingCurve 状态
const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.creationFee()
await curve.defaultDexThreshold()

# 执行 BuyAndBurn
const burn = await ethers.getContractAt("BuyAndBurnEngine", "0x...")
const minOut = await burn.getEstimatedTokensOut(FAIR_ADDR, ethers.parseEther("0.1"))
await burn.executeBurn(FAIR_ADDR, minOut * 95n / 100n)
```

---

## 7. 安全检查清单

| 类别 | 检查项 | 状态 |
|------|--------|------|
| 合约 | ReentrancyGuard 已应用于所有外部函数 | ✅ |
| 合约 | Pausable 已应用于 BondingCurve/LongPool/ShortPool | ✅ |
| 合约 | Owner 函数仅多签可调用 | ⬜ 迁移后确认 |
| 合约 | rescueTokens 保护 totalVestedAmount | ✅ |
| 合约 | tax 上限: buyTax≤10%, sellTax≤10%, creatorTaxBps≤50% | ✅ |
| 合约 | BondingCurveToken 仅 bondingCurve 可调用 buyFromCurve/sellToCurve | ✅ |
| 合约 | ShortPool 开仓抵押率 150% | ✅ |
| 合约 | LongPool 清算阈值默认 80%, 健康因子 < 1 触发 | ✅ |
| 合约 | BuyAndBurn maxSingleBurn 限制单次销毁量 | ✅ |
| 合约 | FeeDistributor dividendRatio + burnRatio = 100% | ✅ |
| 运维 | .env 文件权限 600 | ⬜ |
| 运维 | 部署私钥不存于代码仓库 | ⬜ |
| 运维 | SSH Key 登录, 禁用密码 | ⬜ |
| 运维 | Fail2Ban 防暴力破解 | ⬜ |
| 运维 | UFW 防火墙仅开放 22/80/443 | ⬜ |

---

## 8. 应急预案

### 8.1 合约暂停

```bash
npx hardhat console --network bscMainnet

# 暂停 BondingCurve (停止买卖)
const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.pause()

# 暂停借贷池
const longPool = await ethers.getContractAt("LongPool", "0x...")
await longPool.pause()

const shortPool = await ethers.getContractAt("ShortPool", "0x...")
await shortPool.pause()

# 恢复
await curve.unpause()
await longPool.unpause()
await shortPool.unpause()
```

### 8.2 BuyAndBurn 紧急提款

```bash
const burn = await ethers.getContractAt("BuyAndBurnEngine", "0x...")
await burn.emergencyWithdraw(multisigAddr, amount)
await burn.emergencyWithdrawToken(tokenAddr, multisigAddr, amount)
```

### 8.3 CreatorRewardManager 资金救援

```bash
const crm = await ethers.getContractAt("CreatorRewardManager", "0x...")
# rescueTokens 自动保护 totalVestedAmount, 仅可提取超额部分
await crm.rescueTokens(tokenAddr, multisigAddr, amount)
```

### 8.4 价格异常处理

```bash
# 若 TWAP 价格偏离, 授权更新器可修正
const oracle = await ethers.getContractAt("PriceOracle", "0x...")
await oracle.updateTwapPrice(tokenAddr, correctedPrice)
await oracle.updateEffectivePrice(tokenAddr)

# 紧急设置成熟度覆盖
const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.setMatureOverride(tokenAddr, true)  # 强制标记为成熟
await curve.setMatureOverride(tokenAddr, false) # 恢复
```

### 8.5 DAO 紧急参数调整

```bash
const dao = await ethers.getContractAt("LaunchDAO", "0x...")
await dao.setCandidateFee(ethers.parseEther("0.1"))  # 调整候选费
await dao.setDefaultIncentives(true, true, false)     # 调整默认激励

const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.setDaoOnlyLaunch(true)   # 开启DAO独占发射
await curve.setDaoOnlyLaunch(false)  # 恢复开放发射
```

---

## 9. 监控指标

### 9.1 链上指标

| 指标 | 合约 | 读取方式 |
|------|------|----------|
| 当前 Epoch | LaunchDAO | `currentDay()` |
| DAO 阶段 | LaunchDAO | `getPhase()` (0=Voting,1=Subscription,2=PreLaunch,3=Launchable) |
| 活跃候选数 | LaunchDAO | `getActiveCandidates()` |
| 总质押 BNB | LaunchDAO | `totalStakedBnb` |
| 总质押 FAIR | LaunchDAO | `totalStakedFair` |
| 曲线代币数 | BondingCurveFactory | `tokenCount` |
| LongPool 利用率 | LongPool | `totalBorrows / totalDeposits` |
| ShortPool 利用率 | ShortPool | `getUtilization(token)` |
| FAIR 累计销毁 | BuyAndBurnEngine | `totalBurned(FAIR_ADDR)` |
| 累计分红 | FeeDistributor | `totalDistributed` |
| 待销毁 BNB | BuyAndBurnEngine | `pendingBnb(FAIR_ADDR)` |

### 9.2 服务器指标

```bash
# 系统资源
CPU: top -bn1 | grep "Cpu(s)"
内存: free -h
磁盘: df -h /

# Nginx 状态
sudo systemctl status nginx
sudo tail -50 /var/log/nginx/error.log

# 前端更新时间
stat -c %y /var/www/fairforge/index.html
```

### 9.3 告警阈值建议

| 指标 | 阈值 | 动作 |
|------|------|------|
| LongPool 利用率 | > 80% | 考虑补充流动性 |
| ShortPool 利用率 | > 85% | 关注清算风险 |
| DAO 无活跃候选 | 持续 3 天 | 社区运营介入 |
| BuyAndBurn 待处理 | > 5 BNB | Keeper 检查 |
| 服务器磁盘 | > 85% | 清理日志/备份 |
| Nginx 5xx 错误 | > 10/分钟 | 检查后端服务 |

---

## 10. 升级策略

### 10.1 代理模式

当前合约未使用代理模式，升级需部署新合约并迁移状态。关键合约的接线设计支持热替换:

- BondingCurve: `factory.setBondingCurve()`, `dao.setBondingCurve()`
- PriceOracle: `curve.setPriceOracle()`, `longPool.setOracle()`
- RateModel: `longPool.setEarlyRateModel()`, `longPool.setMatureRateModel()`
- BuyAndBurnEngine: `curve.setBuyAndBurnEngine()`, `feeDistributor.setBuyAndBurnEngine()`
- FeeDistributor: `curve.setFeeDistributor()`

### 10.2 升级流程

1. 部署新版本合约
2. 在测试网完整测试新合约
3. 通过多签执行接线切换
4. 验证新合约状态正确
5. 旧合约暂停或废弃

### 10.3 数据迁移注意事项

- BondingCurveToken 不支持迁移（每个代币独立部署）
- CreatorRewardManager 归属数据需手动迁移或保持旧合约运行
- LongPool/ShortPool 仓位数据需用户自行关闭后重新开仓
- LaunchDAO 候选和历史数据需评估是否迁移

### 10.4 前端升级

```bash
cd /home/deploy/fairforge
git pull origin main
pnpm install
pnpm build
sudo cp -r dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge
```

更新合约地址时，修改 `.env.production` 后重新构建即可，无需重启 Nginx。

---

> 本文档随代码库同步更新。任何参数变更请同步修改本文档对应章节。
