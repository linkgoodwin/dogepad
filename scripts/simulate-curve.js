const PP = 10n ** 18n;
const BASE_PRICE = 100n * 10n ** 9n;
const SLOPE = 10000n;
const FEE_BPS = 100n;
const DEX_THRESHOLD = 30n * PP;
const ONE_BNB = PP;
const BNB_USD = 1000;

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

function fmtTok(wei) {
  const full = Number(wei * 10000n / PP) / 10000;
  if (full >= 1000000) return (full / 1000000).toFixed(2) + "M";
  if (full >= 1000) return (full / 1000).toFixed(2) + "K";
  return full.toFixed(2);
}

function fmtBnb(wei) {
  return Number(wei * 1000000n / PP) / 1000000;
}

function fmtUsd(wei) {
  return (fmtBnb(wei) * BNB_USD).toFixed(2);
}

function pricePerTokenBnb(s) {
  return Number(getPrice(s)) / Number(PP);
}

function pricePerTokenUsd(s) {
  return pricePerTokenBnb(s) * BNB_USD;
}

function marketCapUsd(s) {
  return pricePerTokenUsd(s) * 1e9;
}

console.log("=".repeat(70));
console.log("  FairForge Bonding Curve Profit Simulation");
console.log("  (Linear Model: Price = BASE + SLOPE * s / PP)");
console.log("=".repeat(70));
console.log(`  BASE_PRICE  = 100 gwei = ${fmtBnb(BASE_PRICE)} BNB = $${fmtUsd(BASE_PRICE)}/token`);
console.log(`  SLOPE       = ${SLOPE}`);
console.log(`  FEE         = 1% buy + 1% sell`);
console.log(`  DEX_THRESHOLD = 30 BNB`);
console.log(`  BNB Price   = $${BNB_USD}`);
console.log(`  Total Supply= 1,000,000,000 tokens`);
console.log();

let tokensSold = 0n;
let reserveBnb = 0n;

console.log("--- Step 1: Buy 1 BNB at launch (s=0) ---");
const buyBnb = ONE_BNB;
const fee1 = (buyBnb * FEE_BPS) / 10000n;
const bnbAfterFee1 = buyBnb - fee1;

const myTokens = calculateBuyAmount(tokensSold, bnbAfterFee1);
tokensSold += myTokens;
reserveBnb += bnbAfterFee1;

console.log(`  Paid:           1.000000 BNB ($1,000.00)`);
console.log(`  Fee (1%):       ${fmtBnb(fee1)} BNB`);
console.log(`  Into curve:     ${fmtBnb(bnbAfterFee1)} BNB`);
console.log(`  Got:            ${fmtTok(myTokens)} tokens`);
console.log(`  Reserve now:    ${fmtBnb(reserveBnb)} BNB`);
console.log(`  Price after:    $${pricePerTokenUsd(tokensSold).toFixed(6)}/token`);
console.log(`  My avg cost:    $${(1000 / Number(myTokens * 10000n / PP) * 10000).toFixed(6)}/token`);
console.log();

console.log("--- Step 2: More buys until reserve = 30 BNB ---");
let buyCount = 0;
let totalOtherBnb = 0n;
const buyStep = ONE_BNB;

while (reserveBnb < DEX_THRESHOLD && buyCount < 500) {
  const stepFee = (buyStep * FEE_BPS) / 10000n;
  const stepAfterFee = buyStep - stepFee;
  const stepTokens = calculateBuyAmount(tokensSold, stepAfterFee);
  if (stepTokens === 0n) break;
  tokensSold += stepTokens;
  reserveBnb += stepAfterFee;
  totalOtherBnb += buyStep;
  buyCount++;
}

console.log(`  Additional:     ${buyCount} x 1 BNB = ${fmtBnb(totalOtherBnb)} BNB`);
console.log(`  Total tokensSold: ${fmtTok(tokensSold)} tokens`);
console.log(`  Final reserve:  ${fmtBnb(reserveBnb)} BNB`);
console.log(`  Price at DEX:   $${pricePerTokenUsd(tokensSold).toFixed(6)}/token`);
console.log(`  Market Cap:     $${marketCapUsd(tokensSold).toFixed(0)}`);
console.log();

console.log("--- Step 3: Sell my tokens at DEX listing ---");
const sellBnbRaw = calculateSellAmount(tokensSold, myTokens);
const sellFee = (sellBnbRaw * FEE_BPS) / 10000n;
const sellBnbNet = sellBnbRaw - sellFee;

const canSell = sellBnbRaw <= reserveBnb;
console.log(`  My tokens:          ${fmtTok(myTokens)}`);
console.log(`  My share of supply: ${(Number(myTokens) / Number(tokensSold) * 100).toFixed(2)}%`);
console.log(`  Sell value (raw):   ${fmtBnb(sellBnbRaw)} BNB ($${fmtUsd(sellBnbRaw)})`);
console.log(`  Sell fee (1%):      ${fmtBnb(sellFee)} BNB`);
console.log(`  Sell value (net):   ${fmtBnb(sellBnbNet)} BNB ($${fmtUsd(sellBnbNet)})`);
console.log(`  Reserve:            ${fmtBnb(reserveBnb)} BNB`);
console.log(`  Can sell?           ${canSell ? "YES" : "NO - EXCEEDS RESERVE!"}`);

const profitBnb = sellBnbNet - buyBnb;
const isProfit = profitBnb > 0n;
console.log();
console.log(`  ${"=".repeat(50)}`);
console.log(`  ${isProfit ? "PROFIT" : "LOSS"}: ${fmtBnb(profitBnb > 0n ? profitBnb : -profitBnb)} BNB (${isProfit ? "+" : "-"}$${fmtUsd(profitBnb > 0n ? profitBnb : -profitBnb)})`);
console.log(`  ROI: ${((fmtBnb(sellBnbNet) / 1 - 1) * 100).toFixed(1)}%`);
console.log(`  ${"=".repeat(50)}`);

console.log();
console.log("--- Price Journey ---");
const priceCheckpoints = [];
let tmpS = 0n;
let tmpR = 0n;
const step = ONE_BNB / 10n;
const reserveTargets = [1n * PP, 5n * PP, 10n * PP, 15n * PP, 20n * PP, 25n * PP, 30n * PP];
let cpIdx = 0;

priceCheckpoints.push({ label: "Launch (s=0)", s: 0n });
priceCheckpoints.push({ label: "After my 1 BNB buy", s: myTokens });

while (cpIdx < reserveTargets.length) {
  const stepFee2 = (step * FEE_BPS) / 10000n;
  const stepAfterFee2 = step - stepFee2;
  const stepTokens2 = calculateBuyAmount(tmpS, stepAfterFee2);
  if (stepTokens2 === 0n) break;
  tmpS += stepTokens2;
  tmpR += stepAfterFee2;
  if (tmpR >= reserveTargets[cpIdx]) {
    priceCheckpoints.push({ label: `${fmtBnb(reserveTargets[cpIdx])} BNB reserve`, s: tmpS });
    cpIdx++;
  }
}

for (const cp of priceCheckpoints) {
  const p = pricePerTokenUsd(cp.s);
  const mc = marketCapUsd(cp.s);
  console.log(`  ${cp.label.padEnd(25)} Price: $${p.toFixed(6)}/token   MC: $${mc.toFixed(0)}`);
}

console.log();
console.log("--- After I Sell (price drops) ---");
const afterSellS = tokensSold - myTokens;
const priceAfterSell = pricePerTokenUsd(afterSellS);
const priceAtDex = pricePerTokenUsd(tokensSold);
console.log(`  TokensSold drops:   ${fmtTok(tokensSold)} -> ${fmtTok(afterSellS)}`);
console.log(`  Price drops:        $${priceAtDex.toFixed(6)} -> $${priceAfterSell.toFixed(6)}/token`);
console.log(`  Price drop:         ${((1 - priceAfterSell / priceAtDex) * 100).toFixed(1)}%`);

console.log();
console.log("=".repeat(70));
console.log("  SUMMARY");
console.log("=".repeat(70));
console.log(`  Invested:     1 BNB ($1,000)`);
console.log(`  Got:          ${fmtTok(myTokens)} tokens`);
console.log(`  Sold for:     ${fmtBnb(sellBnbNet)} BNB ($${fmtUsd(sellBnbNet)})`);
console.log(`  ${isProfit ? "Profit" : "Loss"}:       ${fmtBnb(profitBnb > 0n ? profitBnb : -profitBnb)} BNB (${isProfit ? "+" : "-"}$${fmtUsd(profitBnb > 0n ? profitBnb : -profitBnb)})`);
console.log(`  ROI:          ${((fmtBnb(sellBnbNet) / 1 - 1) * 100).toFixed(1)}%`);
console.log();
console.log(`  Price went:   $${pricePerTokenUsd(0n).toFixed(6)} -> $${priceAtDex.toFixed(6)} per token`);
console.log(`  After sell:   $${priceAfterSell.toFixed(6)} per token`);
console.log(`  Multiplier:   ${(priceAtDex / pricePerTokenUsd(0n)).toFixed(1)}x from launch to DEX`);
