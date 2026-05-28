const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function sendTx(signer, fn, label, gasLimit = 500_000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentNonce = await signer.provider.getTransactionCount(signer.address, "pending");
      const tx = await fn({ gasLimit, nonce: currentNonce, gasPrice: ethers.utils.parseUnits("100", "gwei") });
      console.log(`  ${label} tx: ${tx.hash}`);
      await tx.wait(1, 300000);
      console.log(`  -> ${label} done`);
      return tx;
    } catch (e) {
      if (e.message && (e.message.includes("already known") || e.message.includes("nonce") || e.message.includes("replacement"))) {
        console.log(`  Retry ${label}: nonce issue, waiting 15s...`);
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to ${label} after 3 attempts`);
}

async function deployContract(factory, signer, label, gasLimit = 10_000_000) {
  return deployContractWithArgs(factory, [], signer, label, gasLimit);
}

async function deployContractWithArgs(factory, args, signer, label, gasLimit = 10_000_000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const currentNonce = await signer.provider.getTransactionCount(signer.address, "pending");
      console.log(`Deploying ${label} (attempt ${attempt + 1})... nonce=${currentNonce}`);
      const contract = await factory.deploy(...args, { gasLimit, nonce: currentNonce, gasPrice: ethers.utils.parseUnits("100", "gwei") });
      console.log(`  Tx: ${contract.deployTransaction.hash}`);
      console.log(`  Waiting for confirmation...`);
      await contract.deployed(300);
      console.log(`  Address: ${contract.address}`);
      return contract;
    } catch (e) {
      if (e.message && (e.message.includes("already known") || e.message.includes("nonce") || e.message.includes("replacement"))) {
        console.log(`  Retry: nonce issue, waiting 15s...`);
        await sleep(15000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to deploy ${label} after 3 attempts`);
}

async function main() {
  const p = new ethers.providers.JsonRpcProvider({ url: RPC_URL, timeout: 300000 });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);

  console.log("Deployer:", w.address);
  const balance = await p.getBalance(w.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "ARC");

  const bondingCurveAddr = process.env.VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS;
  const feeDistributorAddr = process.env.VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS;
  const priceOracleAddr = process.env.VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS;
  const buyAndBurnAddr = process.env.VITE_ARC_TESTNET_BUY_AND_BURN_ADDRESS;
  const dexListerAddr = process.env.VITE_ARC_TESTNET_DEX_LISTER_ADDRESS;
  const platformTreasury = w.address;

  console.log("\n=== Deploying LaunchDAO ===");
  const daoArtifact = JSON.parse(fs.readFileSync("artifacts/contracts/dao/LaunchDAO.sol/LaunchDAO.json", "utf8"));
  const daoFactory = new ethers.ContractFactory(daoArtifact.abi, daoArtifact.bytecode, w);
  const daoConstructorArgs = [bondingCurveAddr, feeDistributorAddr];
  const launchDao = await deployContractWithArgs(daoFactory, daoConstructorArgs, w, "LaunchDAO");
  const newDaoAddr = launchDao.address;

  console.log("\nWiring LaunchDAO...");
  await sendTx(w, (opts) => launchDao.setFeeDistributor(feeDistributorAddr, opts), "setFeeDistributor");

  const bondingCurve = new ethers.Contract(bondingCurveAddr, ["function setLaunchDao(address)", "function launchDao() view returns (address)"], w);
  await sendTx(w, (opts) => bondingCurve.setLaunchDao(newDaoAddr, opts), "setLaunchDao on BondingCurve");

  console.log("\n=== Deploying PerpetualPool ===");
  const perpArtifact = JSON.parse(fs.readFileSync("artifacts/contracts/pool/PerpetualPool.sol/PerpetualPool.json", "utf8"));
  const perpFactory = new ethers.ContractFactory(perpArtifact.abi, perpArtifact.bytecode, w);
  const perpConstructorArgs = [priceOracleAddr, buyAndBurnAddr, platformTreasury];
  const perpPool = await deployContractWithArgs(perpFactory, perpConstructorArgs, w, "PerpetualPool");
  const newPerpAddr = perpPool.address;

  console.log("\nWiring PerpetualPool...");
  await sendTx(w, (opts) => perpPool.setOracle(priceOracleAddr, opts), "setOracle");
  await sendTx(w, (opts) => perpPool.setBondingCurve(bondingCurveAddr, opts), "setBondingCurve");
  await sendTx(w, (opts) => perpPool.setBurnEngine(buyAndBurnAddr, opts), "setBurnEngine");
  await sendTx(w, (opts) => perpPool.setDexLister(dexListerAddr, opts), "setDexLister");
  await sendTx(w, (opts) => perpPool.setPlatformTreasury(platformTreasury, opts), "setPlatformTreasury");

  const dogeTokenAddr = await launchDao.dogeToken();
  if (dogeTokenAddr !== ethers.constants.AddressZero) {
    console.log(`\nListing DOGE token (${dogeTokenAddr}) for perp trading...`);
    await sendTx(w, (opts) => perpPool.listTokenForPerp(dogeTokenAddr, opts), "listTokenForPerp(DOGE)");
    await sendTx(w, (opts) => perpPool.setDefaultToken(dogeTokenAddr, opts), "setDefaultToken(DOGE)");
  }

  console.log("\n=== Updating .env ===");
  const envPath = ".env";
  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = envContent.replace(
    /^VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=.*$/m,
    `VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${newDaoAddr}`
  );
  envContent = envContent.replace(
    /^VITE_ARC_TESTNET_PERPETUAL_POOL_ADDRESS=.*$/m,
    `VITE_ARC_TESTNET_PERPETUAL_POOL_ADDRESS=${newPerpAddr}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log(`  LAUNCH_DAO_ADDRESS=${newDaoAddr}`);
  console.log(`  PERPETUAL_POOL_ADDRESS=${newPerpAddr}`);

  console.log("\n=== Deployment Complete ===");
  console.log("New LaunchDAO:", newDaoAddr);
  console.log("New PerpetualPool:", newPerpAddr);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
