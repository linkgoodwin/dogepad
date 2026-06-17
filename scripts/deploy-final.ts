/**
 * DogePad Arc Testnet 部署脚本 - 极端优化版
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
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";

const ARC_RPC = "https://arc-testnet.drpc.org";

// 更高的 gas 价格以加快确认
const GAS_PRICE = ethers.utils.parseUnits("10", "gwei"); // 10 Gwei
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

async function waitForConfirm(provider: ethers.providers.JsonRpcProvider, txHash: string, label: string) {
  console.log(`  Waiting for ${label}...`);
  // 等待最多 30 分钟
  for (let i = 0; i < 120; i++) { // 120 * 15秒 = 30分钟
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        console.log(`  ✓ ${label} confirmed in block ${receipt.blockNumber}`);
        return receipt;
      }
    } catch (e) {}
    console.log(`  Still waiting... (${(i + 1) * 15}s / 30min)`);
    await new Promise(r => setTimeout(r, 15000));
  }
  throw new Error(`${label} confirmation timeout`);
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
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

  const deployed: Record<string, any> = {};

  async function deploy(name: string, ...args: any[]) {
    console.log(`Deploying ${name}...`);
    const factory = getFactory(name);
    try {
      const deployTx = await factory.getDeployTransaction(...args, {
        gasPrice: GAS_PRICE,
        gasLimit: DEPLOY_GAS_LIMIT,
      });
      const tx = await wallet.sendTransaction(deployTx);
      console.log(`  Tx: ${tx.hash}`);
      await waitForConfirm(provider, tx.hash, name);
      const address = ethers.utils.getContractAddress({
        from: tx.from,
        nonce: tx.nonce
      });
      console.log(`  ✓ ${name}: ${address}\n`);
      return new ethers.Contract(address, factory.interface, wallet);
    } catch (e: any) {
      console.error(`  ✗ ${name} failed: ${e.message}`);
      throw e;
    }
  }

  async function setTx(label: string, fn: () => any) {
    console.log(`Setting ${label}...`);
    try {
      const tx = await fn();
      console.log(`  Tx: ${tx.hash}`);
      await waitForConfirm(provider, tx.hash, label);
      console.log(`  ✓ ${label}\n`);
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

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 2: Core Contracts");
  console.log("═══════════════════════════════════════════════════");

  deployed.simpleFactory = await deploy("SimpleFactory");
  deployed.simpleRouter = await deploy("SimpleRouter", deployed.simpleFactory.address, WUSDC_ARC_TESTNET);
  
  const DEX_ROUTER = deployed.simpleRouter.address;
  
  deployed.bondingCurve = await deploy("BondingCurve", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);
  deployed.factory = await deploy("BondingCurveFactory", deployed.bondingCurve.address);

  await setTx("BondingCurve.setFactory", () => deployed.bondingCurve.setFactory(deployed.factory.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 3: BuyAndBurn + DexLister");
  console.log("═══════════════════════════════════════════════════");

  deployed.burnEngine = await deploy("BuyAndBurnEngine", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);
  deployed.dexLister = await deploy("DexLister", DEX_ROUTER, wallet.address, true, WUSDC_ARC_TESTNET);

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 4: PerpetualPool");
  console.log("═══════════════════════════════════════════════════");

  deployed.perpetualPool = await deploy("PerpetualPool", deployed.priceOracle.address, deployed.burnEngine.address, wallet.address);

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 5: FeeDistributor");
  console.log("═══════════════════════════════════════════════════");

  deployed.feeDist = await deploy("FeeDistributor", CORRECT_DOGE_TOKEN, DEX_ROUTER, deployed.burnEngine.address, ethers.constants.AddressZero, deployed.perpetualPool.address);

  await setTx("BondingCurve.setPerpetualPool", () => deployed.bondingCurve.setPerpetualPool(deployed.perpetualPool.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("BondingCurve.setBuyAndBurnEngine", () => deployed.bondingCurve.setBuyAndBurnEngine(deployed.burnEngine.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("BondingCurve.setPriceOracle", () => deployed.bondingCurve.setPriceOracle(deployed.priceOracle.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("PerpetualPool.setBondingCurve", () => deployed.perpetualPool.setBondingCurve(deployed.bondingCurve.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("PerpetualPool.setDexLister", () => deployed.perpetualPool.setDexLister(deployed.dexLister.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 6: LaunchDAO");
  console.log("═══════════════════════════════════════════════════");

  deployed.launchDao = await deploy("LaunchDAO", deployed.bondingCurve.address, wallet.address);

  await setTx("BondingCurve.setLaunchDao", () => deployed.bondingCurve.setLaunchDao(deployed.launchDao.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("BondingCurve.setDaoOnlyLaunch", () => deployed.bondingCurve.setDaoOnlyLaunch(true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 7: CreatorRewardManager");
  console.log("═══════════════════════════════════════════════════");

  deployed.creatorRewardMgr = await deploy("CreatorRewardManager", deployed.bondingCurve.address);
  await setTx("BondingCurve.setCreatorRewardManager", () => deployed.bondingCurve.setCreatorRewardManager(deployed.creatorRewardMgr.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  console.log("═══════════════════════════════════════════════════");
  console.log("  PHASE 8: Final Wiring");
  console.log("═══════════════════════════════════════════════════");

  await setTx("BondingCurve.setFeeDistributor", () => deployed.bondingCurve.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("BondingCurve.setDexLister", () => deployed.bondingCurve.setDexLister(deployed.dexLister.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("LaunchDAO.setFeeDistributor", () => deployed.launchDao.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("PerpetualPool.setPlatformTreasury", () => deployed.perpetualPool.setPlatformTreasury(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("DexLister.setPerpetualPool", () => deployed.dexLister.setPerpetualPool(deployed.perpetualPool.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("DexLister.setFeeDistributor", () => deployed.dexLister.setFeeDistributor(deployed.feeDist.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("DexLister.setBuyAndBurnEngine", () => deployed.dexLister.setBuyAndBurnEngine(deployed.burnEngine.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("DexLister.setCreatorRewardManager", () => deployed.dexLister.setCreatorRewardManager(deployed.creatorRewardMgr.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("DexLister.setBondingCurve", () => deployed.dexLister.setBondingCurve(deployed.bondingCurve.address, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("PriceOracle.authorize(bondingCurve)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.bondingCurve.address, true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));
  await setTx("PriceOracle.authorize(perpetualPool)", () => deployed.priceOracle.setAuthorizedUpdater(deployed.perpetualPool.address, true, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE }));

  // 保存地址
  console.log("═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log("Key addresses:");
  console.log(`  BondingCurve: ${deployed.bondingCurve.address}`);
  console.log(`  LaunchDAO: ${deployed.launchDao.address}`);
  console.log(`  DexLister: ${deployed.dexLister.address}`);
  
  console.log("\nNext: node scripts/diagnose-contracts.mjs");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:", error.message);
    process.exit(1);
  });
