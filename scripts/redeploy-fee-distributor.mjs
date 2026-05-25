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
  perpetualPool: "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62",
  bondingCurve: "0x8a26D257fdbb71ab2D3A567E26aB6F6c7C46f0EA",
  launchDAO: "0x4819808056bcB9E42fF3c52f4ee07D988d03E383",
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

  console.log("Deploying FeeDistributor (with ratio validation)...");
  const feeDistributor = await factory.deploy(
    existingAddresses.dogeToken,
    existingAddresses.dexRouter,
    existingAddresses.buyAndBurnEngine,
    existingAddresses.wrappedNative,
    existingAddresses.perpetualPool,
    { gasPrice: ethers.utils.parseUnits('50', 'gwei') }
  );

  console.log("TX sent, waiting...");
  await feeDistributor.deployed({ confirmations: 2 });
  console.log("✓ FeeDistributor:", feeDistributor.address);

  const setFeeAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];

  const bondingCurve = new ethers.Contract(existingAddresses.bondingCurve, setFeeAbi, wallet);
  console.log("Updating BondingCurve.setFeeDistributor...");
  const tx1 = await bondingCurve.setFeeDistributor(feeDistributor.address, { gasPrice: ethers.utils.parseUnits('50', 'gwei') });
  await tx1.wait(2);
  console.log("✓ BondingCurve updated");

  const launchDAO = new ethers.Contract(existingAddresses.launchDAO, setFeeAbi, wallet);
  console.log("Updating LaunchDAO.setFeeDistributor...");
  const tx2 = await launchDAO.setFeeDistributor(feeDistributor.address, { gasPrice: ethers.utils.parseUnits('50', 'gwei') });
  await tx2.wait(2);
  console.log("✓ LaunchDAO updated");

  console.log("\nDone! New FeeDistributor:", feeDistributor.address);
  console.log("\nUpdate .env: VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS=" + feeDistributor.address);
}

main().catch(console.error);
