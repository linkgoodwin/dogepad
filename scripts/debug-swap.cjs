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

  const tokenAddr = "0xFF299F3cB5D131C7537430a0918a2665488c649E";
  const pairAddr = "0xc388140F1AF124640DA8079adB9b401F2905C767";
  const routerAddr = process.env.VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS;

  const pairArtifact = getArtifact("SimplePair");
  const pair = new ethers.Contract(pairAddr, pairArtifact.abi, wallet);
  const tokenArtifact = getArtifact("BondingCurveToken");
  const token = new ethers.Contract(tokenAddr, tokenArtifact.abi, wallet);
  const routerArtifact = getArtifact("SimpleRouter");
  const router = new ethers.Contract(routerAddr, routerArtifact.abi, wallet);

  console.log("=== Debug DEX Swap ===\n");

  const wusdc = new ethers.Contract(WUSDC, [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)"
  ], wallet);

  console.log("Pair address:", pairAddr);
  console.log("Token address:", tokenAddr);

  const reserves = await pair.getReserves();
  console.log("Pair reserves:", ethers.utils.formatEther(reserves[0]), "/", ethers.utils.formatEther(reserves[1]));

  const token0 = await pair.token0();
  const token1 = await pair.token1();
  console.log("Pair token0:", token0);
  console.log("Pair token1:", token1);

  const pairWusdcBal = await wusdc.balanceOf(pairAddr);
  const pairTokenBal = await token.balanceOf(pairAddr);
  console.log("Pair WUSDC balance:", ethers.utils.formatEther(pairWusdcBal));
  console.log("Pair Token balance:", ethers.utils.formatEther(pairTokenBal));

  const userWusdcBal = await wusdc.balanceOf(wallet.address);
  const userTokenBal = await token.balanceOf(wallet.address);
  const userWusdcAllowance = await wusdc.allowance(wallet.address, routerAddr);
  console.log("\nUser WUSDC balance:", ethers.utils.formatEther(userWusdcBal));
  console.log("User Token balance:", ethers.utils.formatEther(userTokenBal));
  console.log("User WUSDC allowance to router:", ethers.utils.formatEther(userWusdcAllowance));

  const dexPair = await token.dexPair();
  const skipHoldingLimit = await token.skipHoldingLimit();
  const taxEnabled = await token.taxEnabled();
  const buyTax = await token.buyTax();
  const sellTax = await token.sellTax();
  console.log("\nToken dexPair:", dexPair);
  console.log("Token skipHoldingLimit:", skipHoldingLimit);
  console.log("Token taxEnabled:", taxEnabled);
  console.log("Token buyTax:", buyTax.toString(), "bps");
  console.log("Token sellTax:", sellTax.toString(), "bps");

  console.log("\n--- Testing getAmountsOut ---");
  const swapAmount = ethers.utils.parseEther("0.1");
  try {
    const amountsOut = await router.getAmountsOut(swapAmount, [WUSDC, tokenAddr]);
    console.log("  Amounts out:", ethers.utils.formatEther(amountsOut[0]), "->", ethers.utils.formatEther(amountsOut[1]));
  } catch (err) {
    console.log("  getAmountsOut FAILED:", err.message?.substring(0, 300));
  }

  console.log("\n--- Testing static call for swap ---");
  try {
    const amountsOut = await router.getAmountsOut(swapAmount, [WUSDC, tokenAddr]);
    const minTokens = amountsOut[1].mul(95).div(100);
    const result = await provider.call({
      to: routerAddr,
      data: router.interface.encodeFunctionData("swapExactTokensForTokens", [
        swapAmount, minTokens, [WUSDC, tokenAddr], wallet.address, Math.floor(Date.now() / 1000) + 300
      ]),
      from: wallet.address,
      gasLimit: 500_000,
    });
    console.log("  Static call succeeded! Result:", result);
  } catch (err) {
    console.log("  Static call FAILED:");
    if (err.error?.message) {
      console.log("  Error:", err.error.message);
    }
    const revertData = err.data || err.error?.data;
    if (revertData) {
      try {
        const iface = new ethers.utils.Interface(["error Error(string)", "error Panic(uint256)"]);
        const decoded = iface.parseError(revertData);
        console.log("  Decoded:", decoded?.name, decoded?.args?.toString());
      } catch (e) {
        console.log("  Raw data:", revertData?.substring(0, 200));
      }
    }
    console.log("  Message:", err.message?.substring(0, 500));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FATAL:", error.message || error);
    process.exit(1);
  });
