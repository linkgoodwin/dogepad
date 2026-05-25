import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const ARC_RPC = "https://rpc.testnet.arc.network";

const existingAddresses = {
  dexRouter: "0x73742278c31a76dBb0D2587d03ef92E6E2141023",
  priceOracle: "0x5EC74d4Bf19fd1482c942CF2Ac8757E09E8b79b5",
  expRateModel: "0xBa4324B0611c46D5E0caEd703242C79d3153630E",
  linRateModel: "0x0Cd6685C8d215386d319c86A47DeE81bEc0DDBe8",
  factory: "0x506957C3c82D449a6FF8Ec4EF23296F49Ca87436",
  perpetualPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
  buyAndBurnEngine: "0xBfEa6640F909D086363B679768F8DCDbb73A2625",
  feeDistributor: "0xa52f1661Ac55D4DfD1D50C7e5451694A8b9B4F80",
  creatorRewardManager: "0x4AE1d700eE004f6A19e5fb6B3B0ADE04470bFeBb",
};

function getArtifact(name) {
  const subdirs = ["core", "periphery", "pool", "dao"];
  for (const dir of subdirs) {
    const p = path.resolve(`./artifacts/contracts/${dir}/${name}.sol/${name}.json`);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(`Artifact not found: ${name}`);
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.providers.JsonRpcProvider({
    url: ARC_RPC,
    timeout: 300000
  });
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(wallet.address)), "USDC");

  const deployOverrides = { gasPrice: ethers.utils.parseUnits('50', 'gwei'), gasLimit: 15_000_000 };
  const txOverrides = { gasPrice: ethers.utils.parseUnits('50', 'gwei'), gasLimit: 3_000_000 };

  async function deploy(name, ...args) {
    const artifact = getArtifact(name);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    console.log(`Deploying ${name}...`);
    const contract = await factory.deploy(...args, deployOverrides);
    console.log(`TX sent, waiting...`);
    await contract.deployed();
    console.log(`✓ ${name}: ${contract.address}`);
    return contract;
  }

  async function tx(label, fn) {
    console.log(`  Sending: ${label}...`);
    const result = await fn();
    await result.wait();
    console.log(`  ✓ ${label}`);
  }

  const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";

  console.log("\n--- Deploying BondingCurve ---");
  const bondingCurve = await deploy("BondingCurve", existingAddresses.dexRouter, existingAddresses.feeDistributor, true, WUSDC);

  console.log("\n--- Deploying LaunchDAO ---");
  const launchDao = await deploy("LaunchDAO", bondingCurve.address, wallet.address);

  console.log("\n--- Wiring BondingCurve ---");
  await tx("setFactory", () => bondingCurve.setFactory(existingAddresses.factory, txOverrides));
  await tx("setPerpetualPool", () => bondingCurve.setPerpetualPool(existingAddresses.perpetualPool, txOverrides));
  await tx("setBuyAndBurnEngine", () => bondingCurve.setBuyAndBurnEngine(existingAddresses.buyAndBurnEngine, txOverrides));
  await tx("setPriceOracle", () => bondingCurve.setPriceOracle(existingAddresses.priceOracle, txOverrides));
  await tx("setLaunchDao", () => bondingCurve.setLaunchDao(launchDao.address, txOverrides));
  await tx("setDaoOnlyLaunch", () => bondingCurve.setDaoOnlyLaunch(true, txOverrides));
  await tx("setCreatorRewardManager", () => bondingCurve.setCreatorRewardManager(existingAddresses.creatorRewardManager, txOverrides));
  await tx("setFeeDistributor", () => bondingCurve.setFeeDistributor(existingAddresses.feeDistributor, txOverrides));

  console.log("\n--- Wiring LaunchDAO ---");
  await tx("setFeeDistributor", () => launchDao.setFeeDistributor(existingAddresses.feeDistributor, txOverrides));

  console.log("\n--- Wiring PerpetualPool ---");
  const perpetualPoolArtifact = getArtifact("PerpetualPool");
  const perpetualPool = new ethers.Contract(existingAddresses.perpetualPool, perpetualPoolArtifact.abi, wallet);
  await tx("setBondingCurve", () => perpetualPool.setBondingCurve(bondingCurve.address, txOverrides));

  console.log("\n--- Wiring PriceOracle ---");
  const oracleArtifact = getArtifact("PriceOracle");
  const oracle = new ethers.Contract(existingAddresses.priceOracle, oracleArtifact.abi, wallet);
  await tx("authorize(bondingCurve)", () => oracle.setAuthorizedUpdater(bondingCurve.address, true, txOverrides));

  console.log("\n--- Updating .env ---");
  const envPath = path.resolve("./.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  const prefix = "VITE_ARC_TESTNET";

  function setEnv(key, value) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  setEnv(`${prefix}_BONDING_CURVE_ADDRESS`, bondingCurve.address);
  setEnv(`${prefix}_LAUNCH_DAO_ADDRESS`, launchDao.address);
  fs.writeFileSync(envPath, envContent);

  console.log("\n========================================");
  console.log("  DONE!");
  console.log("========================================");
  console.log("BondingCurve:", bondingCurve.address);
  console.log("LaunchDAO:", launchDao.address);
}

main().catch(console.error);
