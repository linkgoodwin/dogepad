const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const p = new ethers.providers.JsonRpcProvider("https://rpc.testnet.arc.network", {
    chainId: 5042002,
    name: "arc",
    timeout: 60000,
  });
  const w = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);

  console.log("Deployer:", w.address);
  const balance = await p.getBalance(w.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "USDC");

  const gasPrice = ethers.utils.parseUnits("100", "gwei");

  const artifact = JSON.parse(require("fs").readFileSync(
    "artifacts/contracts/periphery/PriceOracle.sol/PriceOracle.json", "utf8"
  ));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w);

  console.log("\nEstimating gas for PriceOracle deployment...");
  try {
    const estimatedGas = await factory.estimateGas.deploy();
    console.log("Estimated gas:", estimatedGas.toString());
  } catch (e) {
    console.log("Gas estimation failed:", e.message.substring(0, 200));
  }

  console.log("\nDeploying PriceOracle with gasLimit: 3,000,000...");
  const contract = await factory.deploy({ gasPrice, gasLimit: 3_000_000 });
  console.log("Tx hash:", contract.deployTransaction.hash);
  await contract.deployed();
  console.log("Deployed at:", contract.address);
}

main().catch(e => console.error("Error:", e.message));
