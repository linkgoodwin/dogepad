const { ethers } = require("ethers");
const dotenv = require("dotenv");
dotenv.config();

async function main() {
  const rpc = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.network";
  console.log("RPC:", rpc);

  const provider = new ethers.providers.JsonRpcProvider(rpc, {
    chainId: 5042002,
    name: "arc-testnet",
  });

  console.log("Testing connection...");
  const blockNum = await provider.getBlockNumber();
  console.log("Block number:", blockNum);

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("No DEPLOYER_PRIVATE_KEY in .env");
    return;
  }

  const wallet = new ethers.Wallet(pk, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  if (balance.lt(ethers.utils.parseEther("0.05"))) {
    console.error("ERROR: Need at least 0.05 USDC to deploy!");
  } else {
    console.log("Balance OK, ready to deploy");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
