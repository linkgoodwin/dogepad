## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层"
        "React DApp" --- "Wagmi/Web3Modal"
        "React DApp" --- "Zustand 状态管理"
        "React DApp" --- "ECharts 图表(含利率曲线)"
    end

    subgraph "智能合约层 (BSC)"
        "BondingCurveFactory" --- "BondingCurveToken"
        "BondingCurveFactory" --- "BondingCurve"
        "BondingCurve" --- "PancakeSwap Router"
        "ShortPool" --- "ExponentialRateModel"
        "LongPool" --- "LinearRateModel"
        "BuyAndBurnEngine" --- "PancakeSwap Router"
        "BuyAndBurnEngine" --- "ShortPool"
        "BuyAndBurnEngine" --- "LongPool"
        "LiquidationManager" --- "ShortPool"
        "LiquidationManager" --- "LongPool"
        "PriceOracle" --- "ShortPool"
        "PriceOracle" --- "LongPool"
    end

    subgraph "数据索引层"
        "The Graph" --- "合约事件监听"
    end

    "React DApp" --> "智能合约层 (BSC)"
    "React DApp" --> "数据索引层"
```

## 2. 技术说明

- **前端**：React 18 + TypeScript + TailwindCSS 3 + Vite
- **Web3 交互**：Wagmi v2 + Viem + Web3Modal
- **状态管理**：Zustand
- **图表库**：ECharts（K线图、联合曲线可视化、指数利率曲线）
- **智能合约**：Solidity 0.8.x + Hardhat
- **链**：BSC 主网 / BSC 测试网
- **DEX 集成**：PancakeSwap V2 Router
- **价格预言机**：Chainlink BSC Feed + PancakeSwap TWAP（双源）

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| `/` | 首页，平台数据概览与热门代币 |
| `/create` | 发币页，创建新代币 |
| `/token/:address` | 代币交易页，联合曲线交易+做空/做多面板 |
| `/lend` | 借贷市场页，双池展示+利率曲线 |
| `/lend/:asset` | 借贷操作页，做多/做空操作 |
| `/portfolio` | 持仓页，用户资产与借贷头寸 |

## 4. 智能合约架构

### 4.1 合约模块划分

```mermaid
flowchart LR
    subgraph "发币模块"
        "A[BondingCurveFactory]" --> "B[BondingCurveToken]"
        "A" --> "C[BondingCurve]"
        "C" --> "D[PancakeSwap Integration]"
    end

    subgraph "双池借贷模块"
        "E[LongPool 做多池]" --> "F[LinearRateModel]"
        "G[ShortPool 做空池]" --> "H[ExponentialRateModel]"
        "E" --- "G"
    end

    subgraph "购入销毁模块"
        "I[BuyAndBurnEngine]" --> "D"
        "I" --> "E"
        "I" --> "G"
    end

    subgraph "辅助模块"
        "J[PriceOracle]" --> "E"
        "J" --> "G"
        "K[LiquidationManager]" --> "E"
        "K" --> "G"
        "L[FeeDistributor]" --> "I"
        "M[AntiSniperGuard]" --> "C"
        "N[LPLockManager]" --> "D"
        "O[CreatorVesting]" --> "B"
    end
```

### 4.2 核心合约说明

#### BondingCurveFactory
- 创建代币 + 联合曲线合约对
- 收取创建费用（BNB）
- 管理所有已创建代币的注册表
- 设置资金分流比例（默认：65%外盘 / 25%做多池 / 10%做空池 / 5%平台金库）

#### BondingCurve
- 联合曲线核心逻辑
- 内盘打满时执行资金分流：
  - 65% BNB + 65% 币 → PancakeSwap addLiquidity
  - 25% BNB → LongPool.deposit()（其中 5% 走 BuyAndBurn）
  - 10% 币 → ShortPool.deposit()（做空池可借出供应量）
  - 5% BNB → FeeDistributor（平台金库）

#### LongPool（做多池）
- 存入 BNB：用户存入 BNB 赚取利息
  - 存入时 5% 自动转入 BuyAndBurnEngine
  - 95% 进入 BNB 储备
- 借出 BNB：用户抵押新币借出 BNB
  - 新币 LTV：15-30%（由 ShortPool 利用率动态调整，见互动机制）
  - 借款利率：LinearRateModel（2-10% APY）
  - 计息方式：按实际借贷时间精确计息，不足1小时按1小时计算
  - 健康因子：统一健康因子（与做空池头寸联合计算，见互动机制）

#### ShortPool（做空池）
- 存入新币：来自内盘分流的 10% 供应量
- 借出新币：用户抵押 BNB 借出新币做空
  - 抵押率：150%（借 1 BNB 等值币需 1.5 BNB 押金）
  - 借款利率：ExponentialRateModel（日化 1% 起步，指数暴涨）
  - 计息方式：按实际借贷时间精确计息，不足1小时按1小时计算
  - 开仓手续费：0.5%（防止闪电借还套利）
  - 做空池利用率上限：90%（防止利率无限增长）
  - 做空冷却期：代币上线后 24h 才开放做空
  - 健康因子：统一健康因子（与做多池头寸联合计算，见互动机制）
- 利息分配（动态比例，由做空池利用率决定）：
  - 利用率 < 30%：60%→做多池存款人 / 20%→购入销毁 / 20%→平台金库
  - 利用率 30-60%：40%→做多池存款人 / 40%→购入销毁 / 20%→平台金库
  - 利用率 > 60%：20%→做多池存款人 / 60%→购入销毁 / 20%→平台金库

#### TimeBasedInterest（按实际时间计息模块）
- 计息公式：
  - `actualDuration = block.timestamp - borrowTimestamp`
  - `billableDuration = max(actualDuration, 3600)`（不足1小时按1小时）
  - `interest = principal × dailyRate × (billableDuration / 86400)`
- 做空池秒利率：`(0.01 × e^(4.706 × u²)) / 86400`
- 做多池秒利率：`borrowAPY / 365 / 86400`
- 开仓手续费（仅做空池）：0.5%，借出时一次性收取，进入 BuyAndBurnEngine
- 链上精度：使用 `prb-math` 库进行高精度浮点运算

#### PoolInteraction（双池互动模块）
- 互动1：动态利息分配
  - 做空池利用率越高 → 更多利息流向购入销毁
  - 利用率 <30%: 20%→销毁 / 30-60%: 40%→销毁 / >60%: 60%→销毁
- 互动2：动态LTV联动
  - 做空池利用率影响做多池LTV
  - 利用率 <20%: LTV=30% / 20-50%: LTV=25% / 50-70%: LTV=20% / >70%: LTV=15%
  - 做空多→做多更保守→系统更安全
- 互动3：购入销毁强度联动
  - 做空池利用率影响销毁频率
  - 利用率 <30%: 阈值0.2 BNB / 30-60%: 阈值0.1 BNB / >60%: 阈值0.05 BNB
  - 利用率 >60%: 额外从做多池储备抽取2%用于销毁
- 互动4：统一健康因子
  - 同一用户在双池的头寸统一计算
  - `总抵押品 = 做多抵押币价值×LTV + 做空抵押BNB×抵押率`
  - `总借款 = 做多借出BNB + 做空借出币价值`
  - `统一健康因子 = 总抵押品 / 总借款`
  - 自然对冲识别：同时做多做空同一币→净敞口小→健康因子更高
  - 清算时统一处理，更公平

#### ExponentialRateModel（指数利率模型）
- 公式：`dailyRate = baseRate × e^(k × utilization²)`
- 参数：
  - baseRate = 0.01（日化 1%）
  - k = 4.706
- 利用率 0% → 日利率 1%
- 利用率 50% → 日利率 3.24%
- 利用率 70% → 日利率 10.03%
- 利用率 85% → 日利率 30.01%
- 利用率 95% → 日利率 69.80%
- 每秒复利计算，链上使用 `prb-math` 精度库

#### LinearRateModel（线性利率模型）
- 做多池使用传统 Aave 式利率模型
- 基础利率 2% APY，最优利率 10% APY（利用率 80%）

#### BuyAndBurnEngine（购入销毁引擎）
- 资金来源：
  - LongPool 存款的 5%
  - ShortPool 利息的 30%
  - 交易手续费的 20%
- 执行逻辑：
  - 累积 BNB > burnThreshold（0.1 BNB）时触发
  - 调用 PancakeSwap swapExactETHForTokens
  - 将买入的代币 transfer 到 0x000...dEaD 销毁
  - 发出 TokenBurned 事件
- 安全措施：
  - 滑点保护：最大 5%
  - 单次销毁上限：1 BNB
  - 时间间隔：最少 30 秒一次

#### PriceOracle
- 双源价格聚合：
  - 主源：Chainlink BSC 价格 Feed
  - 备源：PancakeSwap TWAP（4h 窗口）
- 新上线代币：使用 PancakeSwap TWAP

#### LiquidationManager
- 清算阈值：健康因子 < 1.1
- 清算奖励：5-10% 折扣
- 部分清算：最多清算 50% 头寸
- 清算流程：
  - LongPool：清算人用 BNB 买走抵押的新币
  - ShortPool：清算人用新币还债，获得折价 BNB

### 4.3 合约交互流程

**内盘打满→资金分流流程：**
```
BondingCurve 检测 BNB 储备 ≥ 阈值
  → 65% BNB + 65% 币 → PancakeSwap.addLiquidityETH → LP锁仓
  → 25% BNB → LongPool.depositFromCurve()
    → 5% → BuyAndBurnEngine.deposit()
    → 95% → LongPool BNB 储备
  → 10% 币 → ShortPool.depositFromCurve()
    → 增加做空池可借出量
  → 5% BNB → FeeDistributor
```

**做空流程：**
```
用户 → ShortPool.borrow(tokenAmount, bnbCollateral)
  → 检查做空冷却期
  → ExponentialRateModel.getRate(utilization) → 计算日利率
  → 检查 BNB 抵押 ≥ 150%
  → BondingCurveToken.transfer(user, tokenAmount)
  → 更新利用率
  → 利息按秒累积
```

**购入销毁流程：**
```
BuyAndBurnEngine.executeBurn()
  → 检查累积 BNB > burnThreshold
  → 检查距上次执行 > 30秒
  → PancakeSwap.swapExactETHForTokens(bnbAmount, minTokensOut)
  → BondingCurveToken.transfer(DEAD_ADDRESS, tokensBought)
  → emit TokenBurned(tokensBought, bnbUsed)
```

## 5. 前端状态管理

### 5.1 Zustand Store 划分

```
useWalletStore    - 钱包连接状态、地址、余额
useTokenStore     - 代币列表、搜索、筛选
useTradeStore     - 当前交易对、价格、深度
useLongPoolStore  - 做多池数据：BNB存款、借款利率、LTV
useShortPoolStore - 做空池数据：可借量、日利率、利用率
useBurnStore      - 购入销毁数据：累计销毁量、24h销毁、下次销毁
usePortfolioStore - 用户持仓、做多/做空头寸
useUIStore        - 主题、侧边栏、通知
```

### 5.2 链上数据流

```
合约事件 → The Graph 索引 → GraphQL API → React Query → Zustand Store → UI
实时利率 → Viem Contract Read → 轮询(10s) → Zustand Store → UI
交易操作 → Wagmi useContractWrite → 合约交互 → 事件确认 → 刷新状态
购入销毁 → BuyAndBurnEngine 事件 → 实时推送 → 火焰动画
```

## 6. 数据模型

### 6.1 The Graph Schema

```graphql
type Token @entity {
  id: ID!
  address: Bytes!
  name: String!
  symbol: String!
  creator: Bytes!
  curveAddress: Bytes!
  totalSupply: BigInt!
  burnedSupply: BigInt!
  marketCapBnb: BigDecimal!
  reserveBnb: BigDecimal!
  isListedOnDex: Boolean!
  createdAt: Int!
  trades: [Trade!]! @derivedFrom(field: "token")
  burnEvents: [BurnEvent!]! @derivedFrom(field: "token")
}

type Trade @entity {
  id: ID!
  token: Token!
  trader: Bytes!
  type: TradeType!
  tokenAmount: BigInt!
  bnbAmount: BigDecimal!
  price: BigDecimal!
  timestamp: Int!
}

enum TradeType {
  BUY
  SELL
  SHORT_OPEN
  SHORT_CLOSE
}

type BurnEvent @entity {
  id: ID!
  token: Token!
  tokensBurned: BigInt!
  bnbUsed: BigDecimal!
  timestamp: Int!
  transactionHash: Bytes!
}

type ShortPosition @entity {
  id: ID!
  borrower: Bytes!
  token: Token!
  collateralBnb: BigDecimal!
  borrowedTokens: BigInt!
  dailyRate: BigDecimal!
  utilizationAtOpen: BigDecimal!
  healthFactor: BigDecimal!
  openTimestamp: Int!
  closeTimestamp: Int
  status: PositionStatus!
}

enum PositionStatus {
  OPEN
  LIQUIDATED
  CLOSED
}

type LongPosition @entity {
  id: ID!
  borrower: Bytes!
  token: Token!
  collateralTokens: BigInt!
  borrowedBnb: BigDecimal!
  ltv: BigDecimal!
  healthFactor: BigDecimal!
  openTimestamp: Int!
}
```

## 7. 安全考量

### 7.1 闪电贷防护体系（5层封锁）

- **第1层：同区块操作封锁**
  - 同一地址同一区块只能执行一次池子操作（借/还/存/取）
  - `mapping(address => uint256) lastInteractionBlock` 记录最后操作区块
  - 每次操作检查 `block.number > lastInteractionBlock[msg.sender]`
  - 彻底封锁本池闪电贷和MEV原子包

- **第2层：1小时最低计费 + 开仓手续费**
  - 不足1小时按1小时计费：`billableDuration = max(actual, 3600)`
  - 做空开仓手续费0.5%，借出时一次性收取进入BuyAndBurnEngine
  - 即使跨区块借还，最低成本 = 0.5% + 1小时利率

- **第3层：TWAP 4h + 延迟价格生效**
  - 价格预言机使用4小时时间加权均价
  - 价格更新后10分钟延迟才用于清算和LTV计算
  - 外部闪电贷操纵的瞬间价格不影响系统

- **第4层：单笔借款上限 + 跨池冷却**
  - 单地址单次最多借出池子5%可借量
  - 一个池子借出后2个区块内不能操作另一个池子
  - 限制单次攻击规模，防跨池套利

- **第5层：购入销毁保护**
  - Keeper白名单 + Flashbots私有交易提交
  - 1-5区块随机延迟执行，防三明治攻击
  - 最大5%滑点保护，超滑点跳过本次销毁

### 7.2 其他安全措施

- **指数利率防操纵**：利率基于全局利用率（不可被单地址操纵），链上使用 prb-math 精度计算
- **做空冷却期**：代币上线 24h 内不可做空，防止开盘砸盘
- **做空池利用率上限**：90%，防止利率无限增长导致系统风险
- **做空抵押率 150%**：确保清算时有足够缓冲
- **重入攻击**：Checks-Effects-Interactions + ReentrancyGuard
- **紧急暂停**：所有合约 Pausable
- **Owner 多签 + Timelock**：主网部署后执行

## 8. 开发阶段规划

### Phase 1 - 核心发币（MVP）
- BondingCurveFactory + BondingCurve + BondingCurveToken 合约
- 前端：首页 + 发币页 + 代币交易页
- 基础钱包连接与交易

### Phase 2 - 双池借贷 + 指数利率
- LongPool + LinearRateModel 合约
- ShortPool + ExponentialRateModel 合约
- 前端：借贷市场页（双池展示 + 利率曲线可视化）+ 借贷操作页（做多/做空）

### Phase 3 - 购入销毁引擎
- BuyAndBurnEngine 合约
- PancakeSwap 集成
- 前端：购入销毁面板、实时销毁数据、火焰动画

### Phase 4 - 清算 + 安全
- LiquidationManager 合约
- PriceOracle 双源集成
- AntiSniperGuard 合约
- 安全测试与审计准备

### Phase 5 - 数据与优化
- The Graph 索引部署
- 持仓页完善
- 性能优化、移动端适配
- 主网部署
