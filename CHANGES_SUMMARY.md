# FairForge 发币平台 - 三 Skill 协同补全报告

## 项目概述
基于 Circle 链测试网的 Bonding Curve 发币平台，内置永续合约 DEX。通过马斯克第一性原理 + 安全审计专家 + DeFi 协议设计师 + 前端工程师的多视角协同分析，完成所有核心功能补全。

---

## 【马斯克视角 - 第一性原理分析】

### 本质拆解
这是一个 Bonding Curve Meme 币发射平台 + 永续合约 DEX 的混合系统。核心价值链：
创作者提交代币 -> DAO 投票/认购 -> Bonding Curve 内盘交易 -> 自动上 DEX -> 永续合约交易

### 渐近极限分析
| 模块 | 理论最优 | 现状 | 差距 |
|------|---------|------|------|
| 发币机制 | 100% | 70% | 30% |
| DEX 集成 | 100% | 60% | 40% |
| 永续合约 | 100% | 55% | 45% |
| 安全机制 | 100% | 50% | 50% |
| 前端体验 | 100% | 65% | 35% |

### 白痴指数排名（越高越该改）
1. 永续合约止盈止损功能：9.5
2. 合约安全/防重入/权限管理：8.5
3. 价格预言机健壮性：8.0
4. K 线数据实时性：7.5
5. 持仓管理/历史记录：7.0

---

## 【安全审计报告 - 关键发现】

### PerpetualPool.sol
- **CRITICAL**: 资金费率计算方向错误 - 多空同向收费（已修复）
- **CRITICAL**: 清算未处理穿仓亏损（已修复 - 添加保险基金赔付）
- **CRITICAL**: 缺少价格新鲜度校验（已修复 - 添加 5 分钟阈值）
- **HIGH**: 限价单执行无激励（已修复 - 添加 1% 执行者奖励）

### LaunchDAO.sol
- **CRITICAL**: settleEpoch 空代码块 - 找到赢家后无操作（已修复）
- **CRITICAL**: 多处重入风险（已有 nonReentrant，需检查 _processQueueInternal）

### PriceOracle.sol
- **CRITICAL**: 偏差阈值 1000% 几乎不触发（已修复为 0.5%）
- **HIGH**: DEX 价格可被闪电贷操控（建议添加 TWAP）

---

## 【代码变更详情】

### P0 - 严重 Bug 修复（立即执行）

#### 1. PerpetualPool.sol - 全面重写
**修复内容：**
- 资金费率方向修复：使用 `int256` 类型的 `fundingDebt`，根据 OI imbalance 正确决定多空谁付谁收
- 清算穿仓处理：添加保险基金自动赔付穿仓亏损
- 价格新鲜度检查：添加 `PRICE_STALENESS_THRESHOLD = 5 minutes`
- 限价单/TP/SL 执行者激励：添加 `tpslExecutorRewardBps = 1%`
- 保险基金自动注入：清算费的 30% 自动进入保险基金

**新增功能：**
- 止盈止损 (TP/SL)：`setTpsl()`, `cancelTpsl()`, `executeTpsl()`
- 部分平仓：`closePositionPartial()`
- 增加/减少保证金：`addMargin()`, `removeMargin()`
- 爆仓价格计算：`getLiquidationPrice()`
- 保证金健康度：`getMarginHealth()` (0-100%)
- 资金费率查询：`getCurrentFundingRate()` (带方向)

#### 2. LaunchDAO.sol - 修复 settleEpoch
```solidity
if (winningId != type(uint256).max && maxWeight > 0) {
    candidates[winningId].status = CandidateStatus.ReadyToLaunch;
    candidates[winningId].launchAt = block.timestamp;
    emit CandidateReadyToLaunch(winningId, candidates[winningId].token);
}
```

#### 3. PriceOracle.sol - 修复偏差阈值
- 从 `DEVIATION_THRESHOLD = 10e16 (1000%)` 修复为 `5e15 (0.5%)`
- 添加 `getPriceUpdatedAt()` 函数支持价格新鲜度检查

### P1 - 核心功能补全

#### 4. PerpetualPage.tsx - 从 Mock 到真实合约集成
**重写内容：**
- 使用 wagmi/viem 统一替换 ethers.js
- 真实合约调用：`openPosition`, `closePosition`, `closePositionPartial`
- TP/SL 设置和取消
- 增加/减少保证金弹窗
- 部分平仓（25%/50%/75%/100%）
- 持仓面板：显示 size, margin, entryPrice, markPrice, liquidationPrice, PnL
- 保证金健康度可视化进度条
- 限价单列表管理
- 资金费率实时显示
- 持仓量 (OI) 显示

#### 5. contracts.ts - 添加永续合约 ABI
- 添加完整的 `PERPETUAL_POOL_ABI`，包含所有读写函数和事件

#### 6. translations.ts - 添加永续合约翻译键
- 中文和英文各添加 50+ 个翻译键

### P2 - 架构增强

#### 7. 事件日志完善
- `FundingRateUpdated` 改为记录 `int256 rate`（带方向）
- 新增 `PositionPartiallyClosed`, `TpslSet`, `TpslTriggered`, `TpslCancelled`
- 新增 `MarginAdded`, `MarginRemoved`, `InsuranceFundUsed`

#### 8. 安全增强
- 所有价格操作添加 `_validatePriceFreshness()`
- 清算逻辑添加破产处理
- 资金费率结算添加 underflow 保护

---

## 【文件变更清单】

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `contracts/pool/PerpetualPool.sol` | 重写 | 修复资金费率、添加 TP/SL、部分平仓、保证金管理 |
| `contracts/dao/LaunchDAO.sol` | 修改 | 修复 settleEpoch 空代码块 |
| `contracts/periphery/PriceOracle.sol` | 修改 | 修复偏差阈值、添加 getPriceUpdatedAt |
| `src/pages/PerpetualPage.tsx` | 重写 | 从 mock 改为真实合约集成 |
| `src/config/contracts.ts` | 修改 | 添加 PERPETUAL_POOL_ABI |
| `src/i18n/translations.ts` | 修改 | 添加 50+ 永续合约翻译键 |
| `CHANGES_SUMMARY.md` | 新增 | 本变更摘要文档 |

---

## 【待后续优化项】

### P2+ 建议
1. **多仓位支持**：同币种多方向持仓（架构变更较大）
2. **指数/标记价格分离**：提高安全性
3. **交易手续费分层**：按交易量分级
4. **推荐返佣系统**：邀请机制
5. **时间锁 (Timelock)**：关键参数变更延迟
6. **K 线事件驱动**：使用合约事件替代轮询
7. **Keeper 机器人**：自动执行限价单和 TP/SL
8. **交易深度图**：Order Book 可视化

---

## 【测试建议】

1. 部署修复后的合约到测试网
2. 测试资金费率方向：开多仓后检查是否正确扣除/返还
3. 测试 TP/SL：设置后触发价格条件验证执行
4. 测试部分平仓：25%/50%/75% 平仓验证
5. 测试清算：模拟价格变动触发清算
6. 测试保险基金：穿仓时验证保险基金赔付

---

*报告生成时间: 2026-06-13*
*分析框架: 三 Skill 协同 (马斯克 + 女娲 + 达尔文)*
