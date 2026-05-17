const PP = 10n ** 18n;
const BASE_PRICE = 100n * 10n ** 9n;
const SLOPE = 10000n;
const FEE_BPS = 100n;
const DEX_THRESHOLD = 30n * PP;
const ONE_BNB = PP;
const BNB_USD = 1000;
const TOTAL_SUPPLY = 1000000000n;

const CREATION_FEE = 10n ** 17n;
const LP_RATIO = 65;
const LONG_POOL_RATIO = 20;
const SHORT_POOL_TOKEN_RATIO = 10;
const BURN_ENGINE_RATIO = 10;
const PLATFORM_RATIO = 5;

const BASE_TAX_SHARE_BPS = 5000n;
const BASE_LP_SHARE_BPS = 1000n;
const BASE_TOKEN_ALLOCATION_BPS = 500n;
const SHARE_MULTIPLIER_1 = 10000n;
const SHARE_MULTIPLIER_2 = 4500n;
const SHARE_MULTIPLIER_3 = 2800n;

const DEX_BUY_TAX_BPS = 100n;
const DEX_SELL_TAX_BPS = 200n;

const TARGET_MC_USD = 1000000;
const TARGET_PRICE_USD = TARGET_MC_USD / Number(TOTAL_SUPPLY);

function bigIntSqrt(n) {
  if (n === 0n) return 0n;
  let z = n;
  let y = (n + 1n) / 2n;
  while (y < z) {
    z = y;
    y = (n / y + y) / 2n;
  }
  return z;
}

function getPrice(s) {
  return BASE_PRICE + (SLOPE * s) / PP;
}

function calculateBuyAmount(s0, bnbAmount) {
  const priceS0 = getPrice(s0);
  if (SLOPE === 0n) {
    if (priceS0 === 0n) return 0n;
    return (bnbAmount * PP) / priceS0;
  }
  const discriminant = priceS0 * priceS0 + 2n * SLOPE * bnbAmount;
  const sqrtD = bigIntSqrt(discriminant);
  const s1 = s0 + ((sqrtD - priceS0) * PP) / SLOPE;
  if (s1 <= s0) return 0n;
  return s1 - s0;
}

function fmtBnb(wei) {
  return (Number(wei * 1000000n / PP) / 1000000).toFixed(6);
}
function fmtUsd(bnb) {
  return (Number(bnb) * BNB_USD).toFixed(2);
}
function fmtTok(wei) {
  const full = Number(wei * 10000n / PP) / 10000;
  if (full >= 1000000) return (full / 1000000).toFixed(2) + "M";
  if (full >= 1000) return (full / 1000).toFixed(2) + "K";
  return full.toFixed(2);
}
function fmtPct(num, den) {
  return (Number(num) / Number(den) * 100).toFixed(2);
}
function pad(s, len) {
  return String(s).padStart(len);
}

let tokensSold = 0n;
let reserveBnb = 0n;
let totalBuyBnb = 0n;
let totalBuyFees = 0n;

const myBuyBnb = ONE_BNB;
const myFee = (myBuyBnb * FEE_BPS) / 10000n;
const myAfterFee = myBuyBnb - myFee;
const myTokens = calculateBuyAmount(tokensSold, myAfterFee);
tokensSold += myTokens;
reserveBnb += myAfterFee;
totalBuyBnb += myBuyBnb;
totalBuyFees += myFee;

while (reserveBnb < DEX_THRESHOLD) {
  const stepBnb = ONE_BNB;
  const stepFee = (stepBnb * FEE_BPS) / 10000n;
  const stepAfterFee = stepBnb - stepFee;
  const stepTokens = calculateBuyAmount(tokensSold, stepAfterFee);
  if (stepTokens === 0n) break;
  tokensSold += stepTokens;
  reserveBnb += stepAfterFee;
  totalBuyBnb += stepBnb;
  totalBuyFees += stepFee;
}

const totalTokensInCurve = PP * TOTAL_SUPPLY - tokensSold;
const priceAtDex = Number(getPrice(tokensSold)) / Number(PP);
const mcAtDex = priceAtDex * Number(TOTAL_SUPPLY) * BNB_USD;

const lpBnb = (reserveBnb * BigInt(LP_RATIO)) / 100n;
const lpTokens = (totalTokensInCurve * BigInt(LP_RATIO)) / 100n;
const longPoolBnb = (reserveBnb * BigInt(LONG_POOL_RATIO)) / 100n;
const shortPoolTokens = (totalTokensInCurve * BigInt(SHORT_POOL_TOKEN_RATIO)) / 100n;
const burnEngineBnb = (reserveBnb * BigInt(BURN_ENGINE_RATIO)) / 100n;
const platformBnb = (reserveBnb * BigInt(PLATFORM_RATIO)) / 100n;
const accountedBnb = lpBnb + longPoolBnb + burnEngineBnb + platformBnb;
const longPoolBnbActual = longPoolBnb + (reserveBnb - accountedBnb);

const targetPriceBnb = TARGET_PRICE_USD / BNB_USD;
const myTokensValueBnbAtTarget = Number(myTokens) / Number(PP) * targetPriceBnb;
const mySellTax = myTokensValueBnbAtTarget * Number(DEX_SELL_TAX_BPS) / 10000;
const myNetBnb = myTokensValueBnbAtTarget - mySellTax;
const myProfitBnb = myNetBnb - 1;
const myRoi = (myNetBnb / 1 - 1) * 100;

console.log("=".repeat(78));
console.log("  FairForge 三方收益计算 — 每天发1个币，市值达$1,000,000");
console.log("=".repeat(78));
console.log();
console.log(`  基础参数:`);
console.log(`    BNB价格 = $${BNB_USD} | 总供应量 = 1B | DEX阈值 = 30 BNB`);
console.log(`    内盘手续费 = 1% | DEX买税 = 1% | DEX卖税 = 2%`);
console.log(`    目标市值 = $${TARGET_MC_USD.toLocaleString()} → 目标价格 = $${TARGET_PRICE_USD.toFixed(6)}/token`);
console.log(`    内盘结束时市值 ≈ $${mcAtDex.toFixed(0)} → 价格 = $${(priceAtDex * BNB_USD).toFixed(6)}/token`);
console.log(`    目标价格是内盘结束价格的 ${(TARGET_PRICE_USD / (priceAtDex * BNB_USD)).toFixed(2)}x`);
console.log();

console.log("─".repeat(78));
console.log("  一、我的收益（第一时间买入1 BNB）");
console.log("─".repeat(78));
console.log(`  投入:           1.000000 BNB ($1,000.00)`);
console.log(`  买入手续费:     ${fmtBnb(myFee)} BNB ($${fmtUsd(myFee)})`);
console.log(`  获得代币:       ${fmtTok(myTokens)} 个`);
console.log(`  占流通量:       ${(Number(myTokens) / Number(tokensSold) * 100).toFixed(2)}%`);
console.log();
console.log(`  ─── 内盘结束时卖出 ───`);
const sellAtDexRaw = Number(fmtBnb(
  (() => {
    const s1 = tokensSold;
    const s0 = s1 - myTokens;
    const p1 = getPrice(s1);
    const p0 = getPrice(s0);
    return (myTokens * (p0 + p1)) / (2n * PP);
  })()
));
const sellAtDexFee = sellAtDexRaw * 1 / 100;
const sellAtDexNet = sellAtDexRaw - sellAtDexFee;
console.log(`  卖出价值(扣1%手续费): ${sellAtDexNet.toFixed(6)} BNB ($${(sellAtDexNet * BNB_USD).toFixed(2)})`);
console.log(`  净利润:               ${(sellAtDexNet - 1).toFixed(6)} BNB ($${((sellAtDexNet - 1) * BNB_USD).toFixed(2)})`);
console.log(`  ROI:                  ${((sellAtDexNet / 1 - 1) * 100).toFixed(1)}%`);
console.log();
console.log(`  ─── DEX达到$1M市值时卖出 ───`);
console.log(`  代币价格:       $${TARGET_PRICE_USD.toFixed(6)}/token (${targetPriceBnb.toFixed(9)} BNB)`);
console.log(`  我的代币价值:   ${myTokensValueBnbAtTarget.toFixed(6)} BNB ($${(myTokensValueBnbAtTarget * BNB_USD).toFixed(2)})`);
console.log(`  卖出税(2%):     ${mySellTax.toFixed(6)} BNB ($${(mySellTax * BNB_USD).toFixed(2)})`);
console.log(`  实际到手:       ${myNetBnb.toFixed(6)} BNB ($${(myNetBnb * BNB_USD).toFixed(2)})`);
console.log(`  ★ 净利润:       ${myProfitBnb.toFixed(6)} BNB ($${(myProfitBnb * BNB_USD).toFixed(2)})`);
console.log(`  ★ ROI:          ${myRoi.toFixed(1)}%`);
console.log();

console.log("─".repeat(78));
console.log("  二、平台收益（每发射一个币）");
console.log("─".repeat(78));
console.log();
console.log(`  【即时收入】`);
const immCreation = 0.1;
const immBuyFees = Number(fmtBnb(totalBuyFees));
const immPlatformBnb = Number(fmtBnb(platformBnb));
const immTotal = immCreation + immBuyFees + immPlatformBnb;
console.log(`  1. 创建费:           ${immCreation.toFixed(6)} BNB ($${(immCreation * BNB_USD).toFixed(2)})`);
console.log(`  2. 内盘买入手续费:   ${immBuyFees.toFixed(6)} BNB ($${(immBuyFees * BNB_USD).toFixed(2)})`);
console.log(`  3. DEX上线平台BNB:   ${immPlatformBnb.toFixed(6)} BNB ($${(immPlatformBnb * BNB_USD).toFixed(2)})`);
console.log(`  ──────────────────────────────`);
console.log(`  即时收入合计:        ${immTotal.toFixed(6)} BNB ($${(immTotal * BNB_USD).toFixed(2)})`);
console.log();

console.log(`  【DEX上线后持续收入】(按$1M市值估算)`);
console.log();

const dailyVolumes = [50000, 100000, 500000];
for (const dv of dailyVolumes) {
  console.log(`  假设日交易量 = $${dv.toLocaleString()}:`);
  const avgTaxRate = (Number(DEX_BUY_TAX_BPS) + Number(DEX_SELL_TAX_BPS)) / 2 / 10000;

  for (const count of [1, 2, 3]) {
    let multiplier = 0n;
    if (count === 1) multiplier = SHARE_MULTIPLIER_1;
    else if (count === 2) multiplier = SHARE_MULTIPLIER_2;
    else multiplier = SHARE_MULTIPLIER_3;

    const creatorTaxBps = (BASE_TAX_SHARE_BPS * multiplier) / 10000n;
    const platformTaxBps = 10000n - creatorTaxBps;
    const creatorLpBps = (BASE_LP_SHARE_BPS * multiplier) / 10000n;
    const platformLpBps = 10000n - creatorLpBps;

    const dailyTaxUsd = dv * avgTaxRate * Number(platformTaxBps) / 10000;
    const dailyLpUsd = dv * 0.0025 * Number(platformLpBps) / 10000;
    const dailyTotalUsd = dailyTaxUsd + dailyLpUsd;

    const labels = ["", "1项", "2项", "3项"];
    console.log(`    创作者选${labels[count]}: 税收$${dailyTaxUsd.toFixed(0)}/天 + LP费$${dailyLpUsd.toFixed(0)}/天 = $${dailyTotalUsd.toFixed(0)}/天 ($${(dailyTotalUsd * 30).toFixed(0)}/月)`);
  }
  console.log();
}

console.log(`  【Burn Engine — FAIR代币价值引擎】`);
console.log(`  每个币上线注入: ${fmtBnb(burnEngineBnb)} BNB ($${fmtUsd(burnEngineBnb)}) 买入并销毁FAIR`);
console.log(`  每月(30个币):   ${(Number(fmtBnb(burnEngineBnb)) * 30).toFixed(2)} BNB ($${(Number(fmtBnb(burnEngineBnb)) * 30 * BNB_USD).toFixed(0)}) 销毁FAIR`);
console.log();

console.log(`  【借贷系统资金池】`);
console.log(`  Long Pool:  ${fmtBnb(longPoolBnbActual)} BNB ($${fmtUsd(longPoolBnbActual)})`);
console.log(`  Short Pool: ${fmtTok(shortPoolTokens)} tokens`);
console.log();

console.log("─".repeat(78));
console.log("  三、创作者收益（每发射一个币，市值达$1M）");
console.log("─".repeat(78));
console.log();

for (const count of [1, 2, 3]) {
  let multiplier = 0n;
  if (count === 1) multiplier = SHARE_MULTIPLIER_1;
  else if (count === 2) multiplier = SHARE_MULTIPLIER_2;
  else multiplier = SHARE_MULTIPLIER_3;

  const creatorTaxBps = (BASE_TAX_SHARE_BPS * multiplier) / 10000n;
  const creatorLpBps = (BASE_LP_SHARE_BPS * multiplier) / 10000n;
  const creatorTokenBps = (BASE_TOKEN_ALLOCATION_BPS * multiplier) / 10000n;
  const creatorTokens = (totalTokensInCurve * creatorTokenBps) / 10000n;
  const platformLpBps = 10000n - creatorLpBps;

  const creatorTokensValue = Number(creatorTokens) / Number(PP) * TARGET_PRICE_USD;
  const creatorLpValueBnb = Number(fmtBnb(lpBnb)) * Number(creatorLpBps) / 10000;
  const creatorLpValueUsd = creatorLpValueBnb * BNB_USD;

  const labels = ["", "1项(各50%)", "2项(各22.5%)", "3项(各14%)"];
  console.log(`  ═══ 创作者选择 ${labels[count]} ═══`);
  console.log();

  if (count >= 1) {
    const taxSharePct = Number(creatorTaxBps) / 100;
    console.log(`  1. 税收分成 (${fmtPct(creatorTaxBps, 10000n)}%):`);
    for (const dv of [100000, 500000]) {
      const avgTaxRate = (Number(DEX_BUY_TAX_BPS) + Number(DEX_SELL_TAX_BPS)) / 2 / 10000;
      const dailyTax = dv * avgTaxRate * Number(creatorTaxBps) / 10000;
      console.log(`     日交易量$${dv.toLocaleString()} → 创作者税入 $${dailyTax.toFixed(0)}/天 ($${(dailyTax * 30).toFixed(0)}/月)`);
    }
  }

  if (count >= 2 || (count === 1)) {
    console.log(`  2. LP分成 (${fmtPct(creatorLpBps, 10000n)}%, 180天线性释放):`);
    console.log(`     LP价值: ${creatorLpValueBnb.toFixed(6)} BNB ($${creatorLpValueUsd.toFixed(2)})`);
    const lpDailyFees = 100000 * 0.0025 * Number(creatorLpBps) / 10000;
    console.log(`     日交易量$100K时LP手续费: ~$${lpDailyFees.toFixed(0)}/天`);
  }

  if (count >= 3 || (count <= 2)) {
    console.log(`  3. 代币分配 (${fmtPct(creatorTokenBps, 10000n)}%, 90天悬崖+360天线性释放):`);
    console.log(`     代币数量: ${fmtTok(creatorTokens)}`);
    console.log(`     $1M市值时价值: $${creatorTokensValue.toFixed(2)} (${(creatorTokensValue / BNB_USD).toFixed(6)} BNB)`);
  }

  const totalVestedValue = creatorTokensValue + creatorLpValueUsd;
  console.log();
  console.log(`  ★ 锁仓总价值(不含税收): $${totalVestedValue.toFixed(2)}`);
  console.log();
}

console.log("─".repeat(78));
console.log("  四、三方收益汇总对比（$1M市值，创作者选3项）");
console.log("─".repeat(78));
console.log();

const count3 = 3;
const mult3 = SHARE_MULTIPLIER_3;
const c3TaxBps = (BASE_TAX_SHARE_BPS * mult3) / 10000n;
const c3LpBps = (BASE_LP_SHARE_BPS * mult3) / 10000n;
const c3TokenBps = (BASE_TOKEN_ALLOCATION_BPS * mult3) / 10000n;
const c3Tokens = (totalTokensInCurve * c3TokenBps) / 10000n;
const c3TokenValue = Number(c3Tokens) / Number(PP) * TARGET_PRICE_USD;
const c3LpValueBnb = Number(fmtBnb(lpBnb)) * Number(c3LpBps) / 10000;
const c3LpValueUsd = c3LpValueBnb * BNB_USD;
const p3TaxBps = 10000n - c3TaxBps;
const p3LpBps = 10000n - c3LpBps;

console.log(`  ┌──────────────┬─────────────────────┬──────────────────────┐`);
console.log(`  │              │   即时/锁仓收益      │  月持续收益(日量$100K) │`);
console.log(`  ├──────────────┼─────────────────────┼──────────────────────┤`);
console.log(`  │ 我(早买1BNB) │  $${(myProfitBnb * BNB_USD).toFixed(0).padStart(7)} (${myRoi.toFixed(0)}% ROI)  │  一次卖出后结束      │`);
console.log(`  │ 平台         │  $${(immTotal * BNB_USD).toFixed(0).padStart(7)} (即时)       │  $${(100000 * 0.015 * Number(p3TaxBps) / 10000 * 30 + 100000 * 0.0025 * Number(p3LpBps) / 10000 * 30).toFixed(0)}/月          │`);
console.log(`  │ 创作者       │  $${(c3TokenValue + c3LpValueUsd).toFixed(0).padStart(7)} (锁仓释放)   │  $${(100000 * 0.015 * Number(c3TaxBps) / 10000 * 30).toFixed(0)}/月           │`);
console.log(`  └──────────────┴─────────────────────┴──────────────────────┘`);
console.log();

console.log("─".repeat(78));
console.log("  五、月度/年度收益推算（每天1个币，$1M市值，日交易量$100K）");
console.log("─".repeat(78));
console.log();

const monthlyTokens = 30;
const dailyVol = 100000;
const avgTaxRate = (Number(DEX_BUY_TAX_BPS) + Number(DEX_SELL_TAX_BPS)) / 2 / 10000;

for (const count of [1, 2, 3]) {
  let multiplier = 0n;
  if (count === 1) multiplier = SHARE_MULTIPLIER_1;
  else if (count === 2) multiplier = SHARE_MULTIPLIER_2;
  else multiplier = SHARE_MULTIPLIER_3;

  const cTaxBps = (BASE_TAX_SHARE_BPS * multiplier) / 10000n;
  const cLpBps = (BASE_LP_SHARE_BPS * multiplier) / 10000n;
  const cTokenBps = (BASE_TOKEN_ALLOCATION_BPS * multiplier) / 10000n;
  const cTokens = (totalTokensInCurve * cTokenBps) / 10000n;
  const cTokenVal = Number(cTokens) / Number(PP) * TARGET_PRICE_USD;
  const cLpValBnb = Number(fmtBnb(lpBnb)) * Number(cLpBps) / 10000;
  const cLpValUsd = cLpValBnb * BNB_USD;
  const pTaxBps = 10000n - cTaxBps;
  const pLpBps = 10000n - cLpBps;

  const labels = ["", "1项(50%)", "2项(22.5%)", "3项(14%)"];
  console.log(`  ═══ 创作者选${labels[count]} ═══`);
  console.log();

  const myMonthly = myProfitBnb * BNB_USD * monthlyTokens;
  const myYearly = myMonthly * 12;

  const platImmMonthly = immTotal * BNB_USD * monthlyTokens;
  const platOngoingMonthly = (dailyVol * avgTaxRate * Number(pTaxBps) / 10000 + dailyVol * 0.0025 * Number(pLpBps) / 10000) * monthlyTokens;
  const platMonthly = platImmMonthly + platOngoingMonthly;
  const platYearly = platMonthly * 12;

  const creatorVestedMonthly = (cTokenVal + cLpValUsd);
  const creatorTaxMonthly = dailyVol * avgTaxRate * Number(cTaxBps) / 10000 * 30;
  const creatorMonthly = creatorVestedMonthly + creatorTaxMonthly;
  const creatorYearly = creatorTaxMonthly * 12 + (cTokenVal + cLpValUsd) * monthlyTokens;

  const burnMonthly = Number(fmtBnb(burnEngineBnb)) * BNB_USD * monthlyTokens;
  const burnYearly = burnMonthly * 12;

  console.log(`  我(每天早买1BNB):`);
  console.log(`    月收益:  $${myMonthly.toFixed(0)} (${(myProfitBnb * monthlyTokens).toFixed(2)} BNB)`);
  console.log(`    年收益:  $${myYearly.toFixed(0)} (${(myProfitBnb * monthlyTokens * 12).toFixed(2)} BNB)`);
  console.log();
  console.log(`  平台:`);
  console.log(`    月即时:  $${platImmMonthly.toFixed(0)}`);
  console.log(`    月持续:  $${platOngoingMonthly.toFixed(0)}`);
  console.log(`    月合计:  $${platMonthly.toFixed(0)}`);
  console.log(`    年合计:  $${platYearly.toFixed(0)}`);
  console.log();
  console.log(`  创作者(每个币):`);
  console.log(`    锁仓价值:  $${(cTokenVal + cLpValUsd).toFixed(0)} (分期释放)`);
  console.log(`    月税收:    $${creatorTaxMonthly.toFixed(0)}`);
  console.log();
  console.log(`  FAIR Burn Engine:`);
  console.log(`    月销毁:  $${burnMonthly.toFixed(0)} (${(Number(fmtBnb(burnEngineBnb)) * monthlyTokens).toFixed(2)} BNB)`);
  console.log(`    年销毁:  $${burnYearly.toFixed(0)} (${(Number(fmtBnb(burnEngineBnb)) * monthlyTokens * 12).toFixed(2)} BNB)`);
  console.log();
}
