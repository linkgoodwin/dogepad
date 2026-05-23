const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const XYLO_ROUTER = "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

const EXISTING = {
  factory: "0x506957C3c82D449a6FF8Ec4EF23296F49Ca87436",
  longPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
  shortPool: "0x6Bcb9A91c9328307868B268c9b7207f293b086DA",
  buyAndBurnEngine: "0xBfEa6640F909D086363B679768F8DCDbb73A2625",
  feeDistributor: "0xa52f1661Ac55D4DfD1D50C7e5451694A8b9B4F80",
  priceOracle: "0x5EC74d4Bf19fd1482c942CF2Ac8757E09E8b79b5",
  creatorRewardManager: "0x4AE1d700eE004f6A19e5fb6B3B0ADE04470bFeBb",
};

function getArtifact(name) {
  const subdirs = ["core", "periphery", "pool", "dao"];
  for (const dir of subdirs) {
    const p = `artifacts/contracts/${dir}/${name}.sol/${name}.json`;
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(`Artifact not found for ${name}`);
}

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

  async function deploy(name, args = [], gasLimit = 10_000_000) {
    const artifact = getArtifact(name);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w);
    console.log(`Deploying ${name}... (gasLimit: ${gasLimit})`);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const currentNonce = await p.getTransactionCount(w.address, "pending");
        const contract = await factory.deploy(...args, { gasPrice, gasLimit, nonce: currentNonce });
        console.log(`  Tx: ${contract.deployTransaction.hash}`);
        console.log(`  Waiting for confirmation...`);
        await contract.deployed(300);
        console.log(`  Address: ${contract.address}`);
        return contract;
      } catch (e) {
        if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
          console.log(`  Retry ${attempt + 1}: nonce issue, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Failed to deploy ${name} after 3 attempts`);
  }

  async function sendTx(contract, method, args, label) {
    console.log(`  Sending ${label}...`);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const currentNonce = await p.getTransactionCount(w.address, "pending");
        const tx = await contract[method](...args, { gasPrice, gasLimit: 1_000_000, nonce: currentNonce });
        console.log(`  Tx: ${tx.hash}`);
        console.log(`  Waiting for confirmation...`);
        await tx.wait(1, 300000);
        console.log(`  -> ${label} done`);
        return;
      } catch (e) {
        if (e.message && (e.message.includes("already known") || e.message.includes("nonce"))) {
          console.log(`  Retry ${attempt + 1}: nonce issue, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Failed to send ${label} after 3 attempts`);
  }

  console.log("\n--- Phase 1: Deploy DexLister ---");
  const dexLister = await deploy("DexLister", [XYLO_ROUTER, EXISTING.feeDistributor, true, WUSDC], 5_000_000);

  console.log("\n--- Phase 2: Deploy new BondingCurve ---");
  const bondingCurve = await deploy("BondingCurve", [XYLO_ROUTER, EXISTING.feeDistributor, true, WUSDC], 10_000_000);

  console.log("\n--- Phase 3: Deploy new LaunchDAO ---");
  const launchDao = await deploy("LaunchDAO", [bondingCurve.address, w.address], 10_000_000);

  console.log("\n--- Phase 4: Wire BondingCurve ---");
  await sendTx(bondingCurve, "setFactory", [EXISTING.factory], "setFactory");
  await sendTx(bondingCurve, "setLaunchDao", [launchDao.address], "setLaunchDao");
  await sendTx(bondingCurve, "setPools", [EXISTING.longPool, EXISTING.shortPool], "setPools");
  await sendTx(bondingCurve, "setBuyAndBurnEngine", [EXISTING.buyAndBurnEngine], "setBuyAndBurnEngine");
  await sendTx(bondingCurve, "setPriceOracle", [EXISTING.priceOracle], "setPriceOracle");
  await sendTx(bondingCurve, "setCreatorRewardManager", [EXISTING.creatorRewardManager], "setCreatorRewardManager");
  await sendTx(bondingCurve, "setDaoOnlyLaunch", [true], "setDaoOnlyLaunch");
  await sendTx(bondingCurve, "setDexLister", [dexLister.address], "setDexLister");

  console.log("\n--- Phase 5: Wire DexLister ---");
  await sendTx(dexLister, "setPools", [EXISTING.longPool, EXISTING.shortPool], "DexLister.setPools");
  await sendTx(dexLister, "setBuyAndBurnEngine", [EXISTING.buyAndBurnEngine], "DexLister.setBuyAndBurnEngine");
  await sendTx(dexLister, "setCreatorRewardManager", [EXISTING.creatorRewardManager], "DexLister.setCreatorRewardManager");

  console.log("\n--- Phase 6: Wire LaunchDAO ---");
  await sendTx(launchDao, "setFeeDistributor", [EXISTING.feeDistributor], "LaunchDAO.setFeeDistributor");

  console.log("\n--- Phase 7: Update other contracts ---");
  const longPoolArtifact = getArtifact("LongPool");
  const longPool = new ethers.Contract(EXISTING.longPool, longPoolArtifact.abi, w);
  await sendTx(longPool, "setBondingCurve", [bondingCurve.address], "LongPool.setBondingCurve");

  const shortPoolArtifact = getArtifact("ShortPool");
  const shortPool = new ethers.Contract(EXISTING.shortPool, shortPoolArtifact.abi, w);
  await sendTx(shortPool, "setBondingCurve", [bondingCurve.address], "ShortPool.setBondingCurve");

  const burnArtifact = getArtifact("BuyAndBurnEngine");
  const burnEngine = new ethers.Contract(EXISTING.buyAndBurnEngine, burnArtifact.abi, w);
  await sendTx(burnEngine, "setBondingCurve", [bondingCurve.address], "BuyAndBurnEngine.setBondingCurve");

  const priceOracleArtifact = getArtifact("PriceOracle");
  const priceOracle = new ethers.Contract(EXISTING.priceOracle, priceOracleArtifact.abi, w);
  await sendTx(priceOracle, "setAuthorizedUpdater", [bondingCurve.address, true], "PriceOracle: bondingCurve");

  const creatorArtifact = getArtifact("CreatorRewardManager");
  const creatorMgr = new ethers.Contract(EXISTING.creatorRewardManager, creatorArtifact.abi, w);
  await sendTx(creatorMgr, "setBondingCurve", [bondingCurve.address], "CreatorRewardManager.setBondingCurve");

  const factoryArtifact = getArtifact("BondingCurveFactory");
  const factoryContract = new ethers.Contract(EXISTING.factory, factoryArtifact.abi, w);
  await sendTx(factoryContract, "setBondingCurve", [bondingCurve.address], "Factory.setBondingCurve");

  console.log("\n========================================");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("========================================\n");

  const addresses = {
    bondingCurve: bondingCurve.address,
    launchDao: launchDao.address,
    dexLister: dexLister.address,
  };

  console.log(JSON.stringify(addresses, null, 2));

  function setEnvValue(key, value) {
    const envPath = ".env";
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, envContent);
  }

  setEnvValue("VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS", bondingCurve.address);
  setEnvValue("VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS", launchDao.address);
  setEnvValue("VITE_ARC_TESTNET_DEX_LISTER_ADDRESS", dexLister.address);
  console.log("Addresses saved to .env");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
