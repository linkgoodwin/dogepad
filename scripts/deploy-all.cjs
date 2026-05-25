const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";
const ARC_RPC = "https://rpc.testnet.arc.network";

function setEnvValue(key, value) {
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

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const deployerAddress = wallet.address;

  const networkInfo = await provider.getNetwork();
  const chainId = networkInfo.chainId;

  console.log("========================================");
  console.log("  DogePad - Full Arc Testnet Deployment");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), "USDC");
  console.log("Chain ID:", chainId.toString());
  console.log("");

  const deployOverrides = { maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 1_000_000_000, gasLimit: 6_000_000 };
  const txOverrides = { maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 1_000_000_000, gasLimit: 500_000 };

  const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");

  function getFactory(name) {
    const subdirs = ["core", "periphery", "pool", "dao"];
    for (const dir of subdirs) {
      for (const suffix of [`${name}.sol`, name]) {
        const artifactPath = path.join(ARTIFACTS_DIR, dir, suffix, `${name}.json`);
        if (fs.existsSync(artifactPath)) {
          const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
          return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
        }
      }
    }
    throw new Error(`Artifact not found for ${name}`);
  }

  async function deploy(name, ...args) {
    const factory = getFactory(name);
    console.log(`Deploying ${name}...`);
    const contract = await factory.deploy(...args, deployOverrides);
    await contract.deployed();
    console.log(`  ${name}: ${contract.address}`);
    return contract;
  }

  async function tx(label, fn) {
    console.log(`  Sending: ${label}...`);
    const t = await fn();
    await t.wait();
    console.log(`  Done: ${label}`);
  }

  console.log("--- Phase 1: Rate Models + Oracle ---");
  const priceOracle = await deploy("PriceOracle");
  const expRateModel = await deploy("ExponentialRateModel");
  const linRateModel = await deploy("LinearRateModel");

  console.log("\n--- Phase 2: SimpleFactory + SimpleRouter + BondingCurve ---");
  const simpleFactory = await deploy("SimpleFactory");
  const simpleRouter = await deploy("SimpleRouter", simpleFactory.address, WUSDC);
  const DEX_ROUTER = simpleRouter.address;
  console.log(`  DEX_ROUTER = SimpleRouter: ${DEX_ROUTER}`);

  const bondingCurve = await deploy("BondingCurve", DEX_ROUTER, deployerAddress, true, WUSDC);
  const factory = await deploy("BondingCurveFactory", bondingCurve.address);
  await tx("BondingCurve.setFactory", () => bondingCurve.setFactory(factory.address, txOverrides));

  console.log("\n--- Phase 3: BuyAndBurn + DexLister ---");
  const burnEngine = await deploy("BuyAndBurnEngine", DEX_ROUTER, deployerAddress, true, WUSDC);
  const dexLister = await deploy("DexLister", DEX_ROUTER, deployerAddress, true, WUSDC);

  console.log("\n--- Phase 4: Pools ---");
  const longPool = await deploy("LongPool", expRateModel.address, linRateModel.address, priceOracle.address);
  const shortPool = await deploy("ShortPool", expRateModel.address, linRateModel.address, priceOracle.address, burnEngine.address, longPool.address, deployerAddress);

  console.log("\n--- Phase 5: FeeDistributor ---");
  const feeDist = await deploy("FeeDistributor", CORRECT_DOGE_TOKEN, DEX_ROUTER, burnEngine.address, ethers.constants.AddressZero, longPool.address);

  console.log("\n--- Phase 6: Wiring ---");
  await tx("BondingCurve.setPools", () => bondingCurve.setPools(longPool.address, shortPool.address, txOverrides));
  await tx("BondingCurve.setBuyAndBurnEngine", () => bondingCurve.setBuyAndBurnEngine(burnEngine.address, txOverrides));
  await tx("BondingCurve.setPriceOracle", () => bondingCurve.setPriceOracle(priceOracle.address, txOverrides));
  await tx("BondingCurve.setFeeDistributor", () => bondingCurve.setFeeDistributor(feeDist.address, txOverrides));
  await tx("BondingCurve.setDexLister", () => bondingCurve.setDexLister(dexLister.address, txOverrides));

  await tx("LongPool.setBurnEngine", () => longPool.setBurnEngine(burnEngine.address, txOverrides));
  await tx("LongPool.setBondingCurve", () => longPool.setBondingCurve(bondingCurve.address, txOverrides));
  await tx("LongPool.setShortPool", () => longPool.setShortPool(shortPool.address, txOverrides));

  await tx("ShortPool.setBondingCurve", () => shortPool.setBondingCurve(bondingCurve.address, txOverrides));

  console.log("\n--- Phase 7: LaunchDAO ---");
  const launchDao = await deploy("LaunchDAO", bondingCurve.address, deployerAddress);
  await tx("BondingCurve.setLaunchDao", () => bondingCurve.setLaunchDao(launchDao.address, txOverrides));
  await tx("BondingCurve.setDaoOnlyLaunch", () => bondingCurve.setDaoOnlyLaunch(true, txOverrides));

  console.log("\n--- Phase 8: CreatorRewardManager ---");
  const creatorRewardMgr = await deploy("CreatorRewardManager", bondingCurve.address);
  await tx("BondingCurve.setCreatorRewardManager", () => bondingCurve.setCreatorRewardManager(creatorRewardMgr.address, txOverrides));

  console.log("\n--- Phase 9: Final Wiring ---");
  await tx("LaunchDAO.setFeeDistributor", () => launchDao.setFeeDistributor(feeDist.address, txOverrides));
  await tx("ShortPool.setPlatformTreasury", () => shortPool.setPlatformTreasury(feeDist.address, txOverrides));

  await tx("DexLister.setPools", () => dexLister.setPools(longPool.address, shortPool.address, txOverrides));
  await tx("DexLister.setFeeDistributor", () => dexLister.setFeeDistributor(feeDist.address, txOverrides));
  await tx("DexLister.setBuyAndBurnEngine", () => dexLister.setBuyAndBurnEngine(burnEngine.address, txOverrides));
  await tx("DexLister.setCreatorRewardManager", () => dexLister.setCreatorRewardManager(creatorRewardMgr.address, txOverrides));
  await tx("DexLister.setBondingCurve", () => dexLister.setBondingCurve(bondingCurve.address, txOverrides));

  await tx("CreatorRewardManager.setDexLister", () => creatorRewardMgr.setDexLister(dexLister.address, txOverrides));
  await tx("ShortPool.setDexLister", () => shortPool.setDexLister(dexLister.address, txOverrides));

  await tx("PriceOracle.authorize(bondingCurve)", () => priceOracle.setAuthorizedUpdater(bondingCurve.address, true, txOverrides));
  await tx("PriceOracle.authorize(longPool)", () => priceOracle.setAuthorizedUpdater(longPool.address, true, txOverrides));
  await tx("PriceOracle.authorize(shortPool)", () => priceOracle.setAuthorizedUpdater(shortPool.address, true, txOverrides));

  console.log("\n========================================");
  console.log("  Saving addresses to .env ...");
  console.log("========================================");

  const prefix = "VITE_ARC_TESTNET";
  setEnvValue(`${prefix}_BONDING_CURVE_ADDRESS`, bondingCurve.address);
  setEnvValue(`${prefix}_FACTORY_ADDRESS`, factory.address);
  setEnvValue(`${prefix}_SIMPLE_FACTORY_ADDRESS`, simpleFactory.address);
  setEnvValue(`${prefix}_SIMPLE_ROUTER_ADDRESS`, simpleRouter.address);
  setEnvValue(`${prefix}_LONG_POOL_ADDRESS`, longPool.address);
  setEnvValue(`${prefix}_SHORT_POOL_ADDRESS`, shortPool.address);
  setEnvValue(`${prefix}_BUY_AND_BURN_ADDRESS`, burnEngine.address);
  setEnvValue(`${prefix}_DEX_LISTER_ADDRESS`, dexLister.address);
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
    simpleFactory: simpleFactory.address,
    simpleRouter: simpleRouter.address,
    bondingCurve: bondingCurve.address,
    bondingCurveFactory: factory.address,
    longPool: longPool.address,
    shortPool: shortPool.address,
    buyAndBurnEngine: burnEngine.address,
    dexLister: dexLister.address,
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
