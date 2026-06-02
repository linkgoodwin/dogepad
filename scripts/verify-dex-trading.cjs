const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ── Load .env ──────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

// ── Config ─────────────────────────────────────────────────
const ARC_RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

const ADDRESSES = {
  BondingCurve:  "0x569944C02A15aAdB5F9D1999e202463e9860F473",
  SimpleRouter:  "0x6C59fc8e5a4e0CFF1cfD050f1f73B7eA4a49992B",
  SimpleFactory: "0xf1b805AF51f8eC789D05aA7c981234C9d854357C",
  WUSDC:         "0x911b4000D3422F482F4062a913885f7b035382Df",
  DOGE:          "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c",
  DOGE_WUSDC_Pair: "0xD485fb189dFeA2F445856A552994d2c8051778ea",
  PriceOracle:   "0x9aFb859f7A2Ce4afe7a670762cEEe2C11e1bc9d9",
  PerpetualPool: "0xB80d0029fc09Ae790Fc89eF629C48A1bD3c89812",
};

// ── ABIs ───────────────────────────────────────────────────
const BONDING_CURVE_ABI = [
  "function dexRouter() view returns (address)",
  "function baseAsset() view returns (address)",
  "function isXyloRouter() view returns (bool)",
  "function owner() view returns (address)",
  "function dexLister() view returns (address)",
  "function perpetualPool() view returns (address)",
  "function priceOracle() view returns (address)",
];

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint256, uint256, uint256)",
  "function totalSupply() view returns (uint256)",
];

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function dexPair() view returns (address)",
  "function buyTax() view returns (uint256)",
  "function sellTax() view returns (uint256)",
  "function taxEnabled() view returns (bool)",
  "function taxReceiver() view returns (address)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const WUSDC_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function wusdc() view returns (address)",
  "function getAmountsOut(uint256, address[]) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
];

// ── Helpers ────────────────────────────────────────────────
function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function check(label, actual, expected) {
  const match = actual.toLowerCase() === expected.toLowerCase();
  console.log(`  ${label}: ${actual}`);
  console.log(`    Expected: ${expected}  ✅ ${match ? "MATCH" : "❌ MISMATCH"}`);
  return match;
}

async function withRetry(fn, label, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < retries - 1) {
        console.log(`  ⚠️ ${label} failed (attempt ${i + 1}/${retries}), retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw e;
      }
    }
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("❌ DEPLOYER_PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(pk, provider);
  console.log(`\n🔑 Wallet: ${wallet.address}`);

  const blockNumber = await provider.getBlockNumber();
  console.log(`📦 Block: ${blockNumber}`);

  // ═══════════════════════════════════════════════════════════
  // (a) BondingCurve: dexRouter, baseAsset, isXyloRouter
  // ═══════════════════════════════════════════════════════════
  section("(a) BondingCurve 配置验证");

  const bc = new ethers.Contract(ADDRESSES.BondingCurve, BONDING_CURVE_ABI, provider);

  const bcDexRouter = await withRetry(() => bc.dexRouter(), "bc.dexRouter()");
  check("dexRouter", bcDexRouter, ADDRESSES.SimpleRouter);

  const bcBaseAsset = await withRetry(() => bc.baseAsset(), "bc.baseAsset()");
  check("baseAsset", bcBaseAsset, ADDRESSES.WUSDC);

  const bcIsXyloRouter = await withRetry(() => bc.isXyloRouter(), "bc.isXyloRouter()");
  console.log(`  isXyloRouter: ${bcIsXyloRouter}  (expected: true)`);
  if (!bcIsXyloRouter) console.log("    ⚠️ isXyloRouter is false — should be true for SimpleRouter");

  const bcOwner = await withRetry(() => bc.owner(), "bc.owner()");
  console.log(`  owner: ${bcOwner}`);

  // ═══════════════════════════════════════════════════════════
  // (b) DOGE-WUSDC Pair: reserves, token0
  // ═══════════════════════════════════════════════════════════
  section("(b) DOGE-WUSDC Pair 流动性验证");

  const pair = new ethers.Contract(ADDRESSES.DOGE_WUSDC_Pair, PAIR_ABI, provider);

  const pairCode = await provider.getCode(ADDRESSES.DOGE_WUSDC_Pair);
  console.log(`  Pair 合约代码: ${pairCode.length > 2 ? "存在 ✅" : "❌ 不存在"}`);

  if (pairCode.length > 2) {
    const token0 = await withRetry(() => pair.token0(), "pair.token0()");
    const token1 = await withRetry(() => pair.token1(), "pair.token1()");
    console.log(`  token0: ${token0}`);
    console.log(`  token1: ${token1}`);

    const [reserve0, reserve1, blockTimestampLast] = await withRetry(() => pair.getReserves(), "pair.getReserves()");
    console.log(`  reserve0: ${ethers.utils.formatEther(reserve0)}`);
    console.log(`  reserve1: ${ethers.utils.formatEther(reserve1)}`);
    console.log(`  blockTimestampLast: ${blockTimestampLast}`);

    const lpSupply = await withRetry(() => pair.totalSupply(), "pair.totalSupply()");
    console.log(`  LP totalSupply: ${ethers.utils.formatEther(lpSupply)}`);

    const hasLiquidity = reserve0.gt(0) && reserve1.gt(0);
    console.log(`  有流动性: ${hasLiquidity ? "✅ 是" : "❌ 否"}`);

    // Identify which reserve is WUSDC and which is DOGE
    const wusdcIsToken0 = token0.toLowerCase() === ADDRESSES.WUSDC.toLowerCase();
    const wusdcReserve = wusdcIsToken0 ? reserve0 : reserve1;
    const dogeReserve = wusdcIsToken0 ? reserve1 : reserve0;
    console.log(`  WUSDC reserve: ${ethers.utils.formatEther(wusdcReserve)}`);
    console.log(`  DOGE reserve:  ${ethers.utils.formatEther(dogeReserve)}`);
  } else {
    console.log("  ❌ Pair 合约不存在，无法继续检查");
  }

  // ═══════════════════════════════════════════════════════════
  // (c) DOGE Token: dexPair
  // ═══════════════════════════════════════════════════════════
  section("(c) DOGE Token dexPair 验证");

  const doge = new ethers.Contract(ADDRESSES.DOGE, TOKEN_ABI, provider);

  const dogeDexPair = await withRetry(() => doge.dexPair(), "doge.dexPair()");
  check("dexPair", dogeDexPair, ADDRESSES.DOGE_WUSDC_Pair);

  // ═══════════════════════════════════════════════════════════
  // (d) DOGE Token: buyTax, sellTax, taxEnabled
  // ═══════════════════════════════════════════════════════════
  section("(d) DOGE Token 税率设置");

  const buyTax = await withRetry(() => doge.buyTax(), "doge.buyTax()");
  const sellTax = await withRetry(() => doge.sellTax(), "doge.sellTax()");
  const taxEnabled = await withRetry(() => doge.taxEnabled(), "doge.taxEnabled()");
  const taxReceiver = await withRetry(() => doge.taxReceiver(), "doge.taxReceiver()");

  console.log(`  buyTax:    ${buyTax} bps (${Number(buyTax) / 100}%)`);
  console.log(`  sellTax:   ${sellTax} bps (${Number(sellTax) / 100}%)`);
  console.log(`  taxEnabled: ${taxEnabled}`);
  console.log(`  taxReceiver: ${taxReceiver}`);

  // ═══════════════════════════════════════════════════════════
  // (e) SimpleRouter.getAmountsOut(1 WUSDC → DOGE)
  // ═══════════════════════════════════════════════════════════
  section("(e) 买入报价: 1 WUSDC → DOGE");

  const router = new ethers.Contract(ADDRESSES.SimpleRouter, ROUTER_ABI, provider);

  try {
    const amountsOut = await withRetry(
      () => router.getAmountsOut(ethers.utils.parseEther("1"), [ADDRESSES.WUSDC, ADDRESSES.DOGE]),
      "getAmountsOut(WUSDC→DOGE)"
    );
    console.log(`  输入: ${ethers.utils.formatEther(amountsOut[0])} WUSDC`);
    console.log(`  输出: ${ethers.utils.formatEther(amountsOut[1])} DOGE`);
    console.log(`  ✅ 买入报价成功`);
  } catch (e) {
    console.log(`  ❌ 买入报价失败: ${e.message?.substring(0, 300)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // (f) SimpleRouter.getAmountsOut(1 DOGE → WUSDC)
  // ═══════════════════════════════════════════════════════════
  section("(f) 卖出报价: 1 DOGE → WUSDC");

  try {
    const amountsOut = await withRetry(
      () => router.getAmountsOut(ethers.utils.parseEther("1"), [ADDRESSES.DOGE, ADDRESSES.WUSDC]),
      "getAmountsOut(DOGE→WUSDC)"
    );
    console.log(`  输入: ${ethers.utils.formatEther(amountsOut[0])} DOGE`);
    console.log(`  输出: ${ethers.utils.formatEther(amountsOut[1])} WUSDC`);
    console.log(`  ✅ 卖出报价成功`);
  } catch (e) {
    console.log(`  ❌ 卖出报价失败: ${e.message?.substring(0, 300)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // (g) Wallet balances
  // ═══════════════════════════════════════════════════════════
  section("(g) 钱包余额");

  const wusdc = new ethers.Contract(ADDRESSES.WUSDC, WUSDC_ABI, provider);

  const walletWusdcBal = await withRetry(() => wusdc.balanceOf(wallet.address), "wusdc.balanceOf");
  const walletDogeBal = await withRetry(() => doge.balanceOf(wallet.address), "doge.balanceOf");

  console.log(`  WUSDC 余额: ${ethers.utils.formatEther(walletWusdcBal)}`);
  console.log(`  DOGE  余额: ${ethers.utils.formatEther(walletDogeBal)}`);

  // ═══════════════════════════════════════════════════════════
  // (h) WUSDC allowance to Router
  // ═══════════════════════════════════════════════════════════
  section("(h) WUSDC 授权额度 (wallet → Router)");

  const wusdcAllowance = await withRetry(() => wusdc.allowance(wallet.address, ADDRESSES.SimpleRouter), "wusdc.allowance");
  console.log(`  WUSDC allowance: ${ethers.utils.formatEther(wusdcAllowance)}`);

  // ═══════════════════════════════════════════════════════════
  // (i) DOGE allowance to Router
  // ═══════════════════════════════════════════════════════════
  section("(i) DOGE 授权额度 (wallet → Router)");

  const dogeAllowance = await withRetry(() => doge.allowance(wallet.address, ADDRESSES.SimpleRouter), "doge.allowance");
  console.log(`  DOGE allowance: ${ethers.utils.formatEther(dogeAllowance)}`);

  // ═══════════════════════════════════════════════════════════
  // (j) Swap: 0.01 WUSDC → DOGE
  // ═══════════════════════════════════════════════════════════
  section("(j) 实际交换: 0.01 WUSDC → DOGE");

  const SWAP_AMOUNT_WUSDC = ethers.utils.parseEther("0.01");
  const overrides = {
    maxFeePerGas: 100_000_000_000,
    maxPriorityFeePerGas: 1_000_000_000,
    gasLimit: 500_000,
  };

  if (walletWusdcBal.gte(SWAP_AMOUNT_WUSDC)) {
    // Approve if needed
    if (wusdcAllowance.lt(SWAP_AMOUNT_WUSDC)) {
      console.log("  授权 WUSDC → Router...");
      try {
        const approveTx = await wusdc.connect(wallet).approve(ADDRESSES.SimpleRouter, ethers.constants.MaxUint256, overrides);
        console.log(`  Approve tx: ${approveTx.hash}`);
        await approveTx.wait();
        console.log("  ✅ 授权成功");
      } catch (e) {
        console.log(`  ❌ 授权失败: ${e.message?.substring(0, 300)}`);
      }
    } else {
      console.log("  已有足够授权，无需重新授权");
    }

    // Get quote
    try {
      const amountsOut = await router.getAmountsOut(SWAP_AMOUNT_WUSDC, [ADDRESSES.WUSDC, ADDRESSES.DOGE]);
      const minOut = amountsOut[1].mul(95).div(100); // 5% slippage
      console.log(`  预期输出: ${ethers.utils.formatEther(amountsOut[1])} DOGE`);
      console.log(`  最低输出 (5%滑点): ${ethers.utils.formatEther(minOut)} DOGE`);

      const deadline = Math.floor(Date.now() / 1000) + 300;

      // Static call first
      console.log("  执行 static call 测试...");
      try {
        const staticResult = await provider.call({
          to: ADDRESSES.SimpleRouter,
          data: router.interface.encodeFunctionData("swapExactTokensForTokens", [
            SWAP_AMOUNT_WUSDC, minOut, [ADDRESSES.WUSDC, ADDRESSES.DOGE], wallet.address, deadline
          ]),
          from: wallet.address,
          gasLimit: 500_000,
        });
        console.log(`  ✅ Static call 成功! Result: ${staticResult.substring(0, 66)}...`);
      } catch (e) {
        console.log(`  ❌ Static call 失败!`);
        const revertData = e.data || e.error?.data;
        if (revertData) {
          try {
            const iface = new ethers.utils.Interface(["error Error(string)", "error Panic(uint256)"]);
            const decoded = iface.parseError(revertData);
            console.log(`    Decoded revert: ${decoded?.name} ${decoded?.args?.toString()}`);
          } catch {
            console.log(`    Raw revert data: ${revertData.substring(0, 200)}`);
          }
        }
        console.log(`    Error: ${e.message?.substring(0, 500)}`);
      }

      // Actual swap
      console.log("  执行实际交换...");
      try {
        const swapTx = await router.connect(wallet).swapExactTokensForTokens(
          SWAP_AMOUNT_WUSDC,
          minOut,
          [ADDRESSES.WUSDC, ADDRESSES.DOGE],
          wallet.address,
          deadline,
          overrides
        );
        console.log(`  Swap tx: ${swapTx.hash}`);
        const receipt = await swapTx.wait();
        console.log(`  ✅ 交换成功! Gas used: ${receipt.gasUsed.toString()}`);
      } catch (e) {
        console.log(`  ❌ 交换失败: ${e.message?.substring(0, 500)}`);
        // Try to decode revert reason
        const revertData = e.data || e.error?.data;
        if (revertData) {
          try {
            const iface = new ethers.utils.Interface(["error Error(string)", "error Panic(uint256)"]);
            const decoded = iface.parseError(revertData);
            console.log(`    Decoded revert: ${decoded?.name} ${decoded?.args?.toString()}`);
          } catch {
            console.log(`    Raw revert data: ${revertData.substring(0, 200)}`);
          }
        }
      }
    } catch (e) {
      console.log(`  ❌ 获取报价失败: ${e.message?.substring(0, 300)}`);
    }
  } else {
    console.log(`  ⚠️ WUSDC 余额不足 (${ethers.utils.formatEther(walletWusdcBal)} < 0.01)，跳过交换`);
  }

  // ═══════════════════════════════════════════════════════════
  // (k) Swap: small DOGE → WUSDC
  // ═══════════════════════════════════════════════════════════
  section("(k) 实际交换: DOGE → WUSDC");

  // Re-read DOGE balance (may have changed after buy swap)
  const walletDogeBalAfterBuy = await withRetry(() => doge.balanceOf(wallet.address), "doge.balanceOf(after buy)");
  console.log(`  当前 DOGE 余额: ${ethers.utils.formatEther(walletDogeBalAfterBuy)}`);

  // Use 1 DOGE or less depending on balance
  const SWAP_AMOUNT_DOGE = walletDogeBalAfterBuy.gte(ethers.utils.parseEther("1"))
    ? ethers.utils.parseEther("1")
    : walletDogeBalAfterBuy.gt(0)
      ? walletDogeBalAfterBuy.div(10)  // 10% of balance
      : ethers.BigNumber.from(0);

  if (SWAP_AMOUNT_DOGE.gt(0)) {
    // Re-read allowance
    const dogeAllowanceNow = await withRetry(() => doge.allowance(wallet.address, ADDRESSES.SimpleRouter), "doge.allowance(after buy)");

    if (dogeAllowanceNow.lt(SWAP_AMOUNT_DOGE)) {
      console.log("  授权 DOGE → Router...");
      try {
        const approveTx = await doge.connect(wallet).approve(ADDRESSES.SimpleRouter, ethers.constants.MaxUint256, overrides);
        console.log(`  Approve tx: ${approveTx.hash}`);
        await approveTx.wait();
        console.log("  ✅ 授权成功");
      } catch (e) {
        console.log(`  ❌ 授权失败: ${e.message?.substring(0, 300)}`);
      }
    } else {
      console.log("  已有足够授权，无需重新授权");
    }

    try {
      const amountsOut = await router.getAmountsOut(SWAP_AMOUNT_DOGE, [ADDRESSES.DOGE, ADDRESSES.WUSDC]);
      const minOut = amountsOut[1].mul(95).div(100); // 5% slippage
      console.log(`  交换数量: ${ethers.utils.formatEther(SWAP_AMOUNT_DOGE)} DOGE`);
      console.log(`  预期输出: ${ethers.utils.formatEther(amountsOut[1])} WUSDC`);
      console.log(`  最低输出 (5%滑点): ${ethers.utils.formatEther(minOut)} WUSDC`);

      const deadline = Math.floor(Date.now() / 1000) + 300;

      // Static call first
      console.log("  执行 static call 测试...");
      try {
        const staticResult = await provider.call({
          to: ADDRESSES.SimpleRouter,
          data: router.interface.encodeFunctionData("swapExactTokensForTokens", [
            SWAP_AMOUNT_DOGE, minOut, [ADDRESSES.DOGE, ADDRESSES.WUSDC], wallet.address, deadline
          ]),
          from: wallet.address,
          gasLimit: 500_000,
        });
        console.log(`  ✅ Static call 成功! Result: ${staticResult.substring(0, 66)}...`);
      } catch (e) {
        console.log(`  ❌ Static call 失败!`);
        const revertData = e.data || e.error?.data;
        if (revertData) {
          try {
            const iface = new ethers.utils.Interface(["error Error(string)", "error Panic(uint256)"]);
            const decoded = iface.parseError(revertData);
            console.log(`    Decoded revert: ${decoded?.name} ${decoded?.args?.toString()}`);
          } catch {
            console.log(`    Raw revert data: ${revertData.substring(0, 200)}`);
          }
        }
        console.log(`    Error: ${e.message?.substring(0, 500)}`);
      }

      // Actual swap
      console.log("  执行实际交换...");
      try {
        const swapTx = await router.connect(wallet).swapExactTokensForTokens(
          SWAP_AMOUNT_DOGE,
          minOut,
          [ADDRESSES.DOGE, ADDRESSES.WUSDC],
          wallet.address,
          deadline,
          overrides
        );
        console.log(`  Swap tx: ${swapTx.hash}`);
        const receipt = await swapTx.wait();
        console.log(`  ✅ 交换成功! Gas used: ${receipt.gasUsed.toString()}`);
      } catch (e) {
        console.log(`  ❌ 交换失败: ${e.message?.substring(0, 500)}`);
        const revertData = e.data || e.error?.data;
        if (revertData) {
          try {
            const iface = new ethers.utils.Interface(["error Error(string)", "error Panic(uint256)"]);
            const decoded = iface.parseError(revertData);
            console.log(`    Decoded revert: ${decoded?.name} ${decoded?.args?.toString()}`);
          } catch {
            console.log(`    Raw revert data: ${revertData.substring(0, 200)}`);
          }
        }
      }
    } catch (e) {
      console.log(`  ❌ 获取报价失败: ${e.message?.substring(0, 300)}`);
    }
  } else {
    console.log(`  ⚠️ DOGE 余额为 0，跳过卖出交换`);
  }

  // ═══════════════════════════════════════════════════════════
  // (l) Final balances
  // ═══════════════════════════════════════════════════════════
  section("(l) 交换后余额验证");

  const finalWusdcBal = await withRetry(() => wusdc.balanceOf(wallet.address), "wusdc.balanceOf(final)");
  const finalDogeBal = await withRetry(() => doge.balanceOf(wallet.address), "doge.balanceOf(final)");

  console.log(`  WUSDC 余额: ${ethers.utils.formatEther(finalWusdcBal)}  (之前: ${ethers.utils.formatEther(walletWusdcBal)})`);
  console.log(`  DOGE  余额: ${ethers.utils.formatEther(finalDogeBal)}  (之前: ${ethers.utils.formatEther(walletDogeBal)})`);

  const wusdcDiff = finalWusdcBal.sub(walletWusdcBal);
  const dogeDiff = finalDogeBal.sub(walletDogeBal);
  console.log(`  WUSDC 变化: ${ethers.utils.formatEther(wusdcDiff)}`);
  console.log(`  DOGE  变化: ${ethers.utils.formatEther(dogeDiff)}`);

  // ── Summary ──────────────────────────────────────────────
  section("总结");
  console.log(`  BondingCurve dexRouter == SimpleRouter: ${bcDexRouter.toLowerCase() === ADDRESSES.SimpleRouter.toLowerCase() ? "✅" : "❌"}`);
  console.log(`  BondingCurve baseAsset == WUSDC:        ${bcBaseAsset.toLowerCase() === ADDRESSES.WUSDC.toLowerCase() ? "✅" : "❌"}`);
  console.log(`  BondingCurve isXyloRouter:              ${bcIsXyloRouter ? "✅ true" : "❌ false"}`);
  console.log(`  DOGE dexPair == Pair:                   ${dogeDexPair.toLowerCase() === ADDRESSES.DOGE_WUSDC_Pair.toLowerCase() ? "✅" : "❌"}`);
  console.log(`  DOGE buyTax: ${buyTax} bps  sellTax: ${sellTax} bps  taxEnabled: ${taxEnabled}`);

  console.log(`\n✅ 验证完成`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ FATAL ERROR:");
    console.error(error.message || error);
    process.exit(1);
  });
