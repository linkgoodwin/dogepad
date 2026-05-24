const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ARC_RPC = "https://rpc.testnet.arc.network";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("========================================");
  console.log("  Deploy SimpleFactory + SimpleRouter");
  console.log("========================================");
  console.log("Wallet:", wallet.address);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(wallet.address)), "USDC");
  console.log("");

  const deployOverrides = { type: 0, gasPrice: 100_000_000_000, gasLimit: 6_000_000 };

  function getArtifact(name) {
    const subdirs = ["core", "periphery", "pool", "dao"];
    for (const dir of subdirs) {
      for (const suffix of [`${name}.sol`, name]) {
        const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${dir}/${suffix}/${name}.json`);
        if (fs.existsSync(artifactPath)) {
          const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
          return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
        }
      }
    }
    throw new Error(`Artifact not found for ${name}`);
  }

  async function deploy(name, ...args) {
    const factory = getArtifact(name);
    console.log(`Deploying ${name}...`);
    const contract = await factory.deploy(...args, deployOverrides);
    await contract.deployed();
    console.log(`${name}:`, contract.address);
    return contract;
  }

  console.log("--- 1. Deploy SimpleFactory ---");
  const simpleFactory = await deploy("SimpleFactory");

  console.log("\n--- 2. Deploy SimpleRouter ---");
  const simpleRouter = await deploy("SimpleRouter", simpleFactory.address, WUSDC);

  console.log("\n========================================");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("SimpleFactory:", simpleFactory.address);
  console.log("SimpleRouter:", simpleRouter.address);
  console.log("");
  console.log("Next step: Run setup-arc.ts with these addresses:");
  console.log(`  SIMPLE_FACTORY_ADDRESS=${simpleFactory.address} SIMPLE_ROUTER_ADDRESS=${simpleRouter.address} node scripts/setup-arc.cjs`);
  console.log("");

  const envPath = path.resolve(__dirname, "../.env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }
  function setEnvValue(key, value) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }
  setEnvValue("VITE_ARC_TESTNET_SIMPLE_FACTORY_ADDRESS", simpleFactory.address);
  setEnvValue("VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS", simpleRouter.address);
  fs.writeFileSync(envPath, envContent);
  console.log("Addresses saved to .env");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
