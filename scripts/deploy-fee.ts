import { ethers, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "USDC");
  console.log("");

  const existingAddresses = {
    dogeToken: "0x3fa820C7b7f2337E572f77D5381Bc3a5A3AaD0C3",
    dexRouter: "0x73742278c31a76dBb0D2587d03ef92E6E2141023",
    buyAndBurnEngine: "0xBfEa6640F909D086363B679768F8DCDbb73A2625",
    wrappedNative: "0x0000000000000000000000000000000000000000",
    longPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
  };

  console.log("Deploying FeeDistributor...");
  const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
  const feeDistributor = await FeeDistributor.deploy(
    existingAddresses.dogeToken,
    existingAddresses.dexRouter,
    existingAddresses.buyAndBurnEngine,
    existingAddresses.wrappedNative,
    existingAddresses.longPool
  );
  await feeDistributor.deployed();
  console.log("✓ FeeDistributor deployed at:", feeDistributor.address);
  console.log("");

  console.log("Updating BondingCurve...");
  const bondingCurve = await ethers.getContractAt("BondingCurve", "0xFc6da38B132b48d8FCe1502C3868d389BeC71cBe");
  await bondingCurve.setFeeDistributor(feeDistributor.address);
  console.log("✓ BondingCurve updated");

  console.log("Updating LaunchDAO...");
  const launchDao = await ethers.getContractAt("LaunchDAO", "0xb5e49D1cF38B3abeE2bA34e3661Da20C1aC506d3");
  await launchDao.setFeeDistributor(feeDistributor.address);
  console.log("✓ LaunchDAO updated");

  console.log("");
  console.log("========================================");
  console.log("  Deployment Complete!");
  console.log("========================================");
  console.log("");
  console.log("New FeeDistributor Address:", feeDistributor.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
