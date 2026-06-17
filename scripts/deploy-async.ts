/**
 * DogePad 异步部署脚本
 * 不等待完整确认，快速部署
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

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

const WUSDC_ARC_TESTNET = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ARC_RPC = "https://arc-testnet.drpc.org";
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";

const GAS_PRICE = ethers.utils.parseUnits("1", "gwei");
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

async function waitForTx(provider: ethers.providers.JsonRpcProvider, txHash: string, timeout = 600000) {
  console.log(`  Waiting for ${txHash.slice(0, 20)}...`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
      return receipt;
    }
    await new Promise(r => setTimeout(r, 15000)); // Check every 15 seconds
  }
  throw new Error(`Transaction ${txHash} not confirmed in ${timeout}ms`);
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
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

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
      // Send transaction without waiting
      const deployTx = await factory.getDeployTransaction(...args, {
        gasLimit: DEPLOY_GAS_LIMIT,
        gasPrice: GAS_PRICE,
      });
      
      const tx = await wallet.sendTransaction(deployTx);
      console.log(`  Tx: ${tx.hash}`);
      
      // Wait for confirmation with polling
      const receipt = await waitForTx(provider, tx.hash, 600000);
      
      // Get contract address from receipt
      const address = ethers.utils.getContractAddress({
        from: tx.from,
        nonce: tx.nonce
      });
      
      console.log(`  ✓ ${name}: ${address}`);
      
      // Create contract instance
      const contract = new ethers.Contract(address, factory.interface, wallet);
      return contract;
    } catch (e: any) {
      console.error(`  ✗ ${name} failed: ${e.message}`);
      throw e;
    }
  }

  async function sendTx(label: string, fn: () => any) {
    console.log(`  Setting ${label}...`);
    try {
      const tx = await fn();
      console.log(`  Tx: ${tx.hash}`);
      await waitForTx(provider, tx.hash, 300000);
      console.log(`  ✓ ${label}`);
    } catch (e: any) {
      console.error(`  ✗ ${label} failed: ${e.message}`);
      throw e;
    }
  }

  const deployed: Record<string, any> = {};

  console.log("═══════════════════════════════════════════════════");
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

  await sendTx("BondingCurve.setFactory", () => deployed.bondingCurve.setFactory(deployed.factory.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

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

  await sendTx("BondingCurve.setPerpetualPool", () => deployed.bondingCurve.setPerpetualPool(deployed.perpetualPool.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("BondingCurve.setBuyAndBurnEngine", () => deployed.bondingCurve.setBuyAndBurnEngine(deployed.burnEngine.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("BondingCurve.setPriceOracle", () => deployed.bondingCurve.setPriceOracle(deployed.priceOracle.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  await sendTx("PerpetualPool.setBondingCurve", () => deployed.perpetualPool.setBondingCurve(deployed.bondingCurve.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("PerpetualPool.setDexLister", () => deployed.perpetualPool.setDexLister(deployed.dexLister.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 6: LaunchDAO");
  console.log("═══════════════════════════════════════════════════");

  deployed.launchDao = await deploy("LaunchDAO", deployed.bondingCurve.address, wallet.address);

  await sendTx("BondingCurve.setLaunchDao", () => deployed.bondingCurve.setLaunchDao(deployed.launchDao.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("BondingCurve.setDaoOnlyLaunch", () => deployed.bondingCurve.setDaoOnlyLaunch(true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 7: CreatorRewardManager");
  console.log("═══════════════════════════════════════════════════");

  deployed.creatorRewardMgr = await deploy("CreatorRewardManager", deployed.bondingCurve.address);

  await sendTx("BondingCurve.setCreatorRewardManager", () => deployed.bondingCurve.setCreatorRewardManager(deployed.creatorRewardMgr.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Phase 8: Final Wiring");
  console.log("═══════════════════════════════════════════════════");

  await sendTx("BondingCurve.setFeeDistributor", () => deployed.bondingCurve.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("BondingCurve.setDexLister", () => deployed.bondingCurve.setDexLister(deployed.dexLister.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("LaunchDAO.setFeeDistributor", () => deployed.launchDao.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("PerpetualPool.setPlatformTreasury", () => deployed.perpetualPool.setPlatformTreasury(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  await sendTx("DexLister.setPerpetualPool", () => deployed.dexLister.setPerpetualPool(deployed.perpetualPool.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("DexLister.setFeeDistributor", () => deployed.dexLister.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("DexLister.setBuyAndBurnEngine", () => deployed.dexLister.setBuyAndBurnEngine(deployed.burnEngine.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("DexLister.setCreatorRewardManager", () => deployed.dexLister.setCreatorRewardManager(deployed.creatorRewardMgr.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("DexLister.setBondingCurve", () => deployed.dexLister.setBondingCurve(deployed.bondingCurve.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  await sendTx("PriceOracle.authorize(bondingCurve)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.bondingCurve.address, true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await sendTx("PriceOracle.authorize(perpetualPool)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.perpetualPool.address, true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

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
  
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log(JSON.stringify({
    bondingCurve: deployed.bondingCurve.address,
    launchDao: deployed.launchDao.address,
    dexLister: deployed.dexLister.address,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
