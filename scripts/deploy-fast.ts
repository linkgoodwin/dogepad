/**
 * DogePad 快速部署脚本
 * 使用更快的方式部署到 Arc Testnet
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
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

const WUSDC_ARC_TESTNET = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ARC_RPC = "https://arc-testnet.drpc.org"; // Fastest RPC
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";

// Gas settings for Arc Testnet (lower to speed up)
const GAS_PRICE = ethers.utils.parseUnits("2", "gwei"); // 2 Gwei
const DEPLOY_GAS_LIMIT = 8_000_000;
const TX_GAS_LIMIT = 500_000;

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

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("\nERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  console.log("Connecting to Arc Testnet...");
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  
  console.log("Deployer:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH");
  
  if (balance.lt(ethers.utils.parseEther("0.01"))) {
    console.error("ERROR: Low balance!");
    process.exit(1);
  }

  const deployOverrides = { gasPrice: GAS_PRICE, gasLimit: DEPLOY_GAS_LIMIT };
  const txOverrides = { gasPrice: GAS_PRICE, gasLimit: TX_GAS_LIMIT };

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
    console.log(`Deploying ${name}...`);
    const factory = getFactory(name);
    try {
      const contract = await factory.deploy(...args, {
        ...deployOverrides,
        timeout: 300000 // 5 minute timeout per deployment
      });
      console.log(`  Tx sent: ${contract.deployTransaction.hash}`);
      await contract.deployed();
      console.log(`  ✓ ${name}: ${contract.address}`);
      return contract;
    } catch (e: any) {
      console.error(`  ✗ ${name} failed: ${e.message}`);
      throw e;
    }
  }

  async function tx(label: string, fn: () => any) {
    console.log(`  Setting ${label}...`);
    try {
      const tx = await fn();
      console.log(`  Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      console.error(`  ✗ ${label} failed: ${e.message}`);
      throw e;
    }
  }

  const deployed: Record<string, any> = {};

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 1: Rate Models + Oracle");
  console.log("═══════════════════════════════════════════════════");
  
  deployed.priceOracle = await deploy("PriceOracle");
  deployed.expRateModel = await deploy("ExponentialRateModel");
  deployed.linRateModel = await deploy("LinearRateModel");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 2: Core (BondingCurve + Factory)");
  console.log("═══════════════════════════════════════════════════");

  deployed.simpleFactory = await deploy("SimpleFactory");
  deployed.simpleRouter = await deploy("SimpleRouter", deployed.simpleFactory.address, WUSDC_ARC_TESTNET);
  
  const DEX_ROUTER = deployed.simpleRouter.address;
  
  deployed.bondingCurve = await deploy("BondingCurve", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);
  deployed.factory = await deploy("BondingCurveFactory", deployed.bondingCurve.address);

  await tx("BondingCurve.setFactory", () => deployed.bondingCurve.setFactory(deployed.factory.address, txOverrides));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 3: BuyAndBurn + DexLister");
  console.log("═══════════════════════════════════════════════════");

  deployed.burnEngine = await deploy("BuyAndBurnEngine", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);
  deployed.dexLister = await deploy("DexLister", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 4: PerpetualPool");
  console.log("═══════════════════════════════════════════════════");

  deployed.perpetualPool = await deploy("PerpetualPool", deployed.priceOracle.address, deployed.burnEngine.address, wallet.address);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 5: FeeDistributor");
  console.log("═══════════════════════════════════════════════════");

  deployed.feeDist = await deploy("FeeDistributor", CORRECT_DOGE_TOKEN, DEX_ROUTER, deployed.burnEngine.address, ethers.constants.AddressZero, deployed.perpetualPool.address);

  await tx("BondingCurve.setPerpetualPool", () => deployed.bondingCurve.setPerpetualPool(deployed.perpetualPool.address, txOverrides));
  await tx("BondingCurve.setBuyAndBurnEngine", () => deployed.bondingCurve.setBuyAndBurnEngine(deployed.burnEngine.address, txOverrides));
  await tx("BondingCurve.setPriceOracle", () => deployed.bondingCurve.setPriceOracle(deployed.priceOracle.address, txOverrides));

  await tx("PerpetualPool.setBondingCurve", () => deployed.perpetualPool.setBondingCurve(deployed.bondingCurve.address, txOverrides));
  await tx("PerpetualPool.setDexLister", () => deployed.perpetualPool.setDexLister(deployed.dexLister.address, txOverrides));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 6: LaunchDAO");
  console.log("═══════════════════════════════════════════════════");

  deployed.launchDao = await deploy("LaunchDAO", deployed.bondingCurve.address, wallet.address);

  await tx("BondingCurve.setLaunchDao", () => deployed.bondingCurve.setLaunchDao(deployed.launchDao.address, txOverrides));
  await tx("BondingCurve.setDaoOnlyLaunch", () => deployed.bondingCurve.setDaoOnlyLaunch(true, txOverrides));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 7: CreatorRewardManager");
  console.log("═══════════════════════════════════════════════════");

  deployed.creatorRewardMgr = await deploy("CreatorRewardManager", deployed.bondingCurve.address);

  await tx("BondingCurve.setCreatorRewardManager", () => deployed.bondingCurve.setCreatorRewardManager(deployed.creatorRewardMgr.address, txOverrides));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 8: Final Wiring");
  console.log("═══════════════════════════════════════════════════");

  await tx("BondingCurve.setFeeDistributor", () => deployed.bondingCurve.setFeeDistributor(deployed.feeDist.address, txOverrides));
  await tx("BondingCurve.setDexLister", () => deployed.bondingCurve.setDexLister(deployed.dexLister.address, txOverrides));
  await tx("LaunchDAO.setFeeDistributor", () => deployed.launchDao.setFeeDistributor(deployed.feeDist.address, txOverrides));
  await tx("PerpetualPool.setPlatformTreasury", () => deployed.perpetualPool.setPlatformTreasury(deployed.feeDist.address, txOverrides));

  await tx("DexLister.setPerpetualPool", () => deployed.dexLister.setPerpetualPool(deployed.perpetualPool.address, txOverrides));
  await tx("DexLister.setFeeDistributor", () => deployed.dexLister.setFeeDistributor(deployed.feeDist.address, txOverrides));
  await tx("DexLister.setBuyAndBurnEngine", () => deployed.dexLister.setBuyAndBurnEngine(deployed.burnEngine.address, txOverrides));
  await tx("DexLister.setCreatorRewardManager", () => deployed.dexLister.setCreatorRewardManager(deployed.creatorRewardMgr.address, txOverrides));
  await tx("DexLister.setBondingCurve", () => deployed.dexLister.setBondingCurve(deployed.bondingCurve.address, txOverrides));

  await tx("PriceOracle.authorize(bondingCurve)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.bondingCurve.address, true, txOverrides));
  await tx("PriceOracle.authorize(perpetualPool)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.perpetualPool.address, true, txOverrides));

  // Save to .env
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Saving addresses to .env");
  console.log("═══════════════════════════════════════════════════");

  const prefix = 'VITE_ARC_TESTNET';

  setEnvValue(`${prefix}_BONDING_CURVE_ADDRESS`, deployed.bondingCurve.address);
  setEnvValue(`${prefix}_FACTORY_ADDRESS`, deployed.factory.address);
  setEnvValue(`${prefix}_SIMPLE_FACTORY_ADDRESS`, deployed.simpleFactory.address);
  setEnvValue(`${prefix}_SIMPLE_ROUTER_ADDRESS`, deployed.simpleRouter.address);
  setEnvValue(`${prefix}_PERPETUAL_POOL_ADDRESS`, deployed.perpetualPool.address);
  setEnvValue(`${prefix}_BUY_AND_BURN_ADDRESS`, deployed.burnEngine.address);
  setEnvValue(`${prefix}_DEX_LISTER_ADDRESS`, deployed.dexLister.address);
  setEnvValue(`${prefix}_LAUNCH_DAO_ADDRESS`, deployed.launchDao.address);
  setEnvValue(`${prefix}_PRICE_ORACLE_ADDRESS`, deployed.priceOracle.address);
  setEnvValue(`${prefix}_FEE_DISTRIBUTOR_ADDRESS`, deployed.feeDist.address);
  setEnvValue(`${prefix}_CREATOR_REWARD_MANAGER_ADDRESS`, deployed.creatorRewardMgr.address);
  setEnvValue(`${prefix}_EXP_RATE_MODEL_ADDRESS`, deployed.expRateModel.address);
  setEnvValue(`${prefix}_LIN_RATE_MODEL_ADDRESS`, deployed.linRateModel.address);
  setEnvValue("VITE_CHAIN_ID", "5042002");

  console.log("Addresses saved!");
  
  // Print summary
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log(JSON.stringify({
    priceOracle: deployed.priceOracle.address,
    exponentialRateModel: deployed.expRateModel.address,
    linearRateModel: deployed.linRateModel.address,
    simpleFactory: deployed.simpleFactory.address,
    simpleRouter: deployed.simpleRouter.address,
    bondingCurve: deployed.bondingCurve.address,
    bondingCurveFactory: deployed.factory.address,
    perpetualPool: deployed.perpetualPool.address,
    buyAndBurnEngine: deployed.burnEngine.address,
    dexLister: deployed.dexLister.address,
    launchDao: deployed.launchDao.address,
    feeDistributor: deployed.feeDist.address,
    creatorRewardManager: deployed.creatorRewardMgr.address,
  }, null, 2));

  console.log("\nNext steps:");
  console.log("1. node scripts/diagnose-contracts.mjs - Verify deployment");
  console.log("2. Copy .env to .env.local for frontend");
  console.log("3. Test the launch flow!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
