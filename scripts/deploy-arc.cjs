const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

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

const XYLO_ROUTER_ARC_TESTNET = "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const WUSDC_ARC_TESTNET = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ARC_RPC = "https://rpc.testnet.arc.network";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("\nERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const deployerAddress = wallet.address;

  const networkInfo = await provider.getNetwork();
  const chainId = networkInfo.chainId;

  console.log("========================================");
  console.log("  DogePad - Arc Testnet Deployment");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), "USDC");
  console.log("Chain ID:", chainId.toString());
  console.log("");

  const balance = await provider.getBalance(deployerAddress);
  if (balance.lt(ethers.utils.parseEther("0.05"))) {
    console.error("ERROR: Deployer needs at least 0.05 USDC to deploy!");
    console.error("Get testnet USDC from: https://faucet.circle.com");
    process.exit(1);
  }

  const DEX_ROUTER = XYLO_ROUTER_ARC_TESTNET;
  const IS_XYLO_ROUTER = true;
  const BASE_ASSET = WUSDC_ARC_TESTNET;
  console.log("XyloRouter:", DEX_ROUTER);
  console.log("isXyloRouter:", IS_XYLO_ROUTER);
  console.log("baseAsset (WUSDC):", BASE_ASSET);
  console.log("");

  const deployOverrides = { gasPrice: ethers.utils.parseUnits("25", "gwei"), gasLimit: 15_000_000 };
  const txOverrides = { gasPrice: ethers.utils.parseUnits("25", "gwei"), gasLimit: 1_000_000 };

  function getFactory(name) {
    const subdirs = ["core", "periphery", "pool", "dao"];
    for (const dir of subdirs) {
      const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${dir}/${name}.sol/${name}.json`);
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
      }
    }
    throw new Error(`Artifact not found for ${name}`);
  }

  async function deployContract(name, ...args) {
    const factory = getFactory(name);
    console.log(`Deploying ${name}...`);
    const contract = await factory.deploy(...args, deployOverrides);
    await contract.deployed();
    console.log(`${name}:`, contract.address);
    return contract;
  }

  async function sendTx(label, fn) {
    console.log(`  Sending: ${label}...`);
    const tx = await fn();
    await tx.wait();
    console.log(`  Done: ${label}`);
  }

  console.log("--- Phase 1: Rate Models + Oracle ---");

  const priceOracle = await deployContract("PriceOracle");
  const expRateModel = await deployContract("ExponentialRateModel");
  const linRateModel = await deployContract("LinearRateModel");

  console.log("\n--- Phase 2: Core (BondingCurve + Factory) ---");

  const bondingCurve = await deployContract("BondingCurve", DEX_ROUTER, deployerAddress, IS_XYLO_ROUTER, BASE_ASSET);
  const factory = await deployContract("BondingCurveFactory", bondingCurve.address);

  await sendTx("BondingCurve.setFactory", () => bondingCurve.setFactory(factory.address, txOverrides));

  console.log("\n--- Phase 3: BuyAndBurn ---");

  const burnEngine = await deployContract("BuyAndBurnEngine", DEX_ROUTER, deployerAddress, IS_XYLO_ROUTER, BASE_ASSET);

  console.log("\n--- Phase 4: FeeDistributor ---");

  const feeDist = await deployContract("FeeDistributor", ethers.constants.AddressZero, DEX_ROUTER, burnEngine.address, BASE_ASSET);

  console.log("\n--- Phase 5: Pools ---");

  const longPool = await deployContract("LongPool", expRateModel.address, linRateModel.address, priceOracle.address);
  const shortPool = await deployContract("ShortPool", expRateModel.address, linRateModel.address, priceOracle.address, burnEngine.address, longPool.address, deployerAddress);

  await sendTx("BondingCurve.setPools", () => bondingCurve.setPools(longPool.address, shortPool.address, txOverrides));
  await sendTx("BondingCurve.setBuyAndBurnEngine", () => bondingCurve.setBuyAndBurnEngine(burnEngine.address, txOverrides));
  await sendTx("BondingCurve.setPriceOracle", () => bondingCurve.setPriceOracle(priceOracle.address, txOverrides));

  await sendTx("LongPool.setBurnEngine", () => longPool.setBurnEngine(burnEngine.address, txOverrides));
  await sendTx("LongPool.setBondingCurve", () => longPool.setBondingCurve(bondingCurve.address, txOverrides));
  await sendTx("LongPool.setShortPool", () => longPool.setShortPool(shortPool.address, txOverrides));

  await sendTx("ShortPool.setBondingCurve", () => shortPool.setBondingCurve(bondingCurve.address, txOverrides));

  console.log("\n--- Phase 6: LaunchDAO ---");

  const launchDao = await deployContract("LaunchDAO", bondingCurve.address, deployerAddress);

  await sendTx("BondingCurve.setLaunchDao", () => bondingCurve.setLaunchDao(launchDao.address, txOverrides));
  await sendTx("BondingCurve.setDaoOnlyLaunch", () => bondingCurve.setDaoOnlyLaunch(true, txOverrides));

  console.log("\n--- Phase 7: CreatorRewardManager ---");

  const creatorRewardMgr = await deployContract("CreatorRewardManager", bondingCurve.address);

  await sendTx("BondingCurve.setCreatorRewardManager", () => bondingCurve.setCreatorRewardManager(creatorRewardMgr.address, txOverrides));

  console.log("\n--- Phase 8: Final Wiring ---");

  await sendTx("BondingCurve.setFeeDistributor", () => bondingCurve.setFeeDistributor(feeDist.address, txOverrides));
  await sendTx("LaunchDAO.setFeeDistributor", () => launchDao.setFeeDistributor(feeDist.address, txOverrides));
  await sendTx("ShortPool.setPlatformTreasury", () => shortPool.setPlatformTreasury(feeDist.address, txOverrides));

  await sendTx("PriceOracle.authorize(bondingCurve)", () => priceOracle.setAuthorizedUpdater(bondingCurve.address, true, txOverrides));
  await sendTx("PriceOracle.authorize(longPool)", () => priceOracle.setAuthorizedUpdater(longPool.address, true, txOverrides));
  await sendTx("PriceOracle.authorize(shortPool)", () => priceOracle.setAuthorizedUpdater(shortPool.address, true, txOverrides));

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
  setEnvValue("VITE_CHAIN_ID", chainId.toString());

  console.log("Done! Contract addresses saved to .env");

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
