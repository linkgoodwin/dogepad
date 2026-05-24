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
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const CORRECT_DOGE_TOKEN = "0xC65D9B12760d8ad32A62271814EB6c88aFC9d2FB";

const BONDING_CURVE = "0xC5D85fF0b336f5a1B1ae650ebd01851894e6158c";
const DEX_LISTER = "0xAB2581567d645C3d8F1EaF86FFCA34F8Cd29839A";
const BUY_AND_BURN = "0x0000000000000000000000000000000000000000";
const FEE_DISTRIBUTOR = "0xa52f1661Ac55D4DfD1D50C7e5451694A8b9B4F80";
const LONG_POOL = "0xD3C201e87e6c98A23b240Ad5a39092B2C8488B62";
const SHORT_POOL = "0x6Bcb9A91c9328307868B268c9b7207f293b086DA";

const SIMPLE_FACTORY = process.env.SIMPLE_FACTORY_ADDRESS || "";
const SIMPLE_ROUTER = process.env.SIMPLE_ROUTER_ADDRESS || "";

const BONDING_CURVE_ABI = [
  "function isXyloRouter() view returns (bool)",
  "function baseAsset() view returns (address)",
  "function dexRouter() view returns (address)",
  "function dexLister() view returns (address)",
  "function setDexRouterConfig(address _dexRouter, bool _isXyloRouter, address _baseAsset)",
  "function setDexLister(address payable _dexLister)",
];

const DEX_LISTER_ABI = [
  "function isXyloRouter() view returns (bool)",
  "function baseAsset() view returns (address)",
  "function dexRouter() view returns (address)",
  "function bondingCurve() view returns (address)",
  "function longPool() view returns (address)",
  "function shortPool() view returns (address)",
  "function feeDistributor() view returns (address)",
  "function buyAndBurnEngine() view returns (address)",
  "function creatorRewardManager() view returns (address)",
  "function setDexRouterConfig(address _dexRouter, bool _isXyloRouter, address _baseAsset)",
  "function setPools(address _longPool, address _shortPool)",
  "function setFeeDistributor(address _feeDistributor)",
  "function setBuyAndBurnEngine(address _engine)",
  "function setCreatorRewardManager(address _manager)",
  "function setBondingCurve(address _bondingCurve)",
];

const BUY_AND_BURN_ABI = [
  "function isXyloRouter() view returns (bool)",
  "function wrappedNative() view returns (address)",
  "function dexRouter() view returns (address)",
  "function setIsXyloRouter(bool _isXyloRouter)",
  "function setWrappedNative(address _wrappedNative)",
  "function setDexRouter(address _dexRouter)",
];

const FEE_DISTRIBUTOR_ABI = [
  "function wrappedNative() view returns (address)",
  "function dexRouter() view returns (address)",
  "function dogeToken() view returns (address)",
  "function setDogeToken(address _dogeToken)",
];

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  if (!SIMPLE_FACTORY || !SIMPLE_ROUTER) {
    console.error("ERROR: SIMPLE_FACTORY_ADDRESS and SIMPLE_ROUTER_ADDRESS must be set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const overrides = { maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 1_000_000_000, gasLimit: 500_000 };

  console.log("========================================");
  console.log("  DogePad - Migrate to SimpleRouter DEX");
  console.log("========================================");
  console.log("Wallet:", wallet.address);
  console.log("SimpleFactory:", SIMPLE_FACTORY);
  console.log("SimpleRouter:", SIMPLE_ROUTER);
  console.log("");

  async function tx(label, fn) {
    console.log(`  Sending: ${label}...`);
    const t = await fn();
    await t.wait();
    console.log(`  Done: ${label}`);
  }

  console.log("--- 1. Update BondingCurve dexRouter -> SimpleRouter ---");
  const bc = new ethers.Contract(BONDING_CURVE, BONDING_CURVE_ABI, wallet);
  const bcDexRouter = await bc.dexRouter();
  console.log(`  Current dexRouter: ${bcDexRouter}`);

  if (bcDexRouter !== SIMPLE_ROUTER) {
    await tx("BondingCurve.setDexRouterConfig(SimpleRouter, true, WUSDC)", () =>
      bc.setDexRouterConfig(SIMPLE_ROUTER, true, WUSDC, overrides)
    );
  } else {
    console.log("  -> BondingCurve dexRouter already set to SimpleRouter");
  }

  console.log("\n--- 2. Update DexLister dexRouter -> SimpleRouter ---");
  const dl = new ethers.Contract(DEX_LISTER, DEX_LISTER_ABI, wallet);
  const dlDexRouter = await dl.dexRouter();
  console.log(`  Current dexRouter: ${dlDexRouter}`);

  if (dlDexRouter !== SIMPLE_ROUTER) {
    await tx("DexLister.setDexRouterConfig(SimpleRouter, true, WUSDC)", () =>
      dl.setDexRouterConfig(SIMPLE_ROUTER, true, WUSDC, overrides)
    );
  } else {
    console.log("  -> DexLister dexRouter already set to SimpleRouter");
  }

  console.log("\n--- 3. Update BuyAndBurnEngine dexRouter -> SimpleRouter ---");
  if (BUY_AND_BURN !== "0x0000000000000000000000000000000000000000") {
    const be = new ethers.Contract(BUY_AND_BURN, BUY_AND_BURN_ABI, wallet);
    const beDexRouter = await be.dexRouter();
    console.log(`  Current dexRouter: ${beDexRouter}`);

    if (beDexRouter !== SIMPLE_ROUTER) {
      await tx("BuyAndBurnEngine.setDexRouter(SimpleRouter)", () => be.setDexRouter(SIMPLE_ROUTER, overrides));
    }
  } else {
    console.log("  BuyAndBurnEngine not deployed, skipping");
  }

  console.log("\n--- 4. Fix FeeDistributor dogeToken ---");
  const fd = new ethers.Contract(FEE_DISTRIBUTOR, FEE_DISTRIBUTOR_ABI, wallet);
  const fdDogeToken = await fd.dogeToken();
  console.log(`  Current dogeToken: ${fdDogeToken}`);
  console.log(`  Correct dogeToken: ${CORRECT_DOGE_TOKEN}`);

  if (fdDogeToken !== CORRECT_DOGE_TOKEN) {
    await tx("FeeDistributor.setDogeToken(correct DOGE)", () =>
      fd.setDogeToken(CORRECT_DOGE_TOKEN, overrides)
    );
  } else {
    console.log("  -> FeeDistributor dogeToken already correct");
  }

  console.log("\n========================================");
  console.log("  MIGRATION COMPLETE");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nMIGRATION FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
