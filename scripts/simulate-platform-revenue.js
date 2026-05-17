const PP = 10n ** 18n;
const BASE_PRICE = 100n * 10n ** 9n;
const SLOPE = 10000n;
const FEE_BPS = 100n;
const DEX_THRESHOLD = 30n * PP;
const ONE_BNB = PP;
const BNB_USD = 1000;

const CREATION_FEE = 10n ** 17n;
const TOTAL_SUPPLY = 1000000000n * PP;

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

const DEX_BUY_TAX = 100n;
const DEX_SELL_TAX = 200n;

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

function calculateSellAmount(currentS, tokenAmount) {
  const s1 = currentS;
  const s0 = s1 - tokenAmount;
  const priceS1 = getPrice(s1);
  const priceS0 = getPrice(s0);
  return (tokenAmount * (priceS0 + priceS1)) / (2n * PP);
}

function fmtBnb(wei) {
  return (Number(wei * 1000000n / PP) / 1000000).toFixed(6);
}

function fmtUsd(wei) {
  return (fmtBnb(wei) * BNB_USD).toFixed(2);
}

function fmtTok(wei) {
  const full = Number(wei * 10000n / PP) / 10000;
  if (full >= 1000000) return (full / 1000000).toFixed(2) + "M";
  if (full >= 1000) return (full / 1000).toFixed(2) + "K";
  return full.toFixed(2);
}

function fmtPct(numerator, denominator) {
  return (Number(numerator) / Number(denominator) * 100).toFixed(2);
}

function simulate(incentiveCount) {
  let tokensSold = 0n;
  let reserveBnb = 0n;
  let totalBuyBnb = 0n;
  let totalBuyFees = 0n;
  let totalSellBnb = 0n;
  let totalSellFees = 0n;

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

  const totalTokensInCurve = TOTAL_SUPPLY - tokensSold;

  let multiplier = 0n;
  if (incentiveCount === 1) multiplier = SHARE_MULTIPLIER_1;
  else if (incentiveCount === 2) multiplier = SHARE_MULTIPLIER_2;
  else if (incentiveCount === 3) multiplier = SHARE_MULTIPLIER_3;

  const creatorTaxBps = (BASE_TAX_SHARE_BPS * multiplier) / 10000n;
  const creatorLpBps = (BASE_LP_SHARE_BPS * multiplier) / 10000n;
  const creatorTokenBps = (BASE_TOKEN_ALLOCATION_BPS * multiplier) / 10000n;

  const creatorTokens = (totalTokensInCurve * creatorTokenBps) / 10000n;

  const lpBnb = (reserveBnb * BigInt(LP_RATIO)) / 100n;
  const lpTokens = (totalTokensInCurve * BigInt(LP_RATIO)) / 100n;
  const longPoolBnb = (reserveBnb * BigInt(LONG_POOL_RATIO)) / 100n;
  const shortPoolTokens = (totalTokensInCurve * BigInt(SHORT_POOL_TOKEN_RATIO)) / 100n;
  const burnEngineBnb = (reserveBnb * BigInt(BURN_ENGINE_RATIO)) / 100n;
  const platformBnb = (reserveBnb * BigInt(PLATFORM_RATIO)) / 100n;

  const accountedBnb = lpBnb + longPoolBnb + burnEngineBnb + platformBnb;
  const longPoolBnbActual = longPoolBnb + (reserveBnb - accountedBnb);

  const accountedTokens = lpTokens + shortPoolTokens + creatorTokens;
  const burnedTokens = totalTokensInCurve - accountedTokens;

  const platformTaxShareBps = 10000n - creatorTaxBps;

  const immediateRevenue = {
    creationFee: CREATION_FEE,
    buyFees: totalBuyFees,
    sellFees: totalSellFees,
    platformBnb: platformBnb,
  };

  const totalImmediate = CREATION_FEE + totalBuyFees + totalSellFees + platformBnb;

  return {
    tokensSold,
    reserveBnb,
    totalBuyBnb,
    totalBuyFees,
    totalTokensInCurve,
    creatorTaxBps,
    creatorLpBps,
    creatorTokenBps,
    creatorTokens,
    lpBnb,
    lpTokens,
    longPoolBnb: longPoolBnbActual,
    shortPoolTokens,
    burnEngineBnb,
    platformBnb,
    burnedTokens,
    platformTaxShareBps,
    immediateRevenue,
    totalImmediate,
    incentiveCount,
    multiplier,
  };
}

console.log("=".repeat(75));
console.log("  FairForge Platform Revenue Per Token Launch");
console.log("  (Linear Bonding Curve: Price = BASE + SLOPE * s / PP)");
console.log("=".repeat(75));
console.log(`  BASE_PRICE = 100 gwei | SLOPE = ${SLOPE} | FEE = 1% buy/sell`);
console.log(`  DEX_THRESHOLD = 30 BNB | CREATION_FEE = ${fmtBnb(CREATION_FEE)} BNB`);
console.log(`  DEX Tax: buy ${Number(DEX_BUY_TAX) / 100}% / sell ${Number(DEX_SELL_TAX) / 100}%`);
console.log(`  BNB = $${BNB_USD} | Total Supply = 1B tokens`);
console.log();

for (const count of [1, 2, 3]) {
  const r = simulate(count);
  const labels = ["", "1 option (50% each)", "2 options (22.5% each)", "3 options (14% each)"];

  console.log(`${"=".repeat(75)}`);
  console.log(`  SCENARIO: Creator chose ${count} incentive(s) — ${labels[count]}`);
  console.log(`${"=".repeat(75)}`);
  console.log();

  console.log("  --- Bonding Curve Phase ---");
  console.log(`  Total BNB spent by buyers:     ${fmtBnb(r.totalBuyBnb)} BNB ($${fmtUsd(r.totalBuyBnb)})`);
  console.log(`  Total tokens sold:             ${fmtTok(r.tokensSold)} tokens`);
  console.log(`  Reserve at DEX listing:        ${fmtBnb(r.reserveBnb)} BNB`);
  console.log(`  Tokens remaining in curve:     ${fmtTok(r.totalTokensInCurve)} tokens`);
  console.log();

  console.log("  --- DEX Listing BNB Distribution ---");
  console.log(`  LP Pool (65%):                 ${fmtBnb(r.lpBnb)} BNB ($${fmtUsd(r.lpBnb)})`);
  console.log(`  Long Pool (20%+):              ${fmtBnb(r.longPoolBnb)} BNB ($${fmtUsd(r.longPoolBnb)})`);
  console.log(`  Burn Engine (10%):             ${fmtBnb(r.burnEngineBnb)} BNB ($${fmtUsd(r.burnEngineBnb)})`);
  console.log(`  Platform (5%):                 ${fmtBnb(r.platformBnb)} BNB ($${fmtUsd(r.platformBnb)})`);
  console.log();

  console.log("  --- DEX Listing Token Distribution ---");
  console.log(`  LP Pool (65%):                 ${fmtTok(r.lpTokens)} tokens`);
  console.log(`  Short Pool (10%):              ${fmtTok(r.shortPoolTokens)} tokens`);
  console.log(`  Creator tokens (${fmtPct(r.creatorTokenBps, 10000n)}%):       ${fmtTok(r.creatorTokens)} tokens (vested)`);
  console.log(`  Burned:                        ${fmtTok(r.burnedTokens)} tokens`);
  console.log();

  console.log("  --- Creator Incentive Details ---");
  console.log(`  Tax share:     ${fmtPct(r.creatorTaxBps, 10000n)}% of DEX tax → Platform keeps ${fmtPct(r.platformTaxShareBps, 10000n)}%`);
  console.log(`  LP share:      ${fmtPct(r.creatorLpBps, 10000n)}% of LP tokens (vested 180 days) → Platform keeps ${fmtPct(10000n - r.creatorLpBps, 10000n)}%`);
  console.log(`  Token alloc:   ${fmtPct(r.creatorTokenBps, 10000n)}% of curve tokens (vested 90d cliff + 360d)`);
  console.log();

  console.log("  ╔══════════════════════════════════════════════════════════════╗");
  console.log("  ║           PLATFORM IMMEDIATE REVENUE (BNB)                 ║");
  console.log("  ╠══════════════════════════════════════════════════════════════╣");
  console.log(`  ║  1. Creation fee:          ${fmtBnb(r.immediateRevenue.creationFee).padStart(10)} BNB  ($${fmtUsd(r.immediateRevenue.creationFee).padStart(10)})  ║`);
  console.log(`  ║  2. Buy fees (1%):         ${fmtBnb(r.immediateRevenue.buyFees).padStart(10)} BNB  ($${fmtUsd(r.immediateRevenue.buyFees).padStart(10)})  ║`);
  console.log(`  ║  3. Sell fees (1%):        ${fmtBnb(r.immediateRevenue.sellFees).padStart(10)} BNB  ($${fmtUsd(r.immediateRevenue.sellFees).padStart(10)})  ║`);
  console.log(`  ║  4. Platform BNB (5%):     ${fmtBnb(r.immediateRevenue.platformBnb).padStart(10)} BNB  ($${fmtUsd(r.immediateRevenue.platformBnb).padStart(10)})  ║`);
  console.log("  ╠══════════════════════════════════════════════════════════════╣");
  console.log(`  ║  TOTAL IMMEDIATE:          ${fmtBnb(r.totalImmediate).padStart(10)} BNB  ($${fmtUsd(r.totalImmediate).padStart(10)})  ║`);
  console.log("  ╚══════════════════════════════════════════════════════════════╝");
  console.log();

  const platformLpBps = 10000n - r.creatorLpBps;
  console.log("  --- ONGOING REVENUE (after DEX listing) ---");
  console.log();
  console.log(`  1. DEX Transaction Tax:`);
  console.log(`     Buy tax = ${Number(DEX_BUY_TAX) / 100}% | Sell tax = ${Number(DEX_SELL_TAX) / 100}%`);
  console.log(`     Platform share of tax: ${fmtPct(r.platformTaxShareBps, 10000n)}%`);
  console.log(`     Creator share of tax:  ${fmtPct(r.creatorTaxBps, 10000n)}%`);
  console.log(`     Example: $100K daily volume → Platform gets ~$${(100000 * 0.015 * Number(r.platformTaxShareBps) / 10000).toFixed(0)}/day`);
  console.log(`     Example: $1M daily volume   → Platform gets ~$${(1000000 * 0.015 * Number(r.platformTaxShareBps) / 10000).toFixed(0)}/day`);
  console.log();
  console.log(`  2. LP Token Holdings:`);
  console.log(`     Platform holds: ${fmtPct(platformLpBps, 10000n)}% of LP tokens`);
  console.log(`     LP = ${fmtBnb(r.lpBnb)} BNB + ${fmtTok(r.lpTokens)} tokens`);
  console.log(`     PancakeSwap fee (0.25% of volume):`);
  console.log(`     Example: $100K daily volume → ~$${(100000 * 0.0025 * Number(platformLpBps) / 10000).toFixed(0)}/day LP fees`);
  console.log(`     Example: $1M daily volume   → ~$${(1000000 * 0.0025 * Number(platformLpBps) / 10000).toFixed(0)}/day LP fees`);
  console.log();
  console.log(`  3. Burn Engine (benefits FAIR holders):`);
  console.log(`     ${fmtBnb(r.burnEngineBnb)} BNB ($${fmtUsd(r.burnEngineBnb)}) used to buy & burn FAIR`);
  console.log();
  console.log(`  4. Long Pool / Short Pool:`);
  console.log(`     Long Pool: ${fmtBnb(r.longPoolBnb)} BNB ($${fmtUsd(r.longPoolBnb)})`);
  console.log(`     Short Pool: ${fmtTok(r.shortPoolTokens)} tokens`);
  console.log(`     These support the lending system and generate fees`);
  console.log();
}

console.log("=".repeat(75));
console.log("  COMPARISON TABLE: Platform Revenue by Creator Incentive Choice");
console.log("=".repeat(75));
console.log();
console.log("  Creator Choice  | Immediate BNB | Immediate USD | Tax Share(Platform) | LP Share(Platform)");
console.log("  ----------------|---------------|---------------|--------------------|-------------------");

for (const count of [1, 2, 3]) {
  const r = simulate(count);
  const labels = ["", "1 opt (50%ea)", "2 opt (22.5%ea)", "3 opt (14%ea)"];
  console.log(`  ${labels[count].padEnd(15)} | ${fmtBnb(r.totalImmediate).padStart(11)}  | $${fmtUsd(r.totalImmediate).padStart(11)} | ${fmtPct(r.platformTaxShareBps, 10000n).padStart(5)}%             | ${fmtPct(10000n - r.creatorLpBps, 10000n).padStart(5)}%`);
}

console.log();
console.log("  Note: Immediate revenue is the same regardless of creator choice.");
console.log("  Creator choice only affects ONGOING revenue (tax share + LP share).");
console.log();
console.log("  Key insight: More creator incentives = less ongoing platform revenue,");
console.log  ("  but may attract more creators → more token launches → more total revenue.");
