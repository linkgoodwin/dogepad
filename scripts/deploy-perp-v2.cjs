const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

const BONDING_CURVE = "0x569944C02A15aAdB5F9D1999e202463e9860F473";
const DEX_LISTER = "0x020bF89469a2bc4C3f91d02AB71E42a481462ebA";
const PRICE_ORACLE = "0x9aFb859f7A2Ce4afe7a670762cEEe2C11e1bc9d9";
const BURN_ENGINE = "0x5E1328AD73287405257f92b38810E7F55F6b7969";
const FEE_DISTRIBUTOR = "0x5E1328AD73287405257f92b38810E7F55F6b7969";
const DOGE_TOKEN = "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c";

const GAS_PRICE = ethers.BigNumber.from("20000000000"); // 20 gwei
const TX_GAS_LIMIT = ethers.BigNumber.from("300000"); // for config txs
const DEPLOY_GAS_LIMIT = ethers.BigNumber.from("6000000"); // for deploy

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTx(signer, txData, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  [${label}] Attempt ${attempt}/${maxRetries}...`);
      const txResponse = await signer.sendTransaction(txData);
      console.log(`  [${label}] TX sent: ${txResponse.hash}`);
      const receipt = await txResponse.wait(1);
      if (receipt.status === 1) {
        console.log(`  [${label}] Confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed.toString()}`);
        return receipt;
      } else {
        throw new Error(`${label} reverted`);
      }
    } catch (e) {
      console.log(`  [${label}] Error: ${e.message}`);
      if (attempt === maxRetries) throw e;
      const delay = 5000 * attempt;
      console.log(`  [${label}] Retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: "arcTestnet",
  });

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.utils.formatEther(balance)} ARC`);

  if (balance.eq(0)) {
    console.error("Insufficient balance for deployment!");
    process.exit(1);
  }

  // Load compiled artifact
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "pool",
    "PerpetualPool",
    "PerpetualPool.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  // ========== Step 1: Deploy PerpetualPool ==========
  console.log("\n========== Step 1: Deploy PerpetualPool ==========");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  const perpPool = await factory.deploy(PRICE_ORACLE, BURN_ENGINE, FEE_DISTRIBUTOR, {
    gasLimit: DEPLOY_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  });

  console.log(`  Deployment TX: ${perpPool.deployTransaction.hash}`);
  console.log(`  Waiting for confirmation...`);
  await perpPool.deployed();
  const newPoolAddress = perpPool.address;
  console.log(`  PerpetualPool deployed at: ${newPoolAddress}`);

  const perpPoolContract = new ethers.Contract(newPoolAddress, abi, wallet);

  // ========== Step 2: Configure PerpetualPool ==========
  console.log("\n========== Step 2: Configure PerpetualPool ==========");

  // 2a. setBondingCurve
  console.log("  2a. setBondingCurve...");
  await sendTx(wallet, {
    to: newPoolAddress,
    data: perpPoolContract.interface.encodeFunctionData("setBondingCurve", [BONDING_CURVE]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "setBondingCurve");

  // 2b. setDexLister
  console.log("  2b. setDexLister...");
  await sendTx(wallet, {
    to: newPoolAddress,
    data: perpPoolContract.interface.encodeFunctionData("setDexLister", [DEX_LISTER]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "setDexLister");

  // 2c. listTokenForPerp(DOGE)
  console.log("  2c. listTokenForPerp(DOGE)...");
  await sendTx(wallet, {
    to: newPoolAddress,
    data: perpPoolContract.interface.encodeFunctionData("listTokenForPerp", [DOGE_TOKEN]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "listTokenForPerp");

  // 2d. setDefaultToken(DOGE)
  console.log("  2d. setDefaultToken(DOGE)...");
  await sendTx(wallet, {
    to: newPoolAddress,
    data: perpPoolContract.interface.encodeFunctionData("setDefaultToken", [DOGE_TOKEN]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "setDefaultToken");

  // ========== Step 3: Update BondingCurve ==========
  console.log("\n========== Step 3: Update BondingCurve ==========");

  const bondingCurveAbi = ["function setPerpetualPool(address)", "function perpetualPool() view returns (address)"];
  const bondingCurve = new ethers.Contract(BONDING_CURVE, bondingCurveAbi, wallet);

  console.log("  3a. bondingCurve.setPerpetualPool(newPool)...");
  await sendTx(wallet, {
    to: BONDING_CURVE,
    data: bondingCurve.interface.encodeFunctionData("setPerpetualPool", [newPoolAddress]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "bondingCurve.setPerpetualPool");

  // ========== Step 4: Update DexLister ==========
  console.log("\n========== Step 4: Update DexLister ==========");

  const dexListerAbi = ["function setPerpetualPool(address)", "function perpetualPool() view returns (address)"];
  const dexLister = new ethers.Contract(DEX_LISTER, dexListerAbi, wallet);

  console.log("  4a. dexLister.setPerpetualPool(newPool)...");
  await sendTx(wallet, {
    to: DEX_LISTER,
    data: dexLister.interface.encodeFunctionData("setPerpetualPool", [newPoolAddress]),
    gasLimit: TX_GAS_LIMIT,
    gasPrice: GAS_PRICE,
  }, "dexLister.setPerpetualPool");

  // ========== Step 5: Verify ==========
  console.log("\n========== Step 5: Verify Configuration ==========");

  const oracleAddr = await perpPoolContract.oracle();
  console.log(`  oracle: ${oracleAddr} (expected: ${PRICE_ORACLE}) ${oracleAddr.toLowerCase() === PRICE_ORACLE.toLowerCase() ? "OK" : "MISMATCH"}`);

  const burnEngineAddr = await perpPoolContract.burnEngine();
  console.log(`  burnEngine: ${burnEngineAddr} (expected: ${BURN_ENGINE}) ${burnEngineAddr.toLowerCase() === BURN_ENGINE.toLowerCase() ? "OK" : "MISMATCH"}`);

  const treasuryAddr = await perpPoolContract.platformTreasury();
  console.log(`  platformTreasury: ${treasuryAddr} (expected: ${FEE_DISTRIBUTOR}) ${treasuryAddr.toLowerCase() === FEE_DISTRIBUTOR.toLowerCase() ? "OK" : "MISMATCH"}`);

  const bcAddr = await perpPoolContract.bondingCurve();
  console.log(`  bondingCurve: ${bcAddr} (expected: ${BONDING_CURVE}) ${bcAddr.toLowerCase() === BONDING_CURVE.toLowerCase() ? "OK" : "MISMATCH"}`);

  const dlAddr = await perpPoolContract.dexLister();
  console.log(`  dexLister: ${dlAddr} (expected: ${DEX_LISTER}) ${dlAddr.toLowerCase() === DEX_LISTER.toLowerCase() ? "OK" : "MISMATCH"}`);

  const isListed = await perpPoolContract.isTokenListedForPerp(DOGE_TOKEN);
  console.log(`  DOGE listed for perp: ${isListed} ${isListed ? "OK" : "MISMATCH"}`);

  const defaultToken = await perpPoolContract.defaultToken();
  console.log(`  defaultToken: ${defaultToken} (expected: ${DOGE_TOKEN}) ${defaultToken.toLowerCase() === DOGE_TOKEN.toLowerCase() ? "OK" : "MISMATCH"}`);

  // Verify BondingCurve points to new pool
  const bcPerpPool = await bondingCurve.perpetualPool();
  console.log(`  BondingCurve.perpetualPool: ${bcPerpPool} (expected: ${newPoolAddress}) ${bcPerpPool.toLowerCase() === newPoolAddress.toLowerCase() ? "OK" : "MISMATCH"}`);

  // Verify DexLister points to new pool
  const dlPerpPool = await dexLister.perpetualPool();
  console.log(`  DexLister.perpetualPool: ${dlPerpPool} (expected: ${newPoolAddress}) ${dlPerpPool.toLowerCase() === newPoolAddress.toLowerCase() ? "OK" : "MISMATCH"}`);

  console.log("\n========================================");
  console.log(`  NEW PerpetualPool Address: ${newPoolAddress}`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
