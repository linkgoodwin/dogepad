const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const p = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 300000 });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);
  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  console.log("Deployer:", w.address);
  const balance = await p.getBalance(w.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  const bondingCurveAddr = process.env.VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS;
  const feeDistributorAddr = process.env.VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS;
  console.log("BondingCurve:", bondingCurveAddr);
  console.log("FeeDistributor:", feeDistributorAddr);

  const artifact = JSON.parse(fs.readFileSync("artifacts/contracts/dao/LaunchDAO.sol/LaunchDAO.json", "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w);

  let launchDao;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentNonce = await p.getTransactionCount(w.address, "pending");
      console.log(`Deploying LaunchDAO (attempt ${attempt + 1})... nonce=${currentNonce}`);
      const contract = await factory.deploy(bondingCurveAddr, w.address, { gasPrice, gasLimit: 10_000_000, nonce: currentNonce });
      console.log(`  Tx: ${contract.deployTransaction.hash}`);
      console.log(`  Waiting for confirmation...`);
      await contract.deployed(300);
      console.log(`  Address: ${contract.address}`);
      launchDao = contract;
      break;
    } catch (e) {
      if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
        console.log(`  Retry: nonce issue, waiting 15s...`);
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }

  if (!launchDao) throw new Error("Failed to deploy LaunchDAO");

  console.log("\nWiring LaunchDAO...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentNonce = await p.getTransactionCount(w.address, "pending");
      const tx = await launchDao.setFeeDistributor(feeDistributorAddr, { gasPrice, gasLimit: 500_000, nonce: currentNonce });
      console.log(`  setFeeDistributor tx: ${tx.hash}`);
      await tx.wait(1, 300000);
      console.log("  -> setFeeDistributor done");
      break;
    } catch (e) {
      if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
        console.log(`  Retry: nonce issue, waiting 15s...`);
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }

  const bondingCurve = new ethers.Contract(bondingCurveAddr, ["function setLaunchDao(address)"], w);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentNonce = await p.getTransactionCount(w.address, "pending");
      const tx = await bondingCurve.setLaunchDao(launchDao.address, { gasPrice, gasLimit: 500_000, nonce: currentNonce });
      console.log(`  setLaunchDao tx: ${tx.hash}`);
      await tx.wait(1, 300000);
      console.log("  -> setLaunchDao done");
      break;
    } catch (e) {
      if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
        console.log(`  Retry: nonce issue, waiting 15s...`);
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }

  console.log("\nUpdating .env...");
  const envPath = ".env";
  let envContent = fs.readFileSync(envPath, "utf8");
  const regex = /^VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=.*$/m;
  envContent = envContent.replace(regex, `VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${launchDao.address}`);
  fs.writeFileSync(envPath, envContent);
  console.log(`  VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${launchDao.address}`);

  console.log("\nDone! LaunchDAO deployed and wired.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
