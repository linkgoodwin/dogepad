/**
 * 只重新部署 BondingCurve 合约
 * 使用重新编译后的 bytecode
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
const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = 5042002;
const GAS_PRICE = ethers.utils.parseUnits("25", "gwei");
const DEPLOY_GAS_LIMIT = 10_000_000;

async function waitForConfirm(provider, txHash, label) {
  console.log(`  Waiting for ${label}...`);
  for (let i = 0; i < 240; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        console.log(`  ✓ ${label} confirmed in block ${receipt.blockNumber}`);
        return receipt;
      }
    } catch (e) {}
    if (i % 4 === 0) console.log(`  Still waiting... (${(i + 1) * 15}s / 60min)`);
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
  const provider = new ethers.providers.JsonRpcProvider({ url: ARC_RPC, chainId: ARC_CHAIN_ID });
  const wallet = new ethers.Wallet(pk, provider);
  
  console.log("Deployer:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  // 获取合约 factory
  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/core/BondingCurve.sol/BondingCurve.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("═══════════════════════════════════════════════════");
  console.log("  重新部署 BondingCurve");
  console.log("═══════════════════════════════════════════════════\n");

  // 使用与之前相同的参数部署
  const dexRouter = "0x307E97e90025e5924FD00CD5Af005AC18333a669"; // SimpleRouter
  const feeDistributor = wallet.address; // 临时
  
  console.log("Deploying BondingCurve...");
  console.log("  dexRouter:", dexRouter);
  console.log("  feeDistributor:", feeDistributor);
  console.log("  isXyloRouter: true");
  console.log("  baseAsset:", WUSDC_ARC_TESTNET);
  
  const deployTx = await factory.getDeployTransaction(
    dexRouter,
    feeDistributor,
    true,
    WUSDC_ARC_TESTNET,
    {
      gasPrice: GAS_PRICE,
      gasLimit: DEPLOY_GAS_LIMIT,
    }
  );
  
  const tx = await wallet.sendTransaction(deployTx);
  console.log("  Tx:", tx.hash);
  
  await waitForConfirm(provider, tx.hash, "BondingCurve");
  
  const address = ethers.utils.getContractAddress({
    from: tx.from,
    nonce: tx.nonce
  });
  
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  新 BondingCurve 地址:");
  console.log("  " + address);
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log("⚠️  需要更新以下合约的 BondingCurve 引用:");
  console.log("  - FeeDistributor");
  console.log("  - DexLister");
  console.log("  - LaunchDAO");
  console.log("  - PerpetualPool");
  console.log("\n新地址:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:", error.message);
    process.exit(1);
  });
