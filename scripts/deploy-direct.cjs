const { ethers } = require("ethers");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
dotenv.config();

const RPC_URL = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

const XYLO_ROUTER_ARC_TESTNET = "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const WUSDC_ARC_TESTNET = "0x911b4000D3422F482F4062a913885f7b035382Df";

let GAS_PRICE;
let DEPLOY_OVERRIDES;
let TX_OVERRIDES;

function setEnvValue(key, value) {
  const envPath = path.resolve(__dirname, "../.env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, envContent);
}

function getArtifact(name) {
  const subdirs = ["core", "periphery", "pool", "dao"];
  for (const dir of subdirs) {
    const p = path.resolve(__dirname, `../artifacts/contracts/${dir}/${name}.sol/${name}.json`);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(`Artifact not found for ${name}`);
}

function getFactory(name, wallet) {
  const artifact = getArtifact(name);
  return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
}

async function deployContract(factory, args = [], extraOverrides = {}) {
  const contract = await factory.deploy(...args, { ...DEPLOY_OVERRIDES, ...extraOverrides });
  console.log(`  Tx sent: ${contract.deployTransaction.hash}`);
  await contract.deployed();
  return contract;
}

async function sendTx(contract, method, args, label) {
  const tx = await contract[method](...args, TX_OVERRIDES);
  console.log(`  Tx sent: ${tx.hash}`);
  await tx.wait();
  console.log(`  -> ${label}`);
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: "arc-testnet",
    timeout: 120000,
  });

  const wallet = new ethers.Wallet(pk, provider);

  const networkGasPrice = await provider.getGasPrice();
  GAS_PRICE = ethers.utils.parseUnits("100", "gwei");
  console.log("Network gas price:", ethers.utils.formatUnits(networkGasPrice, "gwei"), "Gwei");
  console.log("Using gas price:", ethers.utils.formatUnits(GAS_PRICE, "gwei"), "Gwei");

  DEPLOY_OVERRIDES = { gasPrice: GAS_PRICE, gasLimit: 6_000_000 };
  TX_OVERRIDES = { gasPrice: GAS_PRICE, gasLimit: 500_000 };

  console.log("========================================");
  console.log("  DogePad Contract Deployment (Direct)");
  console.log("========================================");
  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");
  console.log("RPC:", RPC_URL);
  console.log("");

  if (balance.lt(ethers.utils.parseEther("0.05"))) {
    console.error("ERROR: Need at least 0.05 USDC!");
    process.exit(1);
  }

  const DEX_ROUTER = XYLO_ROUTER_ARC_TESTNET;
  const baseAsset = WUSDC_ARC_TESTNET;
  const isXyloRouter = true;

  console.log("--- Phase 1: Rate Models + Oracle ---");
  const priceOracle = await deployContract(getFactory("PriceOracle", wallet));
  console.log("PriceOracle:", priceOracle.address);

  const expRateModel = await deployContract(getFactory("ExponentialRateModel", wallet));
  console.log("ExponentialRateModel:", expRateModel.address);

  const linRateModel = await deployContract(getFactory("LinearRateModel", wallet));
  console.log("LinearRateModel:", linRateModel.address);

  console.log("\n--- Phase 2: Core (BondingCurve + Factory) ---");
  const bondingCurve = await deployContract(
    getFactory("BondingCurve", wallet),
    [DEX_ROUTER, wallet.address, isXyloRouter, baseAsset],
    { gasLimit: 8_000_000 }
  );
  console.log("BondingCurve:", bondingCurve.address);

  const factory = await deployContract(
    getFactory("BondingCurveFactory", wallet),
    [bondingCurve.address]
  );
  console.log("BondingCurveFactory:", factory.address);

  await sendTx(bondingCurve, "setFactory", [factory.address], "BondingCurve.factory set");

  console.log("\n--- Phase 3: BuyAndBurn ---");
  const burnEngine = await deployContract(
    getFactory("BuyAndBurnEngine", wallet),
    [DEX_ROUTER, wallet.address, isXyloRouter, baseAsset]
  );
  console.log("BuyAndBurnEngine:", burnEngine.address);

  console.log("\n--- Phase 4: FeeDistributor ---");
  const feeDist = await deployContract(
    getFactory("FeeDistributor", wallet),
    [ethers.constants.AddressZero, DEX_ROUTER, burnEngine.address, baseAsset]
  );
  console.log("FeeDistributor:", feeDist.address);

  console.log("\n--- Phase 5: Pools ---");
  const longPool = await deployContract(
    getFactory("LongPool", wallet),
    [expRateModel.address, linRateModel.address, priceOracle.address]
  );
  console.log("LongPool:", longPool.address);

  const shortPool = await deployContract(
    getFactory("ShortPool", wallet),
    [expRateModel.address, linRateModel.address, priceOracle.address, burnEngine.address, longPool.address, wallet.address]
  );
  console.log("ShortPool:", shortPool.address);

  await sendTx(bondingCurve, "setPools", [longPool.address, shortPool.address], "BondingCurve.pools set");
  await sendTx(bondingCurve, "setBuyAndBurnEngine", [burnEngine.address], "BondingCurve.burnEngine set");
  await sendTx(bondingCurve, "setPriceOracle", [priceOracle.address], "BondingCurve.priceOracle set");

  await sendTx(longPool, "setBurnEngine", [burnEngine.address], "LongPool.burnEngine set");
  await sendTx(longPool, "setBondingCurve", [bondingCurve.address], "LongPool.bondingCurve set");
  await sendTx(longPool, "setShortPool", [shortPool.address], "LongPool.shortPool set");

  await sendTx(shortPool, "setBondingCurve", [bondingCurve.address], "ShortPool.bondingCurve set");

  console.log("\n--- Phase 6: LaunchDAO ---");
  const launchDao = await deployContract(
    getFactory("LaunchDAO", wallet),
    [bondingCurve.address, wallet.address],
    { gasLimit: 8_000_000 }
  );
  console.log("LaunchDAO:", launchDao.address);

  await sendTx(bondingCurve, "setLaunchDao", [launchDao.address], "BondingCurve.launchDao set");
  await sendTx(bondingCurve, "setDaoOnlyLaunch", [true], "daoOnlyLaunch enabled");

  console.log("\n--- Phase 7: CreatorRewardManager ---");
  const creatorRewardMgr = await deployContract(
    getFactory("CreatorRewardManager", wallet),
    [bondingCurve.address]
  );
  console.log("CreatorRewardManager:", creatorRewardMgr.address);

  await sendTx(bondingCurve, "setCreatorRewardManager", [creatorRewardMgr.address], "BondingCurve.creatorRewardManager set");

  console.log("\n--- Phase 8: Final Wiring ---");
  await sendTx(bondingCurve, "setFeeDistributor", [feeDist.address], "BondingCurve.feeDistributor updated");
  await sendTx(launchDao, "setFeeDistributor", [feeDist.address], "LaunchDAO.feeDistributor updated");
  await sendTx(shortPool, "setPlatformTreasury", [feeDist.address], "ShortPool.platformTreasury updated");

  await sendTx(priceOracle, "setAuthorizedUpdater", [bondingCurve.address, true], "PriceOracle: bondingCurve authorized");
  await sendTx(priceOracle, "setAuthorizedUpdater", [longPool.address, true], "PriceOracle: longPool authorized");
  await sendTx(priceOracle, "setAuthorizedUpdater", [shortPool.address, true], "PriceOracle: shortPool authorized");

  console.log("\n========================================");
  console.log("  Writing addresses to .env ...");
  console.log("========================================");

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
