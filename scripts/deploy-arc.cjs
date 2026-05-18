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

async function main() {
  const p = new ethers.providers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "arc", timeout: 120000 });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);
  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  console.log("Deployer:", w.address);
  console.log("Balance:", ethers.utils.formatEther(await p.getBalance(w.address)), "USDC\n");

  async function deploy(name, args = [], gasLimit = 3_000_000) {
    const artifact = getArtifact(name);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w);
    console.log(`Deploying ${name}... (gasLimit: ${gasLimit})`);
    const contract = await factory.deploy(...args, { gasPrice, gasLimit });
    console.log(`  Tx: ${contract.deployTransaction.hash}`);
    await contract.deployed();
    console.log(`  Address: ${contract.address}`);
    return contract;
  }

  async function sendTx(contract, method, args, label) {
    console.log(`  Sending ${label}...`);
    const tx = await contract[method](...args, { gasPrice, gasLimit: 500_000 });
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  -> ${label} done`);
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

  console.log("\n--- Phase 5: Pools ---");
  const longPool = await deploy("LongPool", [expRateModel.address, linRateModel.address, priceOracle.address], 5_000_000);
  const shortPool = await deploy("ShortPool", [expRateModel.address, linRateModel.address, priceOracle.address, burnEngine.address, longPool.address, w.address], 5_000_000);

  await sendTx(bondingCurve, "setPools", [longPool.address, shortPool.address], "setPools");
  await sendTx(bondingCurve, "setBuyAndBurnEngine", [burnEngine.address], "setBuyAndBurnEngine");
  await sendTx(bondingCurve, "setPriceOracle", [priceOracle.address], "setPriceOracle");

  await sendTx(longPool, "setBurnEngine", [burnEngine.address], "LongPool.setBurnEngine");
  await sendTx(longPool, "setBondingCurve", [bondingCurve.address], "LongPool.setBondingCurve");
  await sendTx(longPool, "setShortPool", [shortPool.address], "LongPool.setShortPool");
  await sendTx(shortPool, "setBondingCurve", [bondingCurve.address], "ShortPool.setBondingCurve");

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
  await sendTx(shortPool, "setPlatformTreasury", [feeDist.address], "setPlatformTreasury");

  await sendTx(priceOracle, "setAuthorizedUpdater", [bondingCurve.address, true], "PriceOracle: bondingCurve");
  await sendTx(priceOracle, "setAuthorizedUpdater", [longPool.address, true], "PriceOracle: longPool");
  await sendTx(priceOracle, "setAuthorizedUpdater", [shortPool.address, true], "PriceOracle: shortPool");

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
  setEnvValue(`${prefix}_LONG_POOL_ADDRESS`, longPool.address);
  setEnvValue(`${prefix}_SHORT_POOL_ADDRESS`, shortPool.address);
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
    longPool: longPool.address,
    shortPool: shortPool.address,
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
