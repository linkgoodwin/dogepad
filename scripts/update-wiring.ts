/**
 * 更新所有合约的 BondingCurve 引用
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

const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = 5042002;
const GAS_PRICE = ethers.utils.parseUnits("25", "gwei");
const TX_GAS_LIMIT = 500000;

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

  const provider = new ethers.providers.JsonRpcProvider({ url: ARC_RPC, chainId: ARC_CHAIN_ID });
  const wallet = new ethers.Wallet(pk, provider);
  
  console.log("Deployer:", wallet.address);

  // 新的 BondingCurve 地址（刚从 redeploy-bondingcurve.ts 获得）
  const NEW_BC = "0xe38C20F127728823102295C288C2Ac9C1223F37b";
  
  // 其他已部署合约地址
  const contracts = {
    bondingCurve: NEW_BC, // 更新为新地址
    factory: "0xD55DE12D8dF9c2DBD28C9B472df8BA3D88AAd379",
    burnEngine: "0x2940F9B412A4817f3c4327EaB0016a74112E9102",
    dexLister: "0x9E8cE555C8ad970D385E743b92Bf321Cd7053B79",
    perpetualPool: "0x6538Ee7C326347b01Dc37db3eBa2c037ad8B1778",
    feeDist: "0x447ac9048637f8A0a3f30E1b29Cf84cFBc62e5b0",
    launchDao: "0x4aA53a4e95ff30d9395342F8d111858Cf2704AAA",
    creatorRewardMgr: "0xBad4691B5DCd50bC023295B448ae4952425bA894",
    priceOracle: "0xbCeC9B5bE183efeC684dfCB53642cCbF4398050c",
  };

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  更新合约 Wiring");
  console.log("═══════════════════════════════════════════════════\n");

  async function setTx(label, contract, fn, ...args) {
    console.log(`Setting ${label}...`);
    try {
      const tx = await contract[fn](...args, { gasLimit: TX_GAS_LIMIT, gasPrice: GAS_PRICE });
      console.log(`  Tx: ${tx.hash}`);
      await waitForConfirm(provider, tx.hash, label);
      console.log(`  ✓ ${label}\n`);
    } catch (e: any) {
      console.error(`  ✗ ${label} failed: ${e.message}`);
      throw e;
    }
  }

  // 读取 artifact
  const bcArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/core/BondingCurve.sol/BondingCurve.json"), "utf8"));
  const bc = new ethers.Contract(contracts.bondingCurve, bcArtifact.abi, wallet);

  const daoArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/dao/LaunchDAO.sol/LaunchDAO.json"), "utf8"));
  const dao = new ethers.Contract(contracts.launchDao, daoArtifact.abi, wallet);

  const dexArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/periphery/DexLister.sol/DexLister.json"), "utf8"));
  const dex = new ethers.Contract(contracts.dexLister, dexArtifact.abi, wallet);

  const poolArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/pool/PerpetualPool.sol/PerpetualPool.json"), "utf8"));
  const pool = new ethers.Contract(contracts.perpetualPool, poolArtifact.abi, wallet);

  // BondingCurve 需要设置所有依赖
  console.log("--- BondingCurve ---");
  await setTx("setFactory", bc, "setFactory", contracts.factory);
  await setTx("setLaunchDao", bc, "setLaunchDao", contracts.launchDao);
  await setTx("setPerpetualPool", bc, "setPerpetualPool", contracts.perpetualPool);
  await setTx("setBuyAndBurnEngine", bc, "setBuyAndBurnEngine", contracts.burnEngine);
  await setTx("setPriceOracle", bc, "setPriceOracle", contracts.priceOracle);
  await setTx("setFeeDistributor", bc, "setFeeDistributor", contracts.feeDist);
  await setTx("setDexLister", bc, "setDexLister", contracts.dexLister);
  await setTx("setCreatorRewardManager", bc, "setCreatorRewardManager", contracts.creatorRewardMgr);
  await setTx("setDaoOnlyLaunch", bc, "setDaoOnlyLaunch", true);

  // LaunchDAO 需要设置 bondingCurve 和 feeDistributor
  console.log("--- LaunchDAO ---");
  // 检查 LaunchDAO 是否有 setBondingCurve 函数
  const daoIface = dao.interface;
  if (daoIface.functions['setBondingCurve']) {
    await setTx("LaunchDAO.setBondingCurve", dao, "setBondingCurve", contracts.bondingCurve);
  }
  await setTx("LaunchDAO.setFeeDistributor", dao, "setFeeDistributor", contracts.feeDist);

  // PerpetualPool 需要设置 bondingCurve 和 dexLister
  console.log("--- PerpetualPool ---");
  await setTx("PerpetualPool.setBondingCurve", pool, "setBondingCurve", contracts.bondingCurve);
  await setTx("PerpetualPool.setDexLister", pool, "setDexLister", contracts.dexLister);
  await setTx("PerpetualPool.setPlatformTreasury", pool, "setPlatformTreasury", contracts.feeDist);

  // DexLister 需要设置 bondingCurve
  console.log("--- DexLister ---");
  await setTx("DexLister.setBondingCurve", dex, "setBondingCurve", contracts.bondingCurve);
  await setTx("DexLister.setPerpetualPool", dex, "setPerpetualPool", contracts.perpetualPool);
  await setTx("DexLister.setFeeDistributor", dex, "setFeeDistributor", contracts.feeDist);
  await setTx("DexLister.setBuyAndBurnEngine", dex, "setBuyAndBurnEngine", contracts.burnEngine);
  await setTx("DexLister.setCreatorRewardManager", dex, "setCreatorRewardManager", contracts.creatorRewardMgr);

  // PriceOracle 需要授权 bondingCurve
  console.log("--- PriceOracle ---");
  const oracleArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/periphery/PriceOracle.sol/PriceOracle.json"), "utf8"));
  const oracle = new ethers.Contract(contracts.priceOracle, oracleArtifact.abi, wallet);
  await setTx("PriceOracle.authorize(bondingCurve)", oracle, "setAuthorizedUpdater", contracts.bondingCurve, true);
  await setTx("PriceOracle.authorize(perpetualPool)", oracle, "setAuthorizedUpdater", contracts.perpetualPool, true);

  console.log("═══════════════════════════════════════════════════");
  console.log("  Wiring 更新完成！");
  console.log("═══════════════════════════════════════════════════\n");
  
  console.log("关键地址:");
  console.log(`  BondingCurve: ${contracts.bondingCurve}`);
  console.log(`  LaunchDAO: ${contracts.launchDao}`);
  console.log(`  DexLister: ${contracts.dexLister}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nWIRING FAILED:", error.message);
    process.exit(1);
  });
