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

const ARC_RPC = "https://rpc.testnet.arc.network";
const BONDING_CURVE = "0xC5D85fF0b336f5a1B1ae650ebd01851894e6158c";
const DEX_LISTER = "0xAB2581567d645C3d8F1EaF86FFCA34F8Cd29839A";
const FEE_DISTRIBUTOR = "0xa52f1661Ac55D4DfD1D50C7e5451694A8b9B4F80";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Wallet:", wallet.address);

  const ABI = ["function owner() view returns (address)"];

  const bc = new ethers.Contract(BONDING_CURVE, ABI, provider);
  const dl = new ethers.Contract(DEX_LISTER, ABI, provider);
  const fd = new ethers.Contract(FEE_DISTRIBUTOR, ABI, provider);

  console.log("BondingCurve owner:", await bc.owner());
  console.log("DexLister owner:", await dl.owner());
  console.log("FeeDistributor owner:", await fd.owner());

  const ABI2 = ["function dogeToken() view returns (address)", "function dexRouter() view returns (address)"];
  const fd2 = new ethers.Contract(FEE_DISTRIBUTOR, ABI2, provider);
  console.log("FeeDistributor dogeToken:", await fd2.dogeToken());
  console.log("FeeDistributor dexRouter:", await fd2.dexRouter());

  const ABI3 = ["function dexRouter() view returns (address)", "function isXyloRouter() view returns (bool)", "function baseAsset() view returns (address)"];
  const bc2 = new ethers.Contract(BONDING_CURVE, ABI3, provider);
  const dl2 = new ethers.Contract(DEX_LISTER, ABI3, provider);
  console.log("BondingCurve dexRouter:", await bc2.dexRouter());
  console.log("BondingCurve isXyloRouter:", await bc2.isXyloRouter());
  console.log("BondingCurve baseAsset:", await bc2.baseAsset());
  console.log("DexLister dexRouter:", await dl2.dexRouter());
  console.log("DexLister isXyloRouter:", await dl2.isXyloRouter());
  console.log("DexLister baseAsset:", await dl2.baseAsset());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
