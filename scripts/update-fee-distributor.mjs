import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:");

const ARC_RPC = "https://arc-testnet.drpc.org";

const FEE_DISTRIBUTOR_ABI = [
  { inputs: [{ internalType: "address", name: "_dogeToken", type: "address" }], name: "setDogeToken", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "_longPool", type: "address" }], name: "setLongPool", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "_dividendRatio", type: "uint256" }], name: "setDividendRatio", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "_burnRatio", type: "uint256" }], name: "setBurnRatio", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "_lendingPoolRatio", type: "uint256" }], name: "setLendingPoolRatio", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "dogeToken", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "longPool", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "dividendRatio", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "burnRatio", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "lendingPoolRatio", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
];

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
  console.log("  Updating FeeDistributor Configuration");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), "USDC");
  console.log("");

  const feeDistributorAddress = "0x7D4041397748F334Ed35077a2D89dB73f7D2D093";
  const longPoolAddress = "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62";
  const dogeTokenAddress = "0x3fa820C7b7f2337E572f77D5381Bc3a5A3AaD0C3";

  const feeDistributor = new ethers.Contract(feeDistributorAddress, FEE_DISTRIBUTOR_ABI, wallet);

  console.log("Current configuration:");
  console.log("  dogeToken:", await feeDistributor.dogeToken());
  console.log("  longPool:", await feeDistributor.longPool());
  console.log("  dividendRatio:", ethers.utils.formatEther(await feeDistributor.dividendRatio()), " (30% expected)");
  console.log("  burnRatio:", ethers.utils.formatEther(await feeDistributor.burnRatio()), " (20% expected)");
  console.log("  lendingPoolRatio:", ethers.utils.formatEther(await feeDistributor.lendingPoolRatio()), " (50% expected)");
  console.log("");

  console.log("Updating configuration...");

  const txOverrides = { gasPrice: 2_000_000_000, gasLimit: 500_000 };

  if ((await feeDistributor.dogeToken()).toLowerCase() !== dogeTokenAddress.toLowerCase()) {
    console.log("  Setting dogeToken...");
    const tx = await feeDistributor.setDogeToken(dogeTokenAddress, txOverrides);
    await tx.wait();
    console.log("  ✓ Done");
  } else {
    console.log("  dogeToken already set");
  }

  if ((await feeDistributor.longPool()).toLowerCase() !== longPoolAddress.toLowerCase()) {
    console.log("  Setting longPool...");
    const tx = await feeDistributor.setLongPool(longPoolAddress, txOverrides);
    await tx.wait();
    console.log("  ✓ Done");
  } else {
    console.log("  longPool already set");
  }

  const targetDividendRatio = ethers.utils.parseEther("0.3");
  if ((await feeDistributor.dividendRatio()).toString() !== targetDividendRatio.toString()) {
    console.log("  Setting dividendRatio (30%)...");
    const tx = await feeDistributor.setDividendRatio(targetDividendRatio, txOverrides);
    await tx.wait();
    console.log("  ✓ Done");
  } else {
    console.log("  dividendRatio already 30%");
  }

  const targetBurnRatio = ethers.utils.parseEther("0.2");
  if ((await feeDistributor.burnRatio()).toString() !== targetBurnRatio.toString()) {
    console.log("  Setting burnRatio (20%)...");
    const tx = await feeDistributor.setBurnRatio(targetBurnRatio, txOverrides);
    await tx.wait();
    console.log("  ✓ Done");
  } else {
    console.log("  burnRatio already 20%");
  }

  const targetLendingPoolRatio = ethers.utils.parseEther("0.5");
  if ((await feeDistributor.lendingPoolRatio()).toString() !== targetLendingPoolRatio.toString()) {
    console.log("  Setting lendingPoolRatio (50%)...");
    const tx = await feeDistributor.setLendingPoolRatio(targetLendingPoolRatio, txOverrides);
    await tx.wait();
    console.log("  ✓ Done");
  } else {
    console.log("  lendingPoolRatio already 50%");
  }

  console.log("");
  console.log("========================================");
  console.log("  Configuration Updated Successfully!");
  console.log("========================================");
  console.log("");
  console.log("New configuration:");
  console.log("  dogeToken:", await feeDistributor.dogeToken());
  console.log("  longPool:", await feeDistributor.longPool());
  console.log("  dividendRatio:", (ethers.utils.formatEther(await feeDistributor.dividendRatio()) * 100).toFixed(0), "%");
  console.log("  burnRatio:", (ethers.utils.formatEther(await feeDistributor.burnRatio()) * 100).toFixed(0), "%");
  console.log("  lendingPoolRatio:", (ethers.utils.formatEther(await feeDistributor.lendingPoolRatio()) * 100).toFixed(0), "%");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nERROR:", error.message || error);
    process.exit(1);
  });
