const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider("https://arc-testnet.drpc.org");
  const wallet = new ethers.Wallet(pk, provider);
  
  const nonce = await provider.getTransactionCount(wallet.address, "latest");
  const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
  console.log("Confirmed nonce:", nonce);
  console.log("Pending nonce:", pendingNonce);
  
  if (pendingNonce > nonce) {
    console.log("Cancelling pending transaction by sending 0 to self with higher gas price...");
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      nonce: nonce,
      gasPrice: ethers.utils.parseUnits("25", "gwei"),
      gasLimit: 21000,
    });
    console.log("Cancel tx sent:", tx.hash);
    await tx.wait();
    console.log("Cancel tx confirmed");
  }
  
  const newNonce = await provider.getTransactionCount(wallet.address, "latest");
  const balance = ethers.utils.formatEther(await provider.getBalance(wallet.address));
  console.log("Current nonce:", newNonce);
  console.log("Balance:", balance, "USDC");
}

main().catch(console.error);
