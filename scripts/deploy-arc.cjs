const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const XYLO_ROUTER = "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

function getArtifact(name) {
  const subdirs = ["core", "periphery", "pool", "dao"];
  for (const dir of subdirs) {
    const p = `artifacts/contracts/${dir}/${name}.sol/${name}.json`;
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(`Artifact not found for ${name}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const p = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 300000 });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);
  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  console.log("Deployer:", w.address);
  const balance = await p.getBalance(w.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  async function deploy(name, args = [], gasLimit = 3_000_000) {
    const artifact = getArtifact(name);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w);
    console.log(`Deploying ${name}... (gasLimit: ${gasLimit})`);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const currentNonce = await p.getTransactionCount(w.address, "pending");
        const contract = await factory.deploy(...args, { gasPrice, gasLimit, nonce: currentNonce });
        console.log(`  Tx: ${contract.deployTransaction.hash}`);
        console.log(`  Waiting for confirmation...`);
        await contract.deployed(300);
        console.log(`  Address: ${contract.address}`);
        return contract;
      } catch (e) {
        if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
          console.log(`  Retry ${attempt + 1}: nonce issue, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Failed to deploy ${name} after 3 attempts`);
  }

  async function sendTx(contract, method, args, label) {
    console.log(`  Sending ${label}...`);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const currentNonce = await p.getTransactionCount(w.address, "pending");
        const tx = await contract[method](...args, { gasPrice, gasLimit: 500_000, nonce: currentNonce });
        console.log(`  Tx: ${tx.hash}`);
        console.log(`  Waiting for confirmation...`);
        await tx.wait(1, 300000);
        console.log(`  -> ${label} done`);
        return;
      } catch (e) {
        if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
          console.log(`  Retry ${attempt + 1}: nonce issue, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Failed to send ${label} after 3 attempts`);
  }

  console.log("--- Phase 1: Rate Models + Oracle ---");
  const priceOracle = await deploy("PriceOracle");
  const expRateModel = await deploy("ExponentialRateModel");
  const linRateModel = await deploy("LinearRateModel");

  console.log("\n--- Phase 2: Core (BondingCurve + Factory) ---");
  const bondingCurve = await deploy("BondingCurve", [XYLO_ROUTER, w.address, true, WUSDC], 10_000_000);
  const factory = await deploy("BondingCurveFactory", [bondingCurve.address]);
  await sendTx(bondingCurve, "setFactory", [factory.address], "setFactory");

  console.log("\n--- Phase 3: BuyAndBurn ---");
  const burnEngine = await deploy("BuyAndBurnEngine", [XYLO_ROUTER, w.address, true, WUSDC], 5_000_000);

  console.log("\n--- Phase 4: FeeDistributor ---");
  const feeDist = await deploy("FeeDistributor", [ethers.constants.AddressZero, XYLO_ROUTER, burnEngine.address, WUSDC], 5_000_000);

  console.log("\n--- Phase 5: PerpetualPool ---");
  const perpetualPool = await deploy("PerpetualPool", [priceOracle.address, burnEngine.address, w.address], 5_000_000);

  await sendTx(bondingCurve, "setPerpetualPool", [perpetualPool.address], "setPerpetualPool");
  await sendTx(bondingCurve, "setBuyAndBurnEngine", [burnEngine.address], "setBuyAndBurnEngine");
  await sendTx(bondingCurve, "setPriceOracle", [priceOracle.address], "setPriceOracle");

  await sendTx(perpetualPool, "setBondingCurve", [bondingCurve.address], "PerpetualPool.setBondingCurve");
  await sendTx(perpetualPool, "setDexLister", [dexLister.address], "PerpetualPool.setDexLister");

  console.log("\n--- Phase 6: LaunchDAO ---");
  const launchDao = await deploy("LaunchDAO", [bondingCurve.address, w.address], 10_000_000);
  await sendTx(bondingCurve, "setLaunchDao", [launchDao.address], "setLaunchDao");
  await sendTx(bondingCurve, "setDaoOnlyLaunch", [true], "setDaoOnlyLaunch");

  console.log("\n--- Phase 7: CreatorRewardManager ---");
  const creatorRewardMgr = await deploy("CreatorRewardManager", [bondingCurve.address], 3_000_000);
  await sendTx(bondingCurve, "setCreatorRewardManager", [creatorRewardMgr.address], "setCreatorRewardManager");

  console.log("\n--- Phase 8: Final Wiring ---");
  await sendTx(bondingCurve, "setFeeDistributor", [feeDist.address], "setFeeDistributor");
  await sendTx(launchDao, "setFeeDistributor", [feeDist.address], "LaunchDAO.setFeeDistributor");
  await sendTx(perpetualPool, "setPlatformTreasury", [feeDist.address], "setPlatformTreasury");

  await sendTx(dexLister, "setPerpetualPool", [perpetualPool.address], "DexLister.setPerpetualPool");

  await sendTx(priceOracle, "setAuthorizedUpdater", [bondingCurve.address, true], "PriceOracle: bondingCurve");
  await sendTx(priceOracle, "setAuthorizedUpdater", [perpetualPool.address, true], "PriceOracle: perpetualPool");

  console.log("\n========================================");
  console.log("  Writing addresses to .env ...");
  console.log("========================================");

  function setEnvValue(key, value) {
    const envPath = ".env";
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, envContent);
  }

  const prefix = "VITE_ARC_TESTNET";
  setEnvValue(`${prefix}_BONDING_CURVE_ADDRESS`, bondingCurve.address);
  setEnvValue(`${prefix}_FACTORY_ADDRESS`, factory.address);
  setEnvValue(`${prefix}_PERPETUAL_POOL_ADDRESS`, perpetualPool.address);
  setEnvValue(`${prefix}_BUY_AND_BURN_ADDRESS`, burnEngine.address);
  setEnvValue(`${prefix}_LAUNCH_DAO_ADDRESS`, launchDao.address);
  setEnvValue(`${prefix}_PRICE_ORACLE_ADDRESS`, priceOracle.address);
  setEnvValue(`${prefix}_FEE_DISTRIBUTOR_ADDRESS`, feeDist.address);
  setEnvValue(`${prefix}_CREATOR_REWARD_MANAGER_ADDRESS`, creatorRewardMgr.address);
  setEnvValue(`${prefix}_EXP_RATE_MODEL_ADDRESS`, expRateModel.address);
  setEnvValue(`${prefix}_LIN_RATE_MODEL_ADDRESS`, linRateModel.address);
  setEnvValue("VITE_CHAIN_ID", CHAIN_ID.toString());

  console.log("Done! Addresses saved to .env");

  console.log("\n========================================");
  console.log("  ALL CONTRACTS DEPLOYED SUCCESSFULLY");
  console.log("========================================\n");

  console.log(JSON.stringify({
    priceOracle: priceOracle.address,
    exponentialRateModel: expRateModel.address,
    linearRateModel: linRateModel.address,
    bondingCurve: bondingCurve.address,
    bondingCurveFactory: factory.address,
    perpetualPool: perpetualPool.address,
    buyAndBurnEngine: burnEngine.address,
    launchDao: launchDao.address,
    feeDistributor: feeDist.address,
    creatorRewardManager: creatorRewardMgr.address,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
