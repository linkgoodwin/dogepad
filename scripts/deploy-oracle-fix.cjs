const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

// Existing contract addresses on Arc testnet
const BONDING_CURVE = "0x569944C02A15aAdB5F9D1999e202463e9860F473";
const DEX_LISTER = "0x020bF89469a2bc4C3f91d02AB71E42a481462ebA";
const PERPETUAL_POOL = "0xB80d0029fc09Ae790Fc89eF629C48A1bD3c89812";
const SIMPLE_FACTORY = "0xf1b805AF51f8eC789D05aA7c981234C9d854357C";
const SIMPLE_ROUTER = "0x6C59fc8e5a4e0CFF1cfD050f1f73B7eA4a49992B";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const DOGE_TOKEN = "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c";
const DOGE_WUSDC_PAIR = "0xD485fb189dFeA2F445856A552994d2c8051778ea";
const FEE_DISTRIBUTOR = "0x5E1328AD73287405257f92b38810E7F55F6b7969";

// Already deployed PriceOracle (with full ABI from new compilation)
const NEW_ORACLE = "0x9aFb859f7A2Ce4afe7a670762cEEe2C11e1bc9d9";

// Full ABIs for methods we need to call
const PRICE_ORACLE_ABI = [
  "function setDexConfig(address _dexFactory, address _baseAsset) external",
  "function setTokenDexPair(address token, address pair) external",
  "function setAuthorizedUpdater(address updater, bool authorized) external",
  "function setChainlinkFeed(address token, address feed) external",
  "function updateTwapPrice(address token, uint256 newPrice) external",
  "function updatePriceFromDex(address token) external returns (uint256)",
  "function updateEffectivePrice(address token) external",
  "function getPrice(address token) external view returns (uint256)",
  "function owner() external view returns (address)",
  "function dexFactory() external view returns (address)",
  "function baseAsset() external view returns (address)",
  "function tokenDexPairs(address) external view returns (address)",
  "function authorizedUpdaters(address) external view returns (bool)",
  "function twapPrices(address) external view returns (uint256)",
  "function lastUpdateTime(address) external view returns (uint256)",
];

const BONDING_CURVE_ABI = [
  "function setPriceOracle(address _oracle) external",
  "function setPerpetualPool(address _perpetualPool) external",
  "function owner() external view returns (address)",
  "function priceOracle() external view returns (address)",
  "function perpetualPool() external view returns (address)",
];

const DEX_LISTER_ABI = [
  "function setPerpetualPool(address _perpetualPool) external",
  "function owner() external view returns (address)",
  "function perpetualPool() external view returns (address)",
];

const PERPETUAL_POOL_ABI = [
  "function setOracle(address _oracle) external",
  "function setBondingCurve(address _bondingCurve) external",
  "function setDexLister(address _dexLister) external",
  "function setPlatformTreasury(address _treasury) external",
  "function listTokenForPerp(address token) external",
  "function delistTokenForPerp(address token) external",
  "function owner() external view returns (address)",
  "function oracle() external view returns (address)",
  "function isTokenListedForPerp(address) external view returns (bool)",
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Poll for receipt
async function pollForReceipt(provider, txHash, maxWaitSeconds) {
  const start = Date.now();
  const interval = 5000;
  while ((Date.now() - start) < maxWaitSeconds * 1000) {
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
    console.error("ERROR: PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 600000 });
  const wallet = new ethers.Wallet(pk, provider);
  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  // --- Helper: send a transaction and wait for confirmation ---
  async function sendTx(contract, method, args, label, gasLimit = 500_000) {
    console.log(`  Sending ${label}...`);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const nonce = await provider.getTransactionCount(wallet.address, "pending");
        console.log(`  Using nonce: ${nonce}`);

        const tx = await contract[method](...args, {
          gasPrice,
          gasLimit,
          nonce
        });
        console.log(`  Tx: ${tx.hash}`);

        const receipt = await pollForReceipt(provider, tx.hash, 600);
        if (receipt && receipt.status === 1) {
          console.log(`  -> ${label} done (block: ${receipt.blockNumber})`);
          return;
        } else if (receipt && receipt.status === 0) {
          throw new Error(`Transaction reverted: ${tx.hash}`);
        } else {
          throw new Error(`Transaction not found after timeout: ${tx.hash}`);
        }
      } catch (e) {
        const msg = e.message || "";
        if (msg.includes("nonce too low")) {
          console.log(`  Retry ${attempt + 1}: nonce too low, waiting 10s...`);
          await sleep(10000);
          continue;
        }
        if (msg.includes("replacement fee too low") || msg.includes("already known")) {
          console.log(`  Retry ${attempt + 1}: fee/known issue, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Failed to send ${label} after 5 attempts`);
  }

  const newOracleAddress = NEW_ORACLE;
  const oracle = new ethers.Contract(newOracleAddress, PRICE_ORACLE_ABI, wallet);

  // Verify the oracle contract is accessible
  console.log("\n=== Verify PriceOracle contract ===");
  const owner = await oracle.owner();
  console.log(`  Owner: ${owner}`);
  const dexFactory = await oracle.dexFactory();
  console.log(`  dexFactory: ${dexFactory}`);
  const baseAsset = await oracle.baseAsset();
  console.log(`  baseAsset: ${baseAsset}`);

  // ============================================================
  // Step 1: Configure PriceOracle
  // ============================================================
  console.log("\n=== Step 1: Configure PriceOracle ===");

  await sendTx(oracle, "setDexConfig", [SIMPLE_FACTORY, WUSDC], "setDexConfig(SimpleFactory, WUSDC)");
  await sleep(3000);

  await sendTx(oracle, "setTokenDexPair", [DOGE_TOKEN, DOGE_WUSDC_PAIR], "setTokenDexPair(DOGE, DOGE-WUSDC Pair)");
  await sleep(3000);

  await sendTx(oracle, "setAuthorizedUpdater", [BONDING_CURVE, true], "setAuthorizedUpdater(BondingCurve, true)");
  await sleep(3000);

  await sendTx(oracle, "setAuthorizedUpdater", [DEX_LISTER, true], "setAuthorizedUpdater(DexLister, true)");
  await sleep(3000);

  // ============================================================
  // Step 2: Update BondingCurve to point to new PriceOracle
  // ============================================================
  console.log("\n=== Step 2: Update BondingCurve ===");
  const bondingCurve = new ethers.Contract(BONDING_CURVE, BONDING_CURVE_ABI, wallet);
  await sendTx(bondingCurve, "setPriceOracle", [newOracleAddress], "BondingCurve.setPriceOracle(newOracle)");
  await sleep(3000);

  // ============================================================
  // Step 3: Update PerpetualPool to point to new PriceOracle
  // ============================================================
  console.log("\n=== Step 3: Update PerpetualPool ===");
  const perpetualPool = new ethers.Contract(PERPETUAL_POOL, PERPETUAL_POOL_ABI, wallet);
  await sendTx(perpetualPool, "setOracle", [newOracleAddress], "PerpetualPool.setOracle(newOracle)");
  await sleep(3000);

  // ============================================================
  // Step 4: Update BondingCurve's perpetualPool
  // ============================================================
  console.log("\n=== Step 4: Update BondingCurve.setPerpetualPool ===");
  await sendTx(bondingCurve, "setPerpetualPool", [PERPETUAL_POOL], "BondingCurve.setPerpetualPool");
  await sleep(3000);

  // ============================================================
  // Step 5: Update DexLister's perpetualPool
  // ============================================================
  console.log("\n=== Step 5: Update DexLister.setPerpetualPool ===");
  const dexLister = new ethers.Contract(DEX_LISTER, DEX_LISTER_ABI, wallet);
  await sendTx(dexLister, "setPerpetualPool", [PERPETUAL_POOL], "DexLister.setPerpetualPool");
  await sleep(3000);

  // ============================================================
  // Step 6: List DOGE token for perp trading
  // ============================================================
  console.log("\n=== Step 6: List DOGE token for perp trading ===");
  await sendTx(perpetualPool, "listTokenForPerp", [DOGE_TOKEN], "PerpetualPool.listTokenForPerp(DOGE)");
  await sleep(3000);

  // ============================================================
  // Step 7: Update price from DEX (initial price)
  // ============================================================
  console.log("\n=== Step 7: Update price from DEX ===");
  await sendTx(oracle, "updatePriceFromDex", [DOGE_TOKEN], "PriceOracle.updatePriceFromDex(DOGE)");

  // ============================================================
  // Step 8: Verify - call getPrice(DOGE)
  // ============================================================
  console.log("\n=== Step 8: Verify getPrice(DOGE) ===");
  try {
    const dogePrice = await oracle.getPrice(DOGE_TOKEN);
    console.log(`  DOGE price from new oracle: ${ethers.utils.formatEther(dogePrice)} USDC (raw: ${dogePrice.toString()})`);
  } catch (e) {
    console.log(`  Warning: getPrice(DOGE) failed: ${e.message?.substring(0, 200)}`);
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n========================================");
  console.log("  CONFIGURATION COMPLETE");
  console.log("========================================");
  console.log(`  PriceOracle:   ${newOracleAddress}`);
  console.log(`  BondingCurve:  ${BONDING_CURVE}`);
  console.log(`  DexLister:     ${DEX_LISTER}`);
  console.log(`  PerpetualPool: ${PERPETUAL_POOL}`);
  console.log("========================================\n");

  // Write new oracle address to .env
  const envPath = ".env";
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const regex = new RegExp(`^VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS=.*$`, "m");
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS=${newOracleAddress}`);
  } else {
    envContent += `\nVITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS=${newOracleAddress}`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("Updated .env with VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS=" + newOracleAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nCONFIGURATION FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
