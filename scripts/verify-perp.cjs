const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load .env
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

// Contract addresses
const PERPETUAL_POOL = "0xB80d0029fc09Ae790Fc89eF629C48A1bD3c89812";
const PRICE_ORACLE = "0x9aFb859f7A2Ce4afe7a670762cEEe2C11e1bc9d9";
const DOGE_TOKEN = "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c";
const SIMPLE_FACTORY = "0xf1b805AF51f8eC789D05aA7c981234C9d854357C";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

// ABIs
const PRICE_ORACLE_ABI = [
  "function getPrice(address token) external view returns (uint256)",
  "function twapPrices(address) external view returns (uint256)",
  "function lastUpdateTime(address) external view returns (uint256)",
  "function dexFactory() external view returns (address)",
  "function baseAsset() external view returns (address)",
  "function tokenDexPairs(address) external view returns (address)",
  "function authorizedUpdaters(address) external view returns (bool)",
  "function effectivePrice(address) external view returns (uint256)",
  "function effectivePriceTime(address) external view returns (uint256)",
  "function chainlinkFeeds(address) external view returns (address)",
  "function owner() external view returns (address)",
  "function updateTwapPrice(address token, uint256 newPrice) external",
  "function updatePriceFromDex(address token) external returns (uint256)",
  "function setAuthorizedUpdater(address updater, bool authorized) external",
];

const PERPETUAL_POOL_ABI = [
  "function oracle() external view returns (address)",
  "function isTokenListedForPerp(address) external view returns (bool)",
  "function getListedTokens() external view returns (address[])",
  "function getMarkPrice(address token) external view returns (uint256)",
  "function openPosition(address token, bool isLong, uint256 marginUsdc, uint256 leverage) external payable",
  "function closePosition(address token) external",
  "function getPosition(address user, address token) external view returns (uint256 margin, uint256 size, uint256 entryPrice, uint256 lastFundingTime, bool isLong, bool isActive)",
  "function getMarginRatio(address user, address token) external view returns (uint256)",
  "function getPnl(address user, address token) external view returns (int256)",
  "function getOpenInterest(address token) external view returns (uint256 longOI, uint256 shortOI)",
  "function owner() external view returns (address)",
  "function burnEngine() external view returns (address)",
  "function tokenInsuranceFund(address) external view returns (uint256)",
  "function totalInsuranceFund() external view returns (uint256)",
  "function paused() external view returns (bool)",
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callWithRetry(fn, label, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("network") || msg.includes("could not coalesce")) {
        console.log(`  [重试 ${i + 1}/${maxRetries}] ${label} 网络超时，等待 5s 后重试...`);
        await sleep(5000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label} 在 ${maxRetries} 次重试后仍失败`);
}

async function pollForReceipt(provider, txHash, maxWaitSeconds = 120) {
  const start = Date.now();
  const interval = 3000;
  while (Date.now() - start < maxWaitSeconds * 1000) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch (e) {
      // ignore
    }
    await sleep(interval);
  }
  return null;
}

async function main() {
  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("错误: .env 中未找到 PRIVATE_KEY 或 DEPLOYER_PRIVATE_KEY");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 120000 });
  const wallet = new ethers.Wallet(pk, provider);

  const oracle = new ethers.Contract(PRICE_ORACLE, PRICE_ORACLE_ABI, wallet);
  const perp = new ethers.Contract(PERPETUAL_POOL, PERPETUAL_POOL_ABI, wallet);

  const gasOverrides = {
    maxFeePerGas: ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    gasLimit: 500_000,
  };

  console.log("============================================");
  console.log("  PerpetualPool & PriceOracle 验证脚本");
  console.log("  Arc Testnet (Chain ID: 5042002)");
  console.log("============================================");
  console.log("钱包地址:", wallet.address);
  const balance = await callWithRetry(() => provider.getBalance(wallet.address), "获取余额");
  console.log("钱包余额:", ethers.utils.formatEther(balance), "USDC");
  console.log();

  let allPassed = true;

  // ============================================================
  // a. PriceOracle.getPrice(DOGE)
  // ============================================================
  console.log("=== a. PriceOracle.getPrice(DOGE) ===");
  try {
    const price = await callWithRetry(() => oracle.getPrice(DOGE_TOKEN), "getPrice(DOGE)");
    console.log("  DOGE 价格:", ethers.utils.formatEther(price), "USDC");
    if (price.gt(0)) {
      console.log("  [通过] 价格有效 (> 0)");
    } else {
      console.log("  [失败] 价格为 0");
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败] getPrice(DOGE) revert:", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // b. PriceOracle.twapPrices(DOGE) & lastUpdateTime(DOGE)
  // ============================================================
  console.log("\n=== b. PriceOracle.twapPrices(DOGE) & lastUpdateTime(DOGE) ===");
  try {
    const twapPrice = await callWithRetry(() => oracle.twapPrices(DOGE_TOKEN), "twapPrices(DOGE)");
    const lastUpdate = await callWithRetry(() => oracle.lastUpdateTime(DOGE_TOKEN), "lastUpdateTime(DOGE)");
    console.log("  TWAP 价格:", ethers.utils.formatEther(twapPrice), "USDC");
    console.log("  最后更新时间:", lastUpdate.toString(), `(${new Date(lastUpdate.toNumber() * 1000).toISOString()})`);

    const now = Math.floor(Date.now() / 1000);
    const age = now - lastUpdate.toNumber();
    console.log("  价格年龄:", age, "秒");
    if (twapPrice.gt(0) && age < 3600) {
      console.log("  [通过] TWAP 价格有效且在1小时内更新");
    } else if (twapPrice.gt(0)) {
      console.log("  [警告] TWAP 价格有效但超过1小时未更新，可能触发 MAX_PRICE_AGE 限制");
    } else {
      console.log("  [警告] TWAP 价格为 0，依赖 DEX fallback");
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // c. PriceOracle.dexFactory() & baseAsset()
  // ============================================================
  console.log("\n=== c. PriceOracle DEX 配置 ===");
  try {
    const dexFactory = await callWithRetry(() => oracle.dexFactory(), "dexFactory()");
    const baseAsset = await callWithRetry(() => oracle.baseAsset(), "baseAsset()");
    console.log("  dexFactory:", dexFactory);
    console.log("  baseAsset:", baseAsset);

    const dexOk = dexFactory.toLowerCase() === SIMPLE_FACTORY.toLowerCase();
    const baseOk = baseAsset.toLowerCase() === WUSDC.toLowerCase();
    if (dexOk && baseOk) {
      console.log("  [通过] DEX 配置正确 (SimpleFactory + WUSDC)");
    } else {
      console.log("  [失败] DEX 配置不匹配!");
      if (!dexOk) console.log("    dexFactory 期望:", SIMPLE_FACTORY, "实际:", dexFactory);
      if (!baseOk) console.log("    baseAsset 期望:", WUSDC, "实际:", baseAsset);
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // d. PriceOracle.tokenDexPairs(DOGE)
  // ============================================================
  console.log("\n=== d. PriceOracle.tokenDexPairs(DOGE) ===");
  try {
    const pair = await callWithRetry(() => oracle.tokenDexPairs(DOGE_TOKEN), "tokenDexPairs(DOGE)");
    console.log("  DOGE DEX Pair:", pair);
    if (pair !== ethers.constants.AddressZero) {
      console.log("  [通过] DOGE 已映射到 DEX Pair");
    } else {
      console.log("  [警告] DOGE 未手动映射 pair，将依赖 dexFactory.getPair() 查找");
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // e. PerpetualPool.oracle()
  // ============================================================
  console.log("\n=== e. PerpetualPool.oracle() ===");
  try {
    const oracleAddr = await callWithRetry(() => perp.oracle(), "oracle()");
    console.log("  Oracle 地址:", oracleAddr);
    if (oracleAddr.toLowerCase() === PRICE_ORACLE.toLowerCase()) {
      console.log("  [通过] PerpetualPool 指向新的 PriceOracle");
    } else {
      console.log("  [失败] Oracle 地址不匹配! 期望:", PRICE_ORACLE, "实际:", oracleAddr);
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // f. PerpetualPool.isTokenListedForPerp(DOGE)
  // ============================================================
  console.log("\n=== f. PerpetualPool.isTokenListedForPerp(DOGE) ===");
  try {
    const isListed = await callWithRetry(() => perp.isTokenListedForPerp(DOGE_TOKEN), "isTokenListedForPerp(DOGE)");
    console.log("  DOGE 已上架:", isListed);
    if (isListed) {
      console.log("  [通过] DOGE 已在 PerpetualPool 上架");
    } else {
      console.log("  [失败] DOGE 未上架，无法开仓!");
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // g. PerpetualPool.getListedTokens()
  // ============================================================
  console.log("\n=== g. PerpetualPool.getListedTokens() ===");
  try {
    const tokens = await callWithRetry(() => perp.getListedTokens(), "getListedTokens()");
    console.log("  已上架代币数量:", tokens.length);
    for (let i = 0; i < tokens.length; i++) {
      const label = tokens[i].toLowerCase() === DOGE_TOKEN.toLowerCase() ? " (DOGE)" : "";
      console.log(`  [${i}] ${tokens[i]}${label}`);
    }
    if (tokens.length > 0) {
      console.log("  [通过] 至少有一个代币上架");
    } else {
      console.log("  [失败] 没有代币上架");
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // h. PerpetualPool.getMarkPrice(DOGE)
  // ============================================================
  console.log("\n=== h. PerpetualPool.getMarkPrice(DOGE) ===");
  try {
    const markPrice = await callWithRetry(() => perp.getMarkPrice(DOGE_TOKEN), "getMarkPrice(DOGE)");
    console.log("  DOGE 标记价格:", ethers.utils.formatEther(markPrice), "USDC");
    if (markPrice.gt(0)) {
      console.log("  [通过] 标记价格有效");
    } else {
      console.log("  [失败] 标记价格为 0");
      allPassed = false;
    }
  } catch (e) {
    console.log("  [失败] getMarkPrice(DOGE) revert:", e.message?.substring(0, 300));
    allPassed = false;
  }

  // ============================================================
  // 额外检查: PerpetualPool 状态
  // ============================================================
  console.log("\n=== 额外检查: PerpetualPool 状态 ===");
  try {
    const paused = await callWithRetry(() => perp.paused(), "paused()");
    console.log("  暂停状态:", paused);
    if (paused) {
      console.log("  [警告] PerpetualPool 已暂停，无法开仓!");
      allPassed = false;
    }

    const poolBalance = await callWithRetry(() => provider.getBalance(PERPETUAL_POOL), "pool balance");
    console.log("  Pool 余额:", ethers.utils.formatEther(poolBalance), "USDC");

    const insurance = await callWithRetry(() => perp.tokenInsuranceFund(DOGE_TOKEN), "tokenInsuranceFund(DOGE)");
    console.log("  DOGE 保险基金:", ethers.utils.formatEther(insurance), "USDC");

    const totalInsurance = await callWithRetry(() => perp.totalInsuranceFund(), "totalInsuranceFund()");
    console.log("  总保险基金:", ethers.utils.formatEther(totalInsurance), "USDC");
  } catch (e) {
    console.log("  [警告]", e.message?.substring(0, 200));
  }

  // ============================================================
  // i. 尝试开仓: openPosition(DOGE, true, 0.01 ether, 2e18)
  // ============================================================
  console.log("\n=== i. 尝试开仓: openPosition(DOGE, LONG, 0.01 USDC, 2x) ===");
  let positionOpened = false;

  // 先检查是否有已存在的仓位
  try {
    const existingPos = await callWithRetry(() => perp.getPosition(wallet.address, DOGE_TOKEN), "getPosition(现有)");
    if (existingPos.isActive) {
      console.log("  [警告] 已有活跃仓位，先关闭...");
      try {
        const closeTx = await perp.closePosition(DOGE_TOKEN, gasOverrides);
        console.log("  关闭仓位 tx:", closeTx.hash);
        const closeReceipt = await pollForReceipt(provider, closeTx.hash);
        if (closeReceipt && closeReceipt.status === 1) {
          console.log("  已关闭现有仓位");
        } else {
          console.log("  [警告] 关闭仓位可能失败");
        }
      } catch (closeErr) {
        console.log("  [警告] 关闭现有仓位失败:", closeErr.message?.substring(0, 200));
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    const marginUsdc = ethers.utils.parseEther("0.01");
    const leverage = ethers.utils.parseEther("2"); // 2x

    console.log("  保证金:", ethers.utils.formatEther(marginUsdc), "USDC");
    console.log("  杠杆:", ethers.utils.formatEther(leverage), "x");
    console.log("  预期仓位大小:", ethers.utils.formatEther(marginUsdc.mul(2)), "USDC");

    // 确保价格可用
    let priceOk = false;
    try {
      const currentPrice = await oracle.getPrice(DOGE_TOKEN);
      if (currentPrice.gt(0)) {
        console.log("  当前价格:", ethers.utils.formatEther(currentPrice), "USDC");
        priceOk = true;
      }
    } catch (e) {
      console.log("  [警告] getPrice 返回错误:", e.message?.substring(0, 200));
    }

    // 如果价格不可用，尝试从 DEX 更新
    if (!priceOk) {
      console.log("  价格不可用，尝试 updatePriceFromDex...");
      try {
        const deployerAuth = await oracle.authorizedUpdaters(wallet.address);
        if (!deployerAuth) {
          console.log("  部署者未授权，先授权...");
          const authTx = await oracle.setAuthorizedUpdater(wallet.address, true, gasOverrides);
          console.log("  授权 tx:", authTx.hash);
          await pollForReceipt(provider, authTx.hash);
        }
        const updateTx = await oracle.updatePriceFromDex(DOGE_TOKEN, gasOverrides);
        console.log("  updatePriceFromDex tx:", updateTx.hash);
        const updateReceipt = await pollForReceipt(provider, updateTx.hash);
        if (updateReceipt && updateReceipt.status === 1) {
          console.log("  价格已从 DEX 更新");
          const newPrice = await oracle.getPrice(DOGE_TOKEN);
          console.log("  新价格:", ethers.utils.formatEther(newPrice), "USDC");
          priceOk = newPrice.gt(0);
        }
      } catch (updateErr) {
        console.log("  [警告] updatePriceFromDex 失败:", updateErr.message?.substring(0, 200));
      }
    }

    // 如果仍然没有价格，手动设置一个
    if (!priceOk) {
      console.log("  价格仍不可用，尝试手动 updateTwapPrice...");
      try {
        const deployerAuth = await oracle.authorizedUpdaters(wallet.address);
        if (!deployerAuth) {
          const authTx = await oracle.setAuthorizedUpdater(wallet.address, true, gasOverrides);
          await pollForReceipt(provider, authTx.hash);
        }
        const setPriceTx = await oracle.updateTwapPrice(DOGE_TOKEN, ethers.utils.parseEther("0.001"), gasOverrides);
        console.log("  updateTwapPrice tx:", setPriceTx.hash);
        await pollForReceipt(provider, setPriceTx.hash);
        console.log("  手动设置价格为 0.001 USDC");
        priceOk = true;
      } catch (setErr) {
        console.log("  [警告] updateTwapPrice 失败:", setErr.message?.substring(0, 200));
      }
    }

    if (!priceOk) {
      console.log("  [跳过] 无法获取有效价格，跳过开仓");
      allPassed = false;
    } else {
      console.log("  发送 openPosition 交易...");
      const openTx = await perp.openPosition(DOGE_TOKEN, true, marginUsdc, leverage, {
        ...gasOverrides,
        value: marginUsdc,
      });
      console.log("  交易哈希:", openTx.hash);

      const openReceipt = await pollForReceipt(provider, openTx.hash, 180);
      if (openReceipt && openReceipt.status === 1) {
        console.log("  [通过] 开仓成功! Gas:", openReceipt.gasUsed.toString());
        positionOpened = true;
      } else if (openReceipt && openReceipt.status === 0) {
        console.log("  [失败] 交易被 revert!");
        allPassed = false;

        // 尝试获取 revert 原因
        try {
          await provider.call(openTx, openReceipt.blockNumber);
        } catch (revertErr) {
          console.log("  Revert 原因:", revertErr.message?.substring(0, 500));
        }
      } else {
        console.log("  [失败] 交易超时未确认");
        allPassed = false;
      }
    }
  } catch (e) {
    console.log("  [失败] 开仓异常:", e.message?.substring(0, 500));
    allPassed = false;
  }

  // ============================================================
  // j. 读取仓位详情
  // ============================================================
  if (positionOpened) {
    console.log("\n=== j. 读取仓位详情 ===");
    try {
      const pos = await callWithRetry(() => perp.getPosition(wallet.address, DOGE_TOKEN), "getPosition()");
      console.log("  保证金:", ethers.utils.formatEther(pos.margin), "USDC");
      console.log("  仓位大小:", ethers.utils.formatEther(pos.size), "USDC");
      console.log("  入场价格:", ethers.utils.formatEther(pos.entryPrice), "USDC");
      console.log("  最后资金费率时间:", pos.lastFundingTime.toString());
      console.log("  方向:", pos.isLong ? "LONG" : "SHORT");
      console.log("  活跃:", pos.isActive);

      const marginRatio = await callWithRetry(() => perp.getMarginRatio(wallet.address, DOGE_TOKEN), "getMarginRatio()");
      console.log("  保证金率:", ethers.utils.formatEther(marginRatio), `(${(Number(ethers.utils.formatEther(marginRatio)) * 100).toFixed(2)}%)`);

      const pnl = await callWithRetry(() => perp.getPnl(wallet.address, DOGE_TOKEN), "getPnl()");
      console.log("  未实现盈亏:", ethers.utils.formatEther(pnl), "USDC");

      const oi = await callWithRetry(() => perp.getOpenInterest(DOGE_TOKEN), "getOpenInterest()");
      console.log("  多头 OI:", ethers.utils.formatEther(oi.longOI), "USDC");
      console.log("  空头 OI:", ethers.utils.formatEther(oi.shortOI), "USDC");

      console.log("  [通过] 仓位详情读取成功");
    } catch (e) {
      console.log("  [失败] 读取仓位详情失败:", e.message?.substring(0, 300));
      allPassed = false;
    }
  }

  // ============================================================
  // k. 关闭仓位
  // ============================================================
  if (positionOpened) {
    console.log("\n=== k. 关闭仓位 ===");
    try {
      const closeTx = await perp.closePosition(DOGE_TOKEN, gasOverrides);
      console.log("  关闭交易哈希:", closeTx.hash);

      const closeReceipt = await pollForReceipt(provider, closeTx.hash, 180);
      if (closeReceipt && closeReceipt.status === 1) {
        console.log("  [通过] 仓位已关闭! Gas:", closeReceipt.gasUsed.toString());

        // 验证仓位已清除
        const posAfter = await callWithRetry(() => perp.getPosition(wallet.address, DOGE_TOKEN), "getPosition(关闭后)");
        console.log("  仓位活跃状态:", posAfter.isActive);
        if (!posAfter.isActive) {
          console.log("  [通过] 仓位已完全清除");
        }
      } else if (closeReceipt && closeReceipt.status === 0) {
        console.log("  [失败] 关闭交易 revert!");
        allPassed = false;
      } else {
        console.log("  [失败] 关闭交易超时");
        allPassed = false;
      }
    } catch (e) {
      console.log("  [失败] 关闭仓位异常:", e.message?.substring(0, 500));
      allPassed = false;
    }
  }

  // ============================================================
  // 最终总结
  // ============================================================
  console.log("\n============================================");
  console.log("  验证总结");
  console.log("============================================");
  if (allPassed) {
    console.log("  所有检查通过! PriceOracle 和 PerpetualPool 工作正常。");
  } else {
    console.log("  部分检查未通过，请查看上方详细日志。");
  }
  console.log("============================================\n");

  // 最终余额
  const finalBalance = await callWithRetry(() => provider.getBalance(wallet.address), "最终余额");
  console.log("钱包最终余额:", ethers.utils.formatEther(finalBalance), "USDC");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n致命错误:", error.message || error);
    process.exit(1);
  });
