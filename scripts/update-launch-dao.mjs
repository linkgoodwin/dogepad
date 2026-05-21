import { ethers } from "ethers";

const ARC_RPC = "https://rpc.testnet.arc.network";
const FEE_DISTRIBUTOR = "0x2f7CC6b01DA6662d99971A7B96a54A22a705a982";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.providers.JsonRpcProvider({
    url: ARC_RPC,
    timeout: 300000
  });
  const wallet = new ethers.Wallet(pk, provider);
  
  console.log("Deployer:", wallet.address);

  const bondingCurveAbi = [{ inputs: [{ internalType: "address", name: "_feeDistributor", type: "address" }], name: "setFeeDistributor", outputs: [], stateMutability: "nonpayable", type: "function" }];
  
  const launchDao = new ethers.Contract("0xb5e49D1cF38B3abeE2bA34e3661Da20C1aC506d3", bondingCurveAbi, wallet);
  
  console.log("Updating LaunchDAO...");
  await launchDao.setFeeDistributor(FEE_DISTRIBUTOR, { gasPrice: ethers.utils.parseUnits('100', 'gwei') });
  console.log("✓ LaunchDAO updated");

  console.log("\nDone!");
}

main().catch(console.error);
