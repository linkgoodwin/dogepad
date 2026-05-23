import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const ARC_RPC = "https://rpc.testnet.arc.network";

const artifactPath = path.resolve("./artifacts/contracts/dao/LaunchDAO.sol/LaunchDAO.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const existingAddresses = {
  bondingCurve: "0x8a26D257fdbb71ab2D3A567E26aB6F6c7C46f0EA",
  feeDistributor: "0xa52f1661Ac55D4DfD1D50C7e5451694A8b9B4F80",
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

  console.log("Deploying LaunchDAO (with earlyQueue)...");
  const launchDAO = await factory.deploy(
    existingAddresses.bondingCurve,
    existingAddresses.feeDistributor,
    { gasPrice: ethers.utils.parseUnits('50', 'gwei') }
  );

  console.log("TX sent, waiting...");
  await launchDAO.deployed({ confirmations: 2 });
  console.log("✓ LaunchDAO:", launchDAO.address);

  const setLaunchDaoAbi = [{ inputs: [{ internalType: "address", name: "_launchDao", type: "address" }], name: "setLaunchDao", outputs: [], stateMutability: "nonpayable", type: "function" }];

  const bondingCurve = new ethers.Contract(existingAddresses.bondingCurve, setLaunchDaoAbi, wallet);
  console.log("Updating BondingCurve.setLaunchDao...");
  const tx1 = await bondingCurve.setLaunchDao(launchDAO.address, { gasPrice: ethers.utils.parseUnits('50', 'gwei') });
  await tx1.wait(2);
  console.log("✓ BondingCurve updated");

  const setFeeDistributorAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];
  const newDAO = new ethers.Contract(launchDAO.address, setFeeDistributorAbi, wallet);
  console.log("Setting FeeDistributor on new LaunchDAO...");
  const tx2 = await newDAO.setFeeDistributor(existingAddresses.feeDistributor, { gasPrice: ethers.utils.parseUnits('50', 'gwei') });
  await tx2.wait(2);
  console.log("✓ FeeDistributor set");

  console.log("\nDone! New LaunchDAO:", launchDAO.address);
  console.log("\nUpdate .env: VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=" + launchDAO.address);
}

main().catch(console.error);
