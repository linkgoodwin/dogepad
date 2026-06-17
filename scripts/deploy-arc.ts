import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually if dotenv doesn't work
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && !process.env[key]) {
          process.env[key] = valueParts.join('=');
        }
      }
    });
  }
}
loadEnv();

function setEnvValue(key: string, value: string) {
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
const ARC_RPC = "https://arc-testnet.drpc.org";
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";

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

  console.log("Using SimpleRouter as DEX_ROUTER");
  console.log("");

  const deployOverrides = { gasPrice: 2_000_000_000, gasLimit: 6_000_000 };
  const txOverrides = { gasPrice: 2_000_000_000, gasLimit: 500_000 };

  function getFactory(name: string) {
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

  async function deploy(name: string, ...args: any[]) {
    const factory = getFactory(name);
    console.log(`Deploying ${name}...`);
    const contract = await factory.deploy(...args, deployOverrides);
    await contract.deployed();
    console.log(`${name}:`, contract.address);
    return contract;
  }

  async function tx(label: string, fn: () => any) {
    console.log(`  Sending: ${label}...`);
    const tx = await fn();
    await tx.wait();
    console.log(`  Done: ${label}`);
  }

  console.log("--- Phase 1: Rate Models + Oracle ---");

  const priceOracle = await deploy("PriceOracle");
  const expRateModel = await deploy("ExponentialRateModel");
  const linRateModel = await deploy("LinearRateModel");

  console.log("\n--- Phase 2: Core (BondingCurve + Factory) ---");

  const simpleFactory = await deploy("SimpleFactory");
  const simpleRouter = await deploy("SimpleRouter", simpleFactory.address, WUSDC_ARC_TESTNET);

  const DEX_ROUTER = simpleRouter.address;
  console.log("SimpleFactory:", simpleFactory.address);
  console.log("SimpleRouter:", DEX_ROUTER);

  const bondingCurve = await deploy("BondingCurve", DEX_ROUTER, deployerAddress, true, WUSDC_ARC_TESTNET);
  const factory = await deploy("BondingCurveFactory", bondingCurve.address);

  await tx("BondingCurve.setFactory", () => bondingCurve.setFactory(factory.address, txOverrides));

  console.log("\n--- Phase 3: BuyAndBurn ---");

  const burnEngine = await deploy("BuyAndBurnEngine", DEX_ROUTER, deployerAddress, true, WUSDC_ARC_TESTNET);

  console.log("\n--- Phase 3b: DexLister ---");

  const dexLister = await deploy("DexLister", DEX_ROUTER, deployerAddress, true, WUSDC_ARC_TESTNET);

  console.log("\n--- Phase 4: PerpetualPool ---");

  const perpetualPool = await deploy("PerpetualPool", priceOracle.address, burnEngine.address, deployerAddress);

  console.log("\n--- Phase 5: FeeDistributor ---");

  const feeDist = await deploy("FeeDistributor", CORRECT_DOGE_TOKEN, DEX_ROUTER, burnEngine.address, ethers.constants.AddressZero, perpetualPool.address);

  await tx("BondingCurve.setPerpetualPool", () => bondingCurve.setPerpetualPool(perpetualPool.address, txOverrides));
  await tx("BondingCurve.setBuyAndBurnEngine", () => bondingCurve.setBuyAndBurnEngine(burnEngine.address, txOverrides));
  await tx("BondingCurve.setPriceOracle", () => bondingCurve.setPriceOracle(priceOracle.address, txOverrides));

  await tx("PerpetualPool.setBondingCurve", () => perpetualPool.setBondingCurve(bondingCurve.address, txOverrides));
  await tx("PerpetualPool.setDexLister", () => perpetualPool.setDexLister(dexLister.address, txOverrides));

  console.log("\n--- Phase 6: LaunchDAO ---");

  const launchDao = await deploy("LaunchDAO", bondingCurve.address, deployerAddress);

  await tx("BondingCurve.setLaunchDao", () => bondingCurve.setLaunchDao(launchDao.address, txOverrides));
  await tx("BondingCurve.setDaoOnlyLaunch", () => bondingCurve.setDaoOnlyLaunch(true, txOverrides));

  console.log("\n--- Phase 7: CreatorRewardManager ---");

  const creatorRewardMgr = await deploy("CreatorRewardManager", bondingCurve.address);

  await tx("BondingCurve.setCreatorRewardManager", () => bondingCurve.setCreatorRewardManager(creatorRewardMgr.address, txOverrides));

  console.log("\n--- Phase 8: Final Wiring ---");

  await tx("BondingCurve.setFeeDistributor", () => bondingCurve.setFeeDistributor(feeDist.address, txOverrides));
  await tx("BondingCurve.setDexLister", () => bondingCurve.setDexLister(dexLister.address, txOverrides));
  await tx("LaunchDAO.setFeeDistributor", () => launchDao.setFeeDistributor(feeDist.address, txOverrides));
  await tx("PerpetualPool.setPlatformTreasury", () => perpetualPool.setPlatformTreasury(feeDist.address, txOverrides));

  await tx("DexLister.setPerpetualPool", () => dexLister.setPerpetualPool(perpetualPool.address, txOverrides));
  await tx("DexLister.setFeeDistributor", () => dexLister.setFeeDistributor(feeDist.address, txOverrides));
  await tx("DexLister.setBuyAndBurnEngine", () => dexLister.setBuyAndBurnEngine(burnEngine.address, txOverrides));
  await tx("DexLister.setCreatorRewardManager", () => dexLister.setCreatorRewardManager(creatorRewardMgr.address, txOverrides));
  await tx("DexLister.setBondingCurve", () => dexLister.setBondingCurve(bondingCurve.address, txOverrides));

  await tx("PriceOracle.authorize(bondingCurve)", () => priceOracle.setAuthorizedUpdater(bondingCurve.address, true, txOverrides));
  await tx("PriceOracle.authorize(perpetualPool)", () => priceOracle.setAuthorizedUpdater(perpetualPool.address, true, txOverrides));

  console.log("\n========================================");
  console.log("  Writing addresses to .env ...");
  console.log("========================================");

  const prefix = 'VITE_ARC_TESTNET';

  setEnvValue(`${prefix}_BONDING_CURVE_ADDRESS`, bondingCurve.address);
  setEnvValue(`${prefix}_FACTORY_ADDRESS`, factory.address);
  setEnvValue(`${prefix}_SIMPLE_FACTORY_ADDRESS`, simpleFactory.address);
  setEnvValue(`${prefix}_SIMPLE_ROUTER_ADDRESS`, simpleRouter.address);
  setEnvValue(`${prefix}_PERPETUAL_POOL_ADDRESS`, perpetualPool.address);
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
    perpetualPool: perpetualPool.address,
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
