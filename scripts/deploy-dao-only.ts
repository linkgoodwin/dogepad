import { network } from "hardhat";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    console.error("\nERROR: DEPLOYER_PRIVATE_KEY not set in .env");
    console.error("Please add your deployer private key to .env:");
    console.error("  DEPLOYER_PRIVATE_KEY=0x_your_private_key_here\n");
    process.exit(1);
  }

  const conn = await network.create();
  const provider = new ethers.providers.Web3Provider(conn.provider);
  const wallet = new ethers.Wallet(pk, provider);
  const deployerAddress = wallet.address;

  const networkInfo = await provider.getNetwork();
  const chainId = networkInfo.chainId;
  const isMainnet = chainId === 56;

  console.log("========================================");
  console.log("  Deploy LaunchDAO Only (Subscribe + Lossless Stake)");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), "BNB");
  console.log("Chain ID:", chainId);
  console.log("");

  const bondingCurveAddr = process.env.VITE_BONDING_CURVE_ADDRESS || "";
  const feeDistributorAddr = process.env.VITE_FEE_DISTRIBUTOR_ADDRESS || "";

  if (!bondingCurveAddr || bondingCurveAddr === ethers.constants.AddressZero) {
    console.error("ERROR: VITE_BONDING_CURVE_ADDRESS not set in .env");
    process.exit(1);
  }
  if (!feeDistributorAddr || feeDistributorAddr === ethers.constants.AddressZero) {
    console.error("ERROR: VITE_FEE_DISTRIBUTOR_ADDRESS not set in .env");
    process.exit(1);
  }

  console.log("BondingCurve:", bondingCurveAddr);
  console.log("FeeDistributor:", feeDistributorAddr);
  console.log("");

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

  console.log("Deploying LaunchDAO...");
  const LaunchDAO = getFactory("LaunchDAO");
  const launchDao = await LaunchDAO.deploy(bondingCurveAddr, feeDistributorAddr);
  await launchDao.deployed();
  const launchDaoAddr = launchDao.address;
  console.log("LaunchDAO deployed:", launchDaoAddr);

  console.log("\nUpdating BondingCurve.launchDao...");
  const bondingCurveArtifact = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../artifacts/contracts/core/BondingCurve.sol/BondingCurve.json"), "utf8"
  ));
  const bondingCurve = new ethers.Contract(bondingCurveAddr, bondingCurveArtifact.abi, wallet);

  const tx1 = await bondingCurve.setLaunchDao(launchDaoAddr);
  await tx1.wait();
  console.log("  -> BondingCurve.launchDao updated:", launchDaoAddr);

  const daoOnlyLaunch = await bondingCurve.daoOnlyLaunch();
  if (!daoOnlyLaunch) {
    console.log("Enabling daoOnlyLaunch...");
    const tx2 = await bondingCurve.setDaoOnlyLaunch(true);
    await tx2.wait();
    console.log("  -> daoOnlyLaunch enabled");
  }

  console.log("\nWriting address to .env ...");
  const prefix = isMainnet ? "VITE_MAINNET" : "VITE_TESTNET";
  setEnvValue(`${prefix}_LAUNCH_DAO_ADDRESS`, launchDaoAddr);
  setEnvValue("VITE_LAUNCH_DAO_ADDRESS", launchDaoAddr);
  console.log("Done! Address saved to .env");

  console.log("\n========================================");
  console.log("  LaunchDAO DEPLOYED SUCCESSFULLY");
  console.log("========================================");
  console.log("  Address:", launchDaoAddr);
  console.log("  Network:", isMainnet ? "MAINNET" : "TESTNET");
  console.log("");

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
