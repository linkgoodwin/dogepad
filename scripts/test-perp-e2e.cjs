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

  const overrides = { maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 1_000_000_000, gasLimit: 500_000 };
  const highGasOverrides = { maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 1_000_000_000, gasLimit: 8_000_000 };

  const bondingCurveAddr = process.env.VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS;
  const dexListerAddr = process.env.VITE_ARC_TESTNET_DEX_LISTER_ADDRESS;
  const launchDaoAddr = process.env.VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS;
  const simpleRouterAddr = process.env.VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS;
  const simpleFactoryAddr = process.env.VITE_ARC_TESTNET_SIMPLE_FACTORY_ADDRESS;
  const creatorRewardMgrAddr = process.env.VITE_ARC_TESTNET_CREATOR_REWARD_MANAGER_ADDRESS;
  const perpetualPoolAddr = process.env.VITE_ARC_TESTNET_PERPETUAL_POOL_ADDRESS;
  const priceOracleAddr = process.env.VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS;

  const bcArtifact = getArtifact("BondingCurve");
  const bc = new ethers.Contract(bondingCurveAddr, bcArtifact.abi, wallet);

  const dlArtifact = getArtifact("DexLister");
  const dl = new ethers.Contract(dexListerAddr, dlArtifact.abi, wallet);

  const perpArtifact = getArtifact("PerpetualPool");
  const perp = new ethers.Contract(perpetualPoolAddr, perpArtifact.abi, wallet);

  const oracleArtifact = getArtifact("PriceOracle");
  const oracle = new ethers.Contract(priceOracleAddr, oracleArtifact.abi, wallet);

  const tokenArtifact = getArtifact("BondingCurveToken");

  console.log("=== PerpetualPool E2E Test ===\n");
  console.log("BondingCurve:", bondingCurveAddr);
  console.log("PerpetualPool:", perpetualPoolAddr);
  console.log("PriceOracle:", priceOracleAddr);
  console.log("Wallet:", wallet.address);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(wallet.address)), "USDC\n");

  const existingToken = process.env.TEST_TOKEN_ADDRESS;
  let tokenAddr;

  if (existingToken) {
    console.log("--- Step 1: Using existing token ---");
    tokenAddr = existingToken;
    console.log("  Token address:", tokenAddr);
  } else {
    console.log("--- Step 1: Create token and buy on bonding curve ---");
    const daoOnlyLaunch = await bc.daoOnlyLaunch();
    if (daoOnlyLaunch) {
      console.log("  Disabling daoOnlyLaunch for test...");
      const txDisable = await bc.setDaoOnlyLaunch(false, overrides);
      await txDisable.wait();
    }

    const currentThreshold = await bc.defaultDexThreshold();
    if (currentThreshold.gt(ethers.utils.parseEther("2.0"))) {
      console.log("  Lowering default DEX threshold to 2.0 USDC for test...");
      const txTh = await bc.setDexThreshold(ethers.utils.parseEther("2.0"), overrides);
      await txTh.wait();
    }

    const factoryAddr = await bc.factory();
    const factoryContract = new ethers.Contract(factoryAddr, getArtifact("BondingCurveFactory").abi, wallet);
    const createFee = await bc.creationFee();

    const tokenName = "PerpTest" + Date.now().toString().slice(-6);
    const tokenSymbol = "PTT";
    const totalSupply = ethers.utils.parseEther("1000000000");
    const tx1 = await factoryContract.createToken(tokenName, tokenSymbol, totalSupply, "ipfs://test", true, true, true, { ...highGasOverrides, value: createFee });
    const receipt1 = await tx1.wait();
    console.log("  Token created, tx:", receipt1.transactionHash.slice(0, 20) + "...");

    const iface = new ethers.utils.Interface(getArtifact("BondingCurveFactory").abi);
    for (const log of receipt1.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "TokenCreated") {
          tokenAddr = parsed.args.token || parsed.args[0];
          break;
        }
      } catch (e) {}
    }
    if (!tokenAddr) {
      const bcIface = new ethers.utils.Interface(bcArtifact.abi);
      for (const log of receipt1.logs) {
        try {
          const parsed = bcIface.parseLog(log);
          if (parsed.name === "TokenCreated") {
            tokenAddr = parsed.args.token || parsed.args[0];
            break;
          }
        } catch (e) {}
      }
    }
    if (!tokenAddr) {
      const totalTokens = await factoryContract.totalTokens();
      tokenAddr = await factoryContract.tokens(totalTokens.sub(1));
    }
    console.log("  Token address:", tokenAddr);

    console.log("\n--- Step 2: Buy tokens to reach DEX listing threshold ---");
    const buyAmount = ethers.utils.parseEther("2.1");
    const tx2 = await bc.buy(tokenAddr, 0, wallet.address, { ...overrides, value: buyAmount });
    await tx2.wait();
    console.log("  Bought", ethers.utils.formatEther(buyAmount), "USDC worth of tokens");

    const tokenInfo = await bc.getTokenInfo(tokenAddr);
    console.log("  Reserve USDC:", ethers.utils.formatEther(tokenInfo.reserveUsdc));
    console.log("  Is listed on DEX:", tokenInfo.isListedOnDex);

    console.log("\n--- Step 3: List on DEX ---");
    try {
      const tx3 = await bc.listOnDex(tokenAddr, { ...highGasOverrides });
      await tx3.wait();
      console.log("  listOnDex SUCCESS!");

      const dexPair = await new ethers.Contract(tokenAddr, tokenArtifact.abi, wallet).dexPair();
      console.log("  DEX pair:", dexPair);
    } catch (err) {
      console.error("  listOnDex FAILED:", err.message);
      process.exit(1);
    }
  }

  console.log("\n--- Step 4: Deposit USDC to PerpetualPool insurance fund ---");
  const insuranceAmount = ethers.utils.parseEther("0.5");
  const tx4 = await perp.depositUsdcToInsurance(tokenAddr, { ...overrides, value: insuranceAmount });
  await tx4.wait();
  console.log("  Deposited", ethers.utils.formatEther(insuranceAmount), "USDC to insurance fund");
  console.log("  Token insurance fund:", ethers.utils.formatEther(await perp.tokenInsuranceFund(tokenAddr)));
  console.log("  Total insurance fund:", ethers.utils.formatEther(await perp.totalInsuranceFund()));

  console.log("\n--- Step 5: Set price in oracle ---");
  try {
    const isAuthorized = await oracle.authorizedUpdaters(perpetualPoolAddr);
    console.log("  PerpetualPool authorized in oracle:", isAuthorized);
    const deployerAuth = await oracle.authorizedUpdaters(wallet.address);
    console.log("  Deployer authorized in oracle:", deployerAuth);

    if (!deployerAuth) {
      console.log("  Authorizing deployer in oracle...");
      const authTx = await oracle.setAuthorizedUpdater(wallet.address, true, overrides);
      await authTx.wait();
      console.log("  Deployer authorized");
    }

    const setPriceTx = await oracle.updateTwapPrice(tokenAddr, ethers.utils.parseEther("0.001"), overrides);
    await setPriceTx.wait();
    console.log("  Price set to 0.001 USDC per token");

    const price = await oracle.getPrice(tokenAddr);
    console.log("  Current price:", ethers.utils.formatEther(price));
  } catch (err) {
    console.error("  Price setup FAILED:", err.message);
  }

  console.log("\n--- Step 6: Open LONG position ---");
  try {
    const marginUsdc = ethers.utils.parseEther("0.05");
    const leverage = ethers.utils.parseEther("3");

    const tx6 = await perp.openPosition(tokenAddr, true, marginUsdc, leverage, { ...overrides, value: marginUsdc });
    const receipt6 = await tx6.wait();
    console.log("  Open LONG position SUCCESS! Gas:", receipt6.gasUsed.toString());

    const pos = await perp.getPosition(wallet.address, tokenAddr);
    console.log("  Position margin:", ethers.utils.formatEther(pos.margin), "USDC");
    console.log("  Position size:", ethers.utils.formatEther(pos.size), "USDC");
    console.log("  Entry price:", ethers.utils.formatEther(pos.entryPrice));
    console.log("  Is long:", pos.isLong);
    console.log("  Is active:", pos.isActive);

    const longOI = await perp.tokenLongOpenInterest(tokenAddr);
    const shortOI = await perp.tokenShortOpenInterest(tokenAddr);
    console.log("  Long OI:", ethers.utils.formatEther(longOI));
    console.log("  Short OI:", ethers.utils.formatEther(shortOI));

    const marginRatio = await perp.getMarginRatio(wallet.address, tokenAddr);
    console.log("  Margin ratio:", ethers.utils.formatEther(marginRatio), "(" + (Number(ethers.utils.formatEther(marginRatio)) * 100).toFixed(2) + "%)");
  } catch (err) {
    console.error("  Open LONG FAILED:", err.message);
  }

  console.log("\n--- Step 7: Close LONG position ---");
  try {
    const tx7 = await perp.closePosition(tokenAddr, overrides);
    const receipt7 = await tx7.wait();
    console.log("  Close LONG position SUCCESS! Gas:", receipt7.gasUsed.toString());

    const pos = await perp.getPosition(wallet.address, tokenAddr);
    console.log("  Is active:", pos.isActive);

    const pnl = await perp.getPnl(wallet.address, tokenAddr);
    console.log("  PnL:", ethers.utils.formatEther(pnl));
  } catch (err) {
    console.error("  Close LONG FAILED:", err.message);
  }

  console.log("\n--- Step 8: Open SHORT position ---");
  try {
    const marginUsdc = ethers.utils.parseEther("0.05");
    const leverage = ethers.utils.parseEther("5");

    const tx8 = await perp.openPosition(tokenAddr, false, marginUsdc, leverage, { ...overrides, value: marginUsdc });
    const receipt8 = await tx8.wait();
    console.log("  Open SHORT position SUCCESS! Gas:", receipt8.gasUsed.toString());

    const pos = await perp.getPosition(wallet.address, tokenAddr);
    console.log("  Position margin:", ethers.utils.formatEther(pos.margin), "USDC");
    console.log("  Position size:", ethers.utils.formatEther(pos.size), "USDC");
    console.log("  Entry price:", ethers.utils.formatEther(pos.entryPrice));
    console.log("  Is long:", pos.isLong);
    console.log("  Is active:", pos.isActive);

    const marginRatio = await perp.getMarginRatio(wallet.address, tokenAddr);
    console.log("  Margin ratio:", ethers.utils.formatEther(marginRatio), "(" + (Number(ethers.utils.formatEther(marginRatio)) * 100).toFixed(2) + "%)");
  } catch (err) {
    console.error("  Open SHORT FAILED:", err.message);
  }

  console.log("\n--- Step 9: Test liquidation scenario ---");
  try {
    const pos = await perp.getPosition(wallet.address, tokenAddr);
    if (pos.isActive) {
      console.log("  Current margin ratio:", ethers.utils.formatEther(await perp.getMarginRatio(wallet.address, tokenAddr)));

      console.log("  Simulating price drop to trigger liquidation...");
      const entryPrice = pos.entryPrice;
      const liquidationPrice = pos.isLong
        ? entryPrice.mul(94).div(100)
        : entryPrice.mul(106).div(100);

      console.log("  Entry price:", ethers.utils.formatEther(entryPrice));
      console.log("  Setting price to:", ethers.utils.formatEther(liquidationPrice));

      const setPriceTx2 = await oracle.updateTwapPrice(tokenAddr, liquidationPrice, overrides);
      await setPriceTx2.wait();

      const newMarginRatio = await perp.getMarginRatio(wallet.address, tokenAddr);
      console.log("  New margin ratio:", ethers.utils.formatEther(newMarginRatio), "(" + (Number(ethers.utils.formatEther(newMarginRatio)) * 100).toFixed(2) + "%)");

      const maintenanceRatio = await perp.MAINTENANCE_MARGIN_RATIO();
      console.log("  Maintenance ratio:", ethers.utils.formatEther(maintenanceRatio), "(" + (Number(ethers.utils.formatEther(maintenanceRatio)) * 100).toFixed(2) + "%)");

      if (newMarginRatio.lt(maintenanceRatio)) {
        console.log("  Position is liquidatable! Attempting liquidation...");

        const tx9 = await perp.liquidate(wallet.address, tokenAddr, overrides);
        const receipt9 = await tx9.wait();
        console.log("  Liquidation SUCCESS! Gas:", receipt9.gasUsed.toString());

        const posAfter = await perp.getPosition(wallet.address, tokenAddr);
        console.log("  Is active after liquidation:", posAfter.isActive);
      } else {
        console.log("  Margin ratio still above maintenance. Closing position normally...");
        const tx9 = await perp.closePosition(tokenAddr, overrides);
        await tx9.wait();
        console.log("  Position closed normally");
      }
    }
  } catch (err) {
    console.error("  Liquidation test FAILED:", err.message);
    try {
      const txClose = await perp.closePosition(tokenAddr, overrides);
      await txClose.wait();
      console.log("  Cleaned up: position closed");
    } catch (e2) {
      console.error("  Cleanup also failed:", e2.message);
    }
  }

  console.log("\n--- Step 10: Final state ---");
  const finalBalance = await provider.getBalance(wallet.address);
  console.log("  Wallet balance:", ethers.utils.formatEther(finalBalance), "USDC");
  console.log("  PerpetualPool balance:", ethers.utils.formatEther(await provider.getBalance(perpetualPoolAddr)), "USDC");
  console.log("  Total insurance fund:", ethers.utils.formatEther(await perp.totalInsuranceFund()));

  const longOI = await perp.tokenLongOpenInterest(tokenAddr);
  const shortOI = await perp.tokenShortOpenInterest(tokenAddr);
  console.log("  Long OI:", ethers.utils.formatEther(longOI));
  console.log("  Short OI:", ethers.utils.formatEther(shortOI));

  console.log("\n=== PerpetualPool E2E Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FATAL:", error.message || error);
    process.exit(1);
  });
