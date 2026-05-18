const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const p = new ethers.providers.JsonRpcProvider("https://rpc.testnet.arc.network", {
    chainId: 5042002,
    name: "arc",
    timeout: 60000,
  });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);

  const nonce = await p.getTransactionCount(w.address, "latest");
  const pendingNonce = await p.getTransactionCount(w.address, "pending");
  console.log("Latest nonce:", nonce, "Pending nonce:", pendingNonce);

  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  for (let i = nonce; i < pendingNonce; i++) {
    console.log(`\nReplacing nonce ${i}...`);
    const tx = await w.sendTransaction({
      to: w.address,
      value: 0,
      nonce: i,
      gasPrice: gasPrice,
      gasLimit: 21000,
    });
    console.log("Tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt.status, "Block:", receipt.blockNumber);
  }

  console.log("\nAll pending transactions cleared!");
  const finalNonce = await p.getTransactionCount(w.address, "latest");
  console.log("Final nonce:", finalNonce);
}

main().catch(e => console.error("Error:", e.message));
