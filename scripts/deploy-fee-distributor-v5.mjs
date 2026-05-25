const ethers = require("ethers");
const fs = require("fs");
const path = require("path");

const ARC_RPC = "https://rpc.testnet.arc.network";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("\nERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const deployerAddress = wallet.address;

  console.log("========================================");
  console.log("  Deploying New FeeDistributor");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), "USDC");
  console.log("");

  const artifactPath = path.resolve(__dirname, "../artifacts/contracts/periphery/FeeDistributor.sol/FeeDistributor.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("ERROR: Artifact not found. Run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  const existingAddresses = {
    dogeToken: "0x3fa820C7b7f2337E572f77D5381Bc3a5A3AaD0C3",
    dexRouter: "0x73742278c31a76dBb0D2587d03ef92E6E2141023",
    buyAndBurnEngine: "0xBfEa6640F909D086363B679768F8DCDbb73A2625",
    wrappedNative: "0x0000000000000000000000000000000000000000",
    perpetualPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
  };

  console.log("Deploying FeeDistributor with:");
  console.log("  dogeToken:", existingAddresses.dogeToken);
  console.log("  dexRouter:", existingAddresses.dexRouter);
  console.log("  buyAndBurnEngine:", existingAddresses.buyAndBurnEngine);
  console.log("  wrappedNative:", existingAddresses.wrappedNative);
  console.log("  perpetualPool:", existingAddresses.perpetualPool);
  console.log("");

  console.log("Deploying...");
  const feeDistributor = await factory.deploy(
    existingAddresses.dogeToken,
    existingAddresses.dexRouter,
    existingAddresses.buyAndBurnEngine,
    existingAddresses.wrappedNative,
    existingAddresses.perpetualPool,
    { gasPrice: ethers.utils.parseUnits("2", "gwei"), gasLimit: 6000000 }
  );

  console.log("Waiting for deployment...");
  await feeDistributor.deployed();
  console.log("✓ FeeDistributor deployed at:", feeDistributor.address);
  console.log("");

  console.log("Updating BondingCurve to use new FeeDistributor...");
  const bondingCurveAddress = "0xFc6da38B132b48d8FCe1502C3868d389BeC71cBe";
  const bondingCurveAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];
  const bondingCurve = new ethers.Contract(bondingCurveAddress, bondingCurveAbi, wallet);
  const tx1 = await bondingCurve.setFeeDistributor(feeDistributor.address, { gasPrice: ethers.utils.parseUnits("2", "gwei"), gasLimit: 500000 });
  await tx1.wait();
  console.log("✓ BondingCurve updated");

  console.log("Updating LaunchDAO to use new FeeDistributor...");
  const launchDaoAddress = "0xb5e49D1cF38B3abeE2bA34e3661Da20C1aC506d3";
  const launchDaoAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];
  const launchDao = new ethers.Contract(launchDaoAddress, launchDaoAbi, wallet);
  const tx2 = await launchDao.setFeeDistributor(feeDistributor.address, { gasPrice: ethers.utils.parseUnits("2", "gwei"), gasLimit: 500000 });
  await tx2.wait();
  console.log("✓ LaunchDAO updated");

  console.log("");
  console.log("========================================");
  console.log("  Deployment Complete!");
  console.log("========================================");
  console.log("");
  console.log("New FeeDistributor Address:", feeDistributor.address);
  console.log("");
  console.log("Update your .env with:");
  console.log(`VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS=${feeDistributor.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
