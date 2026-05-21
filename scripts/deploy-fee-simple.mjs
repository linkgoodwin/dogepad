import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const ARC_RPC = "https://rpc.testnet.arc.network";

const artifactPath = path.resolve("./artifacts/contracts/periphery/FeeDistributor.sol/FeeDistributor.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const existingAddresses = {
  dogeToken: "0x3fa820C7b7f2337E572f77D5381Bc3a5A3AaD0C3",
  dexRouter: "0x73742278c31a76dBb0D2587d03ef92E6E2141023",
  buyAndBurnEngine: "0xBfEa6640F909D086363B679768F8DCDbb73A2625",
  wrappedNative: "0x0000000000000000000000000000000000000000",
  longPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
};

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

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("Deploying FeeDistributor...");
  const feeDistributor = await factory.deploy(
    existingAddresses.dogeToken,
    existingAddresses.dexRouter,
    existingAddresses.buyAndBurnEngine,
    existingAddresses.wrappedNative,
    existingAddresses.longPool,
    { gasPrice: ethers.utils.parseUnits('50', 'gwei') }
  );
  
  console.log("TX sent, waiting...");
  await feeDistributor.deployed({ confirmations: 2 });
  console.log("✓ FeeDistributor:", feeDistributor.address);

  const bondingCurveAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];
  const bondingCurve = new ethers.Contract("0xFc6da38B132b48d8FCe1502C3868d389BeC71cBe", bondingCurveAbi, wallet);
  
  console.log("Updating BondingCurve...");
  await bondingCurve.setFeeDistributor(feeDistributor.address);
  console.log("✓ BondingCurve updated");

  const launchDao = new ethers.Contract("0xb5e49D1cF38B3abeE2bA34e3661Da20C1aC506d3", bondingCurveAbi, wallet);
  
  console.log("Updating LaunchDAO...");
  await launchDao.setFeeDistributor(feeDistributor.address);
  console.log("✓ LaunchDAO updated");

  console.log("\nDone! New FeeDistributor:", feeDistributor.address);
  console.log("\nUpdate .env: VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS=" + feeDistributor.address);
}

main().catch(console.error);
