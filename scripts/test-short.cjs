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

const PERPETUAL_POOL = "0xB80d0029fc09Ae790Fc89eF629C48A1bD3c89812";
const PRICE_ORACLE = "0x9aFb859f7A2Ce4afe7a670762cEEe2C11e1bc9d9";
const DOGE_TOKEN = "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c";

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
  "function tokenAvailable(address) external view returns (uint256)",
  "function tokenLongOpenInterest(address) external view returns (uint256)",
  "function tokenShortOpenInterest(address) external view returns (uint256)",
  "function totalInsuranceFund() external view returns (uint256)",
  "function paused() external view returns (bool)",
  "function protocolFeeBps() external view returns (uint256)",
  "function baseFundingRate() external view returns (uint256)",
  "function MAINTENANCE_MARGIN_RATIO() external view returns (uint256)",
  "function MAX_LEVERAGE() external view returns (uint256)",
];

const PRICE_ORACLE_ABI = [
  "function getPrice(address token) external view returns (uint256)",
  "function twapPrices(address) external view returns (uint256)",
  "function lastUpdateTime(address) external view returns (uint256)",
  "function effectivePrice(address) external view returns (uint256)",
  "function owner() external view returns (address)",
  "function authorizedUpdaters(address) external view returns (bool)",
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

async function main() {
  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("错误: .env 中未找到 PRIVATE_KEY 或 DEPLOYER_PRIVATE_KEY");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 120000 });
  const wallet = new ethers.Wallet(pk, provider);

  const perp = new ethers.Contract(PERPETUAL_POOL, PERPETUAL_POOL_ABI, wallet);
  const oracle = new ethers.Contract(PRICE_ORACLE, PRICE_ORACLE_ABI, wallet);

  const gasOverrides = {
    maxFeePerGas: ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    gasLimit: 500_000,
  };

  console.log("============================================");
  console.log("  PerpetualPool SHORT 仓位测试");
  console.log("  Arc Testnet (Chain ID: 5042002)");
  console.log("============================================");
  console.log("钱包地址:", wallet.address);
  console.log();

  // ============================================================
  // 1. 读取钱包 ARC 余额
  // ============================================================
  console.log("=== 1. 钱包 ARC 余额 ===");
  try {
    const walletBalance = await callWithRetry(() => provider.getBalance(wallet.address), "钱包余额");
    console.log("  钱包余额:", ethers.utils.formatEther(walletBalance), "ARC");
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
  }

  // ============================================================
  // 2. 读取 PerpetualPool 合约 ARC 余额
  // ============================================================
  console.log("\n=== 2. PerpetualPool 合约 ARC 余额 ===");
  try {
    const poolBalance = await callWithRetry(() => provider.getBalance(PERPETUAL_POOL), "Pool余额");
    console.log("  Pool 余额:", ethers.utils.formatEther(poolBalance), "ARC");
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
  }

  // ============================================================
  // 3. 读取池子状态信息
  // ============================================================
  console.log("\n=== 3. 池子状态信息 ===");
  try {
    const paused = await callWithRetry(() => perp.paused(), "paused()");
    console.log("  暂停状态:", paused);

    const isListed = await callWithRetry(() => perp.isTokenListedForPerp(DOGE_TOKEN), "isTokenListedForPerp(DOGE)");
    console.log("  DOGE 已上架:", isListed);

    const owner = await callWithRetry(() => perp.owner(), "owner()");
    console.log("  合约 Owner:", owner);

    const burnEngine = await callWithRetry(() => perp.burnEngine(), "burnEngine()");
    console.log("  BurnEngine:", burnEngine);

    const protocolFeeBps = await callWithRetry(() => perp.protocolFeeBps(), "protocolFeeBps()");
    console.log("  协议费率 (bps):", protocolFeeBps.toString());

    const maxLeverage = await callWithRetry(() => perp.MAX_LEVERAGE(), "MAX_LEVERAGE()");
    console.log("  最大杠杆:", ethers.utils.formatEther(maxLeverage), "x");
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
  }

  // ============================================================
  // 4. 检查 DOGE 价格
  // ============================================================
  console.log("\n=== 4. DOGE 价格检查 ===");
  try {
    const markPrice = await callWithRetry(() => perp.getMarkPrice(DOGE_TOKEN), "getMarkPrice(DOGE)");
    console.log("  DOGE 标记价格:", ethers.utils.formatEther(markPrice), "USDC");

    const oraclePrice = await callWithRetry(() => oracle.getPrice(DOGE_TOKEN), "oracle.getPrice(DOGE)");
    console.log("  Oracle 价格:", ethers.utils.formatEther(oraclePrice), "USDC");

    const twapPrice = await callWithRetry(() => oracle.twapPrices(DOGE_TOKEN), "twapPrices(DOGE)");
    console.log("  TWAP 价格:", ethers.utils.formatEther(twapPrice), "USDC");

    const lastUpdate = await callWithRetry(() => oracle.lastUpdateTime(DOGE_TOKEN), "lastUpdateTime(DOGE)");
    const now = Math.floor(Date.now() / 1000);
    const age = now - lastUpdate.toNumber();
    console.log("  最后更新时间:", lastUpdate.toString(), `(${age} 秒前)`);

    try {
      const effectivePrice = await callWithRetry(() => oracle.effectivePrice(DOGE_TOKEN), "effectivePrice(DOGE)");
      console.log("  有效价格:", ethers.utils.formatEther(effectivePrice), "USDC");
    } catch (e) {
      console.log("  有效价格: [读取失败]", e.message?.substring(0, 200));
    }
  } catch (e) {
    console.log("  [失败] 价格读取失败:", e.message?.substring(0, 500));
  }

  // ============================================================
  // 5. 检查 tokenAvailable, tokenInsuranceFund, OI
  // ============================================================
  console.log("\n=== 5. DOGE 池子资金状态 ===");
  try {
    const tokenAvailable = await callWithRetry(() => perp.tokenAvailable(DOGE_TOKEN), "tokenAvailable(DOGE)");
    console.log("  tokenAvailable[DOGE]:", ethers.utils.formatEther(tokenAvailable), "ARC");

    const tokenInsurance = await callWithRetry(() => perp.tokenInsuranceFund(DOGE_TOKEN), "tokenInsuranceFund(DOGE)");
    console.log("  tokenInsuranceFund[DOGE]:", ethers.utils.formatEther(tokenInsurance), "ARC");

    const totalInsurance = await callWithRetry(() => perp.totalInsuranceFund(), "totalInsuranceFund()");
    console.log("  totalInsuranceFund:", ethers.utils.formatEther(totalInsurance), "ARC");

    const longOI = await callWithRetry(() => perp.tokenLongOpenInterest(DOGE_TOKEN), "tokenLongOpenInterest(DOGE)");
    console.log("  tokenLongOpenInterest[DOGE]:", ethers.utils.formatEther(longOI), "ARC");

    const shortOI = await callWithRetry(() => perp.tokenShortOpenInterest(DOGE_TOKEN), "tokenShortOpenInterest(DOGE)");
    console.log("  tokenShortOpenInterest[DOGE]:", ethers.utils.formatEther(shortOI), "ARC");

    const oi = await callWithRetry(() => perp.getOpenInterest(DOGE_TOKEN), "getOpenInterest(DOGE)");
    console.log("  getOpenInterest longOI:", ethers.utils.formatEther(oi.longOI), "ARC");
    console.log("  getOpenInterest shortOI:", ethers.utils.formatEther(oi.shortOI), "ARC");
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 500));
  }

  // ============================================================
  // 6. 检查并关闭现有仓位
  // ============================================================
  console.log("\n=== 6. 检查并关闭现有仓位 ===");
  try {
    const pos = await callWithRetry(() => perp.getPosition(wallet.address, DOGE_TOKEN), "getPosition()");
    console.log("  margin:", ethers.utils.formatEther(pos.margin), "ARC");
    console.log("  size:", ethers.utils.formatEther(pos.size), "ARC");
    console.log("  entryPrice:", ethers.utils.formatEther(pos.entryPrice));
    console.log("  isLong:", pos.isLong);
    console.log("  isActive:", pos.isActive);
    if (pos.isActive) {
      console.log("  已有活跃仓位，正在关闭...");
      try {
        const closeTx = await perp.closePosition(DOGE_TOKEN, gasOverrides);
        console.log("  关闭交易 Hash:", closeTx.hash);
        console.log("  等待确认...");
        const closeReceipt = await closeTx.wait(1, 180000);
        if (closeReceipt.status === 1) {
          console.log("  [成功] 仓位已关闭! Gas:", closeReceipt.gasUsed.toString());
        } else {
          console.log("  [失败] 关闭交易 revert! Status:", closeReceipt.status);
        }
      } catch (closeErr) {
        console.log("  [失败] 关闭仓位失败:", closeErr.message?.substring(0, 500));
      }
    } else {
      console.log("  没有活跃仓位，可以直接开仓");
    }
  } catch (e) {
    console.log("  [失败] 读取仓位失败:", e.message?.substring(0, 300));
  }

  // ============================================================
  // 7. 尝试开 SHORT 仓位 (static call 先试)
  // ============================================================
  console.log("\n=== 7. 尝试开 SHORT 仓位 ===");
  const marginUsdc = ethers.utils.parseEther("0.01");
  const leverage = ethers.utils.parseEther("2"); // 2x

  console.log("  参数: token=DOGE, isLong=false, margin=0.01 ARC, leverage=2x");
  console.log("  预期仓位大小:", ethers.utils.formatEther(marginUsdc.mul(2)), "ARC");

  // 7a. 先做 static call 获取 revert 原因
  console.log("\n  --- 7a. Static Call 测试 ---");
  try {
    const staticResult = await perp.callStatic.openPosition(DOGE_TOKEN, false, marginUsdc, leverage, {
      ...gasOverrides,
      value: marginUsdc,
    });
    console.log("  Static call 成功! 返回值:", staticResult);
  } catch (e) {
    console.log("  Static call 失败!");
    console.log("  错误代码:", e.code);
    console.log("  错误原因:", e.reason || "N/A");
    console.log("  完整错误信息:");

    // 尝试解析 revert 原因
    let revertReason = "未知";
    if (e.reason) {
      revertReason = e.reason;
    } else if (e.data) {
      try {
        const iface = new ethers.utils.Interface(["error Error(string)"]);
        const decoded = iface.parseError(e.data);
        revertReason = decoded ? decoded.args[0] : "无法解码: " + e.data;
      } catch {
        revertReason = "原始数据: " + (typeof e.data === "string" ? e.data.substring(0, 200) : JSON.stringify(e.data).substring(0, 200));
      }
    }

    // 尝试从 error message 中提取 revert reason
    const msgMatch = e.message?.match(/reason="([^"]+)"/);
    if (msgMatch) {
      revertReason = msgMatch[1];
    }

    console.log("  Revert 原因:", revertReason);
    console.log("  完整错误 (前1000字符):", e.message?.substring(0, 1000));
  }

  // 7b. 实际发送交易
  console.log("\n  --- 7b. 实际发送交易 ---");
  try {
    const tx = await perp.openPosition(DOGE_TOKEN, false, marginUsdc, leverage, {
      ...gasOverrides,
      value: marginUsdc,
    });
    console.log("  交易已发送! Hash:", tx.hash);

    console.log("  等待确认...");
    const receipt = await tx.wait(1, 180000); // 1 confirmation, 3 min timeout
    if (receipt.status === 1) {
      console.log("  [成功] SHORT 仓位已开! Gas:", receipt.gasUsed.toString());
    } else {
      console.log("  [失败] 交易 revert! Status:", receipt.status);
    }
  } catch (e) {
    console.log("  [失败] 交易发送/确认失败!");
    console.log("  错误代码:", e.code);

    let revertReason = "未知";
    const msgMatch = e.message?.match(/reason="([^"]+)"/);
    if (msgMatch) {
      revertReason = msgMatch[1];
    } else if (e.reason) {
      revertReason = e.reason;
    }
    console.log("  Revert 原因:", revertReason);
    console.log("  完整错误 (前1500字符):", e.message?.substring(0, 1500));
  }

  // ============================================================
  // 8. 尝试开 LONG 仓位 (对比测试)
  // ============================================================
  console.log("\n=== 8. 尝试开 LONG 仓位 (对比测试) ===");
  console.log("  参数: token=DOGE, isLong=true, margin=0.01 ARC, leverage=2x");

  // 8a. Static call
  console.log("\n  --- 8a. Static Call 测试 ---");
  try {
    const staticResult = await perp.callStatic.openPosition(DOGE_TOKEN, true, marginUsdc, leverage, {
      ...gasOverrides,
      value: marginUsdc,
    });
    console.log("  Static call 成功! 返回值:", staticResult);
  } catch (e) {
    console.log("  Static call 失败!");
    let revertReason = "未知";
    const msgMatch = e.message?.match(/reason="([^"]+)"/);
    if (msgMatch) {
      revertReason = msgMatch[1];
    } else if (e.reason) {
      revertReason = e.reason;
    }
    console.log("  Revert 原因:", revertReason);
    console.log("  完整错误 (前1000字符):", e.message?.substring(0, 1000));
  }

  // 8b. 实际发送交易
  console.log("\n  --- 8b. 实际发送交易 ---");
  try {
    const tx = await perp.openPosition(DOGE_TOKEN, true, marginUsdc, leverage, {
      ...gasOverrides,
      value: marginUsdc,
    });
    console.log("  交易已发送! Hash:", tx.hash);

    console.log("  等待确认...");
    const receipt = await tx.wait(1, 180000);
    if (receipt.status === 1) {
      console.log("  [成功] LONG 仓位已开! Gas:", receipt.gasUsed.toString());
    } else {
      console.log("  [失败] 交易 revert! Status:", receipt.status);
    }
  } catch (e) {
    console.log("  [失败] 交易发送/确认失败!");
    let revertReason = "未知";
    const msgMatch = e.message?.match(/reason="([^"]+)"/);
    if (msgMatch) {
      revertReason = msgMatch[1];
    } else if (e.reason) {
      revertReason = e.reason;
    }
    console.log("  Revert 原因:", revertReason);
    console.log("  完整错误 (前1500字符):", e.message?.substring(0, 1500));
  }

  // ============================================================
  // 9. 再次检查池子状态
  // ============================================================
  console.log("\n=== 9. 操作后池子状态 ===");
  try {
    const poolBalance = await callWithRetry(() => provider.getBalance(PERPETUAL_POOL), "Pool余额");
    console.log("  Pool 余额:", ethers.utils.formatEther(poolBalance), "ARC");

    const tokenAvailable = await callWithRetry(() => perp.tokenAvailable(DOGE_TOKEN), "tokenAvailable(DOGE)");
    console.log("  tokenAvailable[DOGE]:", ethers.utils.formatEther(tokenAvailable), "ARC");

    const tokenInsurance = await callWithRetry(() => perp.tokenInsuranceFund(DOGE_TOKEN), "tokenInsuranceFund(DOGE)");
    console.log("  tokenInsuranceFund[DOGE]:", ethers.utils.formatEther(tokenInsurance), "ARC");

    const longOI = await callWithRetry(() => perp.tokenLongOpenInterest(DOGE_TOKEN), "tokenLongOpenInterest(DOGE)");
    console.log("  tokenLongOpenInterest[DOGE]:", ethers.utils.formatEther(longOI), "ARC");

    const shortOI = await callWithRetry(() => perp.tokenShortOpenInterest(DOGE_TOKEN), "tokenShortOpenInterest(DOGE)");
    console.log("  tokenShortOpenInterest[DOGE]:", ethers.utils.formatEther(shortOI), "ARC");

    // 检查当前仓位
    const pos = await callWithRetry(() => perp.getPosition(wallet.address, DOGE_TOKEN), "getPosition()");
    console.log("  当前仓位 isActive:", pos.isActive);
    if (pos.isActive) {
      console.log("  当前仓位方向:", pos.isLong ? "LONG" : "SHORT");
      console.log("  当前仓位 margin:", ethers.utils.formatEther(pos.margin), "ARC");
      console.log("  当前仓位 size:", ethers.utils.formatEther(pos.size), "ARC");
    }
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
  }

  // ============================================================
  // 10. 最终钱包余额
  // ============================================================
  console.log("\n=== 10. 最终钱包余额 ===");
  try {
    const finalBalance = await callWithRetry(() => provider.getBalance(wallet.address), "最终余额");
    console.log("  钱包余额:", ethers.utils.formatEther(finalBalance), "ARC");
  } catch (e) {
    console.log("  [失败]", e.message?.substring(0, 300));
  }

  console.log("\n============================================");
  console.log("  测试完成");
  console.log("============================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n致命错误:", error.message || error);
    process.exit(1);
  });
