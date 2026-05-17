# DogePad 合约部署文档

> 网络：BSC 测试网 (Chain ID: 97)
> 部署时间：2026-05-14
> 部署者：0x3551...7Bf1

---

## 合约地址一览

| 合约 | 地址 | 用途 |
|------|------|------|
| **LaunchDAO** | `0x263c7b31c1Ca130F363467c54d0aD8dBe36EA657` | DAO 投票与候选币管理 |
| **BondingCurve** | `0x9440736180F32723b4E8c7DbcA4CFa288935F355` | 曲线定价与代币发射核心 |
| **BondingCurveFactory** | `0xE9DEC6193a32B5520617b7eCF1D6cfafba40898B` | 曲线合约工厂 |
| **LongPool** | `0x28b6322bb488706a7487D74b0106A00AA584A228` | 做多池 |
| **ShortPool** | `0x709bdBC6dC24276D10Dca79b732bB7F018398946` | 做空池 |
| **BuyAndBurnEngine** | `0x63940E8B9Df7608a689798af42d156876b753802` | 购买并销毁引擎 |
| **FeeDistributor** | `0x7736C3E7434D2BA964e65254ceBEf5273d381c0d` | 手续费分配器 |
| **PriceOracle** | `0xbc91660D4a4a4642A891230BF9DDF40B3d2A3E50` | 价格预言机 |
| **CreatorRewardManager** | `0xbeeCe0EE103c51ae4eFB9AFefA529355030dDfb5` | 创建者奖励管理 |
| **ExponentialRateModel** | `0x2d52836FFCBF012e9C46b4a4d9227820aAb37C2f` | 指数利率模型 |
| **LinearRateModel** | `0xF78209d0DB139AC8E162EE43C84f90C686ae09dC` | 线性利率模型 |

---

## 各合约功能详解

### 1. LaunchDAO — DAO 投票与候选币管理

**地址**：`0x263c7b31c1Ca130F363467c54d0aD8dBe36EA657`

DogePad 的核心入口，管理候选代币的完整生命周期。

**主要功能**：
- `submitCandidate(name, symbol, metadataURI, tier)` — 提交新候选币，需支付对应档位费用
- `renewCandidate(candidateId, tier)` — 创建者在宽限期内续费
- `claimRecycled(candidateId, tier)` — 宽限期过后，任何人可认领废弃候选币
- `refundExpired(candidateId)` — 退款过期候选币
- `getActiveCandidates()` — 获取所有活跃候选币列表
- `getGracePeriodCandidates()` — 获取宽限期内候选币列表
- `getRecyclableCandidates()` — 获取可回收候选币列表

**三档位系统**：

| 档位 | 时长 | 费用 | 宽限期 |
|------|------|------|--------|
| Day1 | 1 天 | 0.01 BNB | 1 天 |
| Day7 | 7 天 | 0.03 BNB | 7 天 |
| Day30 | 30 天 | 0.05 BNB | 30 天 |

**候选币生命周期**：
```
提交(Active) → 过期(GracePeriod) → 废弃(Recyclable) → 被认领(Active)
                  ↓                      ↓
            创建者可续费            任何人可认领成为新创建者
```

---

### 2. BondingCurve — 曲线定价与代币发射核心

**地址**：`0x9440736180F32723b4E8c7DbcA4CFa288935F355`

DogePad 的定价引擎，采用联合曲线（Bonding Curve）机制为代币定价。

**主要功能**：
- 根据买卖量自动调整代币价格
- 管理代币的买入/卖出手续费
- 当市值达到阈值时触发 PancakeSwap 上线
- 协调 LongPool 和 ShortPool 的操作
- 控制手续费流向 FeeDistributor

**定价公式**：价格随供给量增加而上升，卖出时价格下降，差价形成曲线利润。

---

### 3. BondingCurveFactory — 曲线合约工厂

**地址**：`0xE9DEC6193a32B5520617b7eCF1D6cfafba40898B`

为每个新发射的代币创建独立的 BondingCurve 实例。

**工作流程**：
1. DAO 投票选出获胜候选币
2. Factory 创建新的 BondingCurve 合约
3. 新代币在该曲线上开始交易

---

### 4. LongPool — 做多池

**地址**：`0x28b6322bb488706a7487D74b0106A00AA584A228`

用户可以存入 BNB 做多代币，赚取利息收益。

**主要功能**：
- 接受 BNB 存款，按利率模型计算收益
- 早期阶段使用 ExponentialRateModel（高利率吸引流动性）
- 成熟阶段切换为 LinearRateModel（稳定利率）
- 利息收入分配给存款用户

---

### 5. ShortPool — 做空池

**地址**：`0x709bdBC6dC24276D10Dca79b732bB7F018398946`

用户可以存入 BNB 做空代币，与做多池形成对冲。

**主要功能**：
- 接受 BNB 存款用于做空
- 利息分配：部分给 BuyAndBurnEngine（销毁），部分给 platformTreasury（FeeDistributor）
- 与 LongPool 联动，共享价格预言机数据
- 使用与 LongPool 相同的利率模型

---

### 6. BuyAndBurnEngine — 购买并销毁引擎

**地址**：`0x63940E8B9Df7608a689798af42d156876b753802`

通缩引擎，定期从市场购买 DOGE 代币并销毁。

**主要功能**：
- 接收来自做空池和手续费分配器的 BNB
- 通过 PancakeSwap 购买 DOGE 代币
- 将购买的 DOGE 代币发送到销毁地址
- Keeper 机制触发定期执行

---

### 7. FeeDistributor — 手续费分配器

**地址**：`0x7736C3E7434D2BA964e65254ceBEf5273d381c0d`

收集并分配平台所有手续费收入。

**主要功能**：
- 接收来自 BondingCurve 的交易手续费
- 接收来自 LaunchDAO 的候选币提交费
- 接收来自 ShortPool 的 treasury 份额
- 将 BNB 通过 PancakeSwap 购买 DOGE 代币
- DOGE 代币分配给质押者作为分红
- 剩余 BNB 转入 BuyAndBurnEngine 进行销毁

**⚠️ 待完成**：需在 DOGE 代币创建后调用 `setFairToken(dogeTokenAddr)`

---

### 8. PriceOracle — 价格预言机

**地址**：`0xbc91660D4a4a4642A891230BF9DDF40B3d2A3E50`

为 LongPool 和 ShortPool 提供代币价格数据。

**主要功能**：
- 存储和更新代币价格
- 仅授权合约（BondingCurve、LongPool、ShortPool）可更新价格
- 提供价格查询接口

---

### 9. CreatorRewardManager — 创建者奖励管理

**地址**：`0xbeeCe0EE103c51ae4eFB9AFefA529355030dDfb5`

管理代币创建者的奖励分配。

**主要功能**：
- 代币成功上线后，创建者获得一定比例的奖励
- 奖励从交易手续费中提取
- 防止创建者提前套现

---

### 10. ExponentialRateModel — 指数利率模型

**地址**：`0x2d52836FFCBF012e9C46b4a4d9227820aAb37C2f`

早期阶段使用，利率随时间指数增长，吸引早期流动性提供者。

---

### 11. LinearRateModel — 线性利率模型

**地址**：`0xF78209d0DB139AC8E162EE43C84f90C686ae09dC`

成熟阶段使用，利率线性增长，提供稳定的收益预期。

---

## 系统工作流程

### 完整的代币发射流程

```
┌─────────────────────────────────────────────────────────────┐
│                    DogePad 代币发射全流程                      │
└─────────────────────────────────────────────────────────────┘

第1步：提交候选币
  用户 → LaunchDAO.submitCandidate(name, symbol, metadataURI, tier)
       → 支付 0.01/0.03/0.05 BNB（根据档位）
       → 候选币进入 Active 状态

第2步：DAO 投票
  用户 → 在 DaoVote 页面选择候选币
       → 质押 BNB + 设定承诺比例 → 获得投票权重
       → 质押 DOGE 代币 → 额外 +15% 权重加成

第3步：候选币过期/续费/回收
  Active → 过期 → GracePeriod（创建者可续费）
                  → Recyclable（任何人可认领）

第4步：代币发射（投票胜出）
  LaunchDAO → BondingCurveFactory.createCurve()
            → 创建新的 BondingCurve 实例
            → 部署新代币合约（xxxDOGE）
            → 代币开始在曲线上交易

第5步：曲线交易
  买入 → BondingCurve → 价格上升 → 手续费 → FeeDistributor
  卖出 → BondingCurve → 价格下降 → 手续费 → FeeDistributor

第6步：做多做空
  做多 → LongPool 存入 BNB → 赚取利息
  做空 → ShortPool 存入 BNB → 赚取利息
       → ShortPool 利息分流：
         ├→ BuyAndBurnEngine（购买并销毁 DOGE）
         └→ FeeDistributor（平台收入）

第7步：市值达标上线
  BondingCurve 检测市值达到阈值
  → 自动在 PancakeSwap 创建交易对
  → 添加流动性
  → 代币正式上线 DEX

第8步：手续费分配循环
  FeeDistributor 收集所有手续费
  → 购买 DOGE 代币
  → 分配给 DOGE 质押者（分红）
  → 剩余转入 BuyAndBurnEngine
  → BuyAndBurnEngine 购买 DOGE 并销毁
  → DOGE 通缩 → 价格上涨 → 质押者收益增加
```

### 手续费流向图

```
                    ┌──────────────┐
                    │  BondingCurve │
                    │  (交易手续费)  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐     ┌──────────────┐
                    │FeeDistributor │◄────│  LaunchDAO   │
                    │  (手续费分配)  │     │ (提交费+罚金) │
                    └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
                    ▼              ▼
            ┌──────────┐   ┌──────────────┐
            │ 购买DOGE │   │BuyAndBurnEngine│◄── ShortPool利息
            │ 分给质押者│   │  (购买+销毁)   │
            └──────────┘   └──────┬───────┘
                                  │
                                  ▼
                           ┌──────────┐
                           │ 销毁DOGE │
                           │ (通缩)   │
                           └──────────┘
```

---

## 待完成事项

1. **FeeDistributor.setFairToken()** — DOGE 代币创建后需调用
2. **LaunchDAO.setFairToken()** — DOGE 代币创建后需调用
3. **BuyAndBurnEngine.setKeeper()** — 生产环境需更换 keeper 地址
4. **转移所有权** — 所有合约的 owner 应转移到多签钱包
