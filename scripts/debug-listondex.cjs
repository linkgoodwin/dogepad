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
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");

function getArtifact(name) {
  const subdirs = ["core", "periphery", "pool", "dao"];
  for (const dir of subdirs) {
    for (const suffix of [`${name}.sol`, name]) {
      const artifactPath = path.join(ARTIFACTS_DIR, dir, suffix, `${name}.json`);
      if (fs.existsSync(artifactPath)) {
        return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      }
    }
  }
  throw new Error(`Artifact not found for ${name}`);
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);

  const bondingCurveAddr = process.env.VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS;
  const dexListerAddr = process.env.VITE_ARC_TESTNET_DEX_LISTER_ADDRESS;
  const simpleRouterAddr = process.env.VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS;

  const bcArtifact = getArtifact("BondingCurve");
  const bc = new ethers.Contract(bondingCurveAddr, bcArtifact.abi, wallet);
  const dlArtifact = getArtifact("DexLister");
  const dl = new ethers.Contract(dexListerAddr, dlArtifact.abi, wallet);
  const routerArtifact = getArtifact("SimpleRouter");
  const router = new ethers.Contract(simpleRouterAddr, routerArtifact.abi, wallet);
  const tokenArtifact = getArtifact("BondingCurveToken");

  const tokenAddr = "0x8Ef5C2029e867F8A1288bBc0465084D728bdb149";
  const token = new ethers.Contract(tokenAddr, tokenArtifact.abi, wallet);

  console.log("=== Debug listOnDex for token:", tokenAddr, "===\n");

  const info = await bc.getTokenInfo(tokenAddr);
  console.log("reserveUsdc:", ethers.utils.formatEther(info.reserveUsdc));
  console.log("isListedOnDex:", info.isListedOnDex);
  console.log("dexListingThreshold:", ethers.utils.formatEther(info.dexListingThreshold));

  const tokenBalance = await token.balanceOf(tokenAddr);
  console.log("token.balanceOf(token):", ethers.utils.formatEther(tokenBalance));

  const dexLister = await token.dexLister();
  console.log("token.dexLister:", dexLister);

  const dexPair = await token.dexPair();
  console.log("token.dexPair:", dexPair);

  const skipHoldingLimit = await token.skipHoldingLimit();
  console.log("token.skipHoldingLimit:", skipHoldingLimit);

  const lpTokenRatio = await dl.lpTokenRatio();
  const perpPoolTokenRatio = await dl.perpPoolTokenRatio();
  const lpUsdcRatio = await dl.lpUsdcRatio();
  console.log("\nDexLister ratios:");
  console.log("  lpTokenRatio:", lpTokenRatio.toString());
  console.log("  perpPoolTokenRatio:", perpPoolTokenRatio.toString());
  console.log("  lpUsdcRatio:", lpUsdcRatio.toString());

  const totalTokens = tokenBalance;
  const totalUsdc = info.reserveUsdc;
  const lpTokens = totalTokens.mul(lpTokenRatio).div(100);
  const perpPoolTokens = totalTokens.mul(perpPoolTokenRatio).div(100);
  const lpUsdc = totalUsdc.mul(lpUsdcRatio).div(100);

  console.log("\nCalculated amounts:");
  console.log("  totalTokens:", ethers.utils.formatEther(totalTokens));
  console.log("  totalUsdc:", ethers.utils.formatEther(totalUsdc));
  console.log("  lpTokens:", ethers.utils.formatEther(lpTokens));
  console.log("  perpPoolTokens:", ethers.utils.formatEther(perpPoolTokens));
  console.log("  lpUsdc:", ethers.utils.formatEther(lpUsdc));

  console.log("\n--- Trying static call for listOnDex ---");
  try {
    const result = await provider.call({
      to: bondingCurveAddr,
      data: bc.interface.encodeFunctionData("listOnDex", [tokenAddr]),
      from: wallet.address,
      value: 0,
      gasLimit: 8_000_000,
    });
    console.log("Static call succeeded! Result:", result);
  } catch (err) {
    console.log("Static call FAILED:");
    if (err.error && err.error.message) {
      console.log("  Error:", err.error.message);
    }
    if (err.data) {
      try {
        const iface = new ethers.utils.Interface([
          "error Error(string)",
          "error Panic(uint256)"
        ]);
        const decoded = iface.parseError(err.data);
        console.log("  Decoded error:", decoded.name, decoded.args);
      } catch (e) {
        console.log("  Raw error data:", err.data);
      }
    }
    console.log("  Full message:", err.message?.substring(0, 500));
  }

  console.log("\n--- Trying step by step: buyFromCurve ---");
  try {
    const result = await provider.call({
      to: tokenAddr,
      data: token.interface.encodeFunctionData("buyFromCurve", [bondingCurveAddr, totalTokens]),
      from: bondingCurveAddr,
      gasLimit: 2_000_000,
    });
    console.log("  buyFromCurve static call succeeded!");
  } catch (err) {
    console.log("  buyFromCurve FAILED:", err.error?.message || err.message?.substring(0, 300));
  }

  console.log("\n--- Checking WUSDC deposit ---");
  const wusdcArtifact = getArtifact("SimpleRouter");
  try {
    const depositData = router.interface.encodeFunctionData("addLiquidity", [
      WUSDC, tokenAddr, lpUsdc, lpTokens,
      lpUsdc.mul(95).div(100), lpTokens.mul(95).div(100),
      dexListerAddr, Math.floor(Date.now() / 1000) + 300
    ]);
    console.log("  addLiquidity calldata prepared");
  } catch (err) {
    console.log("  addLiquidity prep failed:", err.message);
  }

  console.log("\n--- Checking pair existence ---");
  const factoryAddr = await router.factory();
  const factoryArtifact = getArtifact("SimpleFactory");
  const factory = new ethers.Contract(factoryAddr, factoryArtifact.abi, wallet);
  const existingPair = await factory.getPair(WUSDC, tokenAddr);
  console.log("  Existing pair:", existingPair);
  console.log("  Is zero address:", existingPair === ethers.constants.AddressZero);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FATAL:", error.message || error);
    process.exit(1);
  });
