/**
 * DogePad BSC Testnet 部署脚本
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// BSC Testnet 合约地址
const WUSDC_BSC_TESTNET = "0xD4B37C0Db5D26C2b7e7dA99E64247A31c5CE88d4"; // 实际地址需要确认
const CORRECT_DOGE_TOKEN = "0xD4B37C0Db5D26C2b7e7dA99E64247A31c5CE88d4";

const BSC_RPC = "https://data-seed-prebsc-1-s1.binance.org:8545";
const BSC_CHAIN_ID = 97;

const GAS_PRICE = ethers.utils.parseUnits("3", "gwei"); // 3 Gwei
const DEPLOY_GAS_LIMIT = 10_000_000;
const TX_GAS_LIMIT = 1_000_000;

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
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  console.log("Connecting to BSC Testnet...");
  const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  
  console.log("Deployer:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "BNB\n");

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

  const deployed: Record<string, any> = {};

  async function deploy(name: string, ...args: any[]) {
    console.log(`Deploying ${name}...`);
    const factory = getFactory(name);
    try {
      const contract = await factory.deploy(...args, {
        gasPrice: GAS_PRICE,
        gasLimit: DEPLOY_GAS_LIMIT,
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

  async function setTx(label: string, fn: () => any) {
    console.log(`  Setting ${label}...`);
    try {
      const tx = await fn();
      await tx.wait();
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      console.error(`  ✗ ${label} failed: ${e.message}`);
      throw e;
    }
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 1: Oracle + Rate Models");
  console.log("═══════════════════════════════════════════════════");
  
  deployed.priceOracle = await deploy("PriceOracle");
  deployed.expRateModel = await deploy("ExponentialRateModel");
  deployed.linRateModel = await deploy("LinearRateModel");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 2: Core Contracts");
  console.log("═══════════════════════════════════════════════════");

  // 部署 Mock WUSDC 如果不存在
  let wusdcAddress = WUSDC_BSC_TESTNET;
  try {
    const code = await provider.getCode(wusdcAddress);
    if (code === "0x") {
      console.log("Deploying MockWUSDC...");
      const mockWusdc = await deploy("MockERC20", "USD Coin", "USDC", 1000000n * 10n**18n);
      wusdcAddress = mockWusdc.address;
    }
  } catch (e) {
    console.log("Deploying MockWUSDC...");
    const mockWusdc = await deploy("MockERC20", "USD Coin", "USDC", 1000000n * 10n**18n);
    wusdcAddress = mockWusdc.address;
  }
  console.log(`  WUSDC: ${wusdcAddress}`);

  deployed.simpleFactory = await deploy("SimpleFactory");
  deployed.simpleRouter = await deploy("SimpleRouter", deployed.simpleFactory.address, wusdcAddress);
  
  const DEX_ROUTER = deployed.simpleRouter.address;
  
  deployed.bondingCurve = await deploy("BondingCurve", DEX_ROUTER, wallet.address, true, wusdcAddress);
  deployed.factory = await deploy("BondingCurveFactory", deployed.bondingCurve.address);

  await setTx("BondingCurve.setFactory", () => deployed.bondingCurve.setFactory(deployed.factory.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 3: BuyAndBurn + DexLister");
  console.log("═══════════════════════════════════════════════════");

  deployed.burnEngine = await deploy("BuyAndBurnEngine", DEX_ROUTER, wallet.address, true, wusdcAddress);
  deployed.dexLister = await deploy("DexLister", DEX_ROUTER, wallet.address, true, wusdcAddress);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 4: PerpetualPool");
  console.log("═══════════════════════════════════════════════════");

  deployed.perpetualPool = await deploy("PerpetualPool", deployed.priceOracle.address, deployed.burnEngine.address, wallet.address);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 5: FeeDistributor");
  console.log("═══════════════════════════════════════════════════");

  deployed.feeDist = await deploy("FeeDistributor", wusdcAddress, DEX_ROUTER, deployed.burnEngine.address, ethers.constants.AddressZero, deployed.perpetualPool.address);

  await setTx("BondingCurve.setPerpetualPool", () => deployed.bondingCurve.setPerpetualPool(deployed.perpetualPool.address));
  await setTx("BondingCurve.setBuyAndBurnEngine", () => deployed.bondingCurve.setBuyAndBurnEngine(deployed.burnEngine.address));
  await setTx("BondingCurve.setPriceOracle", () => deployed.bondingCurve.setPriceOracle(deployed.priceOracle.address));
  await setTx("PerpetualPool.setBondingCurve", () => deployed.perpetualPool.setBondingCurve(deployed.bondingCurve.address));
  await setTx("PerpetualPool.setDexLister", () => deployed.perpetualPool.setDexLister(deployed.dexLister.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 6: LaunchDAO");
  console.log("═══════════════════════════════════════════════════");

  deployed.launchDao = await deploy("LaunchDAO", deployed.bondingCurve.address, wallet.address);

  await setTx("BondingCurve.setLaunchDao", () => deployed.bondingCurve.setLaunchDao(deployed.launchDao.address));
  await setTx("BondingCurve.setDaoOnlyLaunch", () => deployed.bondingCurve.setDaoOnlyLaunch(true));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 7: CreatorRewardManager");
  console.log("═══════════════════════════════════════════════════");

  deployed.creatorRewardMgr = await deploy("CreatorRewardManager", deployed.bondingCurve.address);
  await setTx("BondingCurve.setCreatorRewardManager", () => deployed.bondingCurve.setCreatorRewardManager(deployed.creatorRewardMgr.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  PHASE 8: Final Wiring");
  console.log("═══════════════════════════════════════════════════");

  await setTx("BondingCurve.setFeeDistributor", () => deployed.bondingCurve.setFeeDistributor(deployed.feeDist.address));
  await setTx("BondingCurve.setDexLister", () => deployed.bondingCurve.setDexLister(deployed.dexLister.address));
  await setTx("LaunchDAO.setFeeDistributor", () => deployed.launchDao.setFeeDistributor(deployed.feeDist.address));
  await setTx("PerpetualPool.setPlatformTreasury", () => deployed.perpetualPool.setPlatformTreasury(deployed.feeDist.address));
  await setTx("DexLister.setPerpetualPool", () => deployed.dexLister.setPerpetualPool(deployed.perpetualPool.address));
  await setTx("DexLister.setFeeDistributor", () => deployed.dexLister.setFeeDistributor(deployed.feeDist.address));
  await setTx("DexLister.setBuyAndBurnEngine", () => deployed.dexLister.setBuyAndBurnEngine(deployed.burnEngine.address));
  await setTx("DexLister.setCreatorRewardManager", () => deployed.dexLister.setCreatorRewardManager(deployed.creatorRewardMgr.address));
  await setTx("DexLister.setBondingCurve", () => deployed.dexLister.setBondingCurve(deployed.bondingCurve.address));
  await setTx("PriceOracle.authorize(bondingCurve)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.bondingCurve.address, true));
  await setTx("PriceOracle.authorize(perpetualPool)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.perpetualPool.address, true));

  // 保存地址
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log("Key addresses:");
  console.log(`  BondingCurve: ${deployed.bondingCurve.address}`);
  console.log(`  LaunchDAO: ${deployed.launchDao.address}`);
  console.log(`  DexLister: ${deployed.dexLister.address}`);
  console.log(`  WUSDC: ${wusdcAddress}`);
  
  console.log("\nNext: node scripts/diagnose-contracts.mjs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:", error.message);
    process.exit(1);
  });
