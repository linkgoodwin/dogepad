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

  const bcArtifact = getArtifact("BondingCurve");
  const bc = new ethers.Contract(bondingCurveAddr, bcArtifact.abi, wallet);

  const dlArtifact = getArtifact("DexLister");
  const dl = new ethers.Contract(dexListerAddr, dlArtifact.abi, wallet);

  const daoArtifact = getArtifact("LaunchDAO");
  const dao = new ethers.Contract(launchDaoAddr, daoArtifact.abi, wallet);

  const routerArtifact = getArtifact("SimpleRouter");
  const router = new ethers.Contract(simpleRouterAddr, routerArtifact.abi, wallet);

  const factoryArtifact = getArtifact("SimpleFactory");
  const factory = new ethers.Contract(simpleFactoryAddr, factoryArtifact.abi, wallet);

  const crmArtifact = getArtifact("CreatorRewardManager");
  const crm = new ethers.Contract(creatorRewardMgrAddr, crmArtifact.abi, wallet);

  const spArtifact = getArtifact("PerpetualPool");
  const sp = new ethers.Contract(perpetualPoolAddr, spArtifact.abi, wallet);

  const tokenArtifact = getArtifact("BondingCurveToken");

  console.log("=== E2E Test: BondingCurve Buy → listOnDex → DEX Swap ===\n");
  console.log("BondingCurve:", bondingCurveAddr);
  console.log("DexLister:", dexListerAddr);
  console.log("LaunchDAO:", launchDaoAddr);
  console.log("SimpleRouter:", simpleRouterAddr);
  console.log("Wallet:", wallet.address);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(wallet.address)), "USDC\n");

  console.log("--- Step 1: Verify wiring ---");
  const bcDexLister = await bc.dexLister();
  const bcLaunchDao = await bc.launchDao();
  const dlBondingCurve = await dl.bondingCurve();
  const dlCreatorRewardMgr = await dl.creatorRewardManager();
  const crmDexLister = await crm.dexLister();
  const spDexLister = await sp.dexLister();
  console.log("  bc.dexLister:", bcDexLister, bcDexLister === dexListerAddr ? "✓" : "✗");
  console.log("  bc.launchDao:", bcLaunchDao, bcLaunchDao === launchDaoAddr ? "✓" : "✗");
  console.log("  dl.bondingCurve:", dlBondingCurve, dlBondingCurve === bondingCurveAddr ? "✓" : "✗");
  console.log("  dl.creatorRewardManager:", dlCreatorRewardMgr, dlCreatorRewardMgr === creatorRewardMgrAddr ? "✓" : "✗");
  console.log("  crm.dexLister:", crmDexLister, crmDexLister === dexListerAddr ? "✓" : "✗");
  console.log("  sp.dexLister:", spDexLister, spDexLister === dexListerAddr ? "✓" : "✗");

  console.log("\n--- Step 2: Create token via BondingCurveFactory ---");
  const daoOnlyLaunch = await bc.daoOnlyLaunch();
  if (daoOnlyLaunch) {
    console.log("  Disabling daoOnlyLaunch for test...");
    const txDisable = await bc.setDaoOnlyLaunch(false, overrides);
    await txDisable.wait();
    console.log("  daoOnlyLaunch disabled");
  }

  const currentThreshold = await bc.defaultDexThreshold();
  if (currentThreshold.gt(ethers.utils.parseEther("2.0"))) {
    console.log("  Lowering default DEX threshold to 2.0 USDC for test...");
    const txTh = await bc.setDexThreshold(ethers.utils.parseEther("2.0"), overrides);
    await txTh.wait();
    console.log("  Threshold lowered");
  }

  const factoryAddr = await bc.factory();
  const factoryContract = new ethers.Contract(factoryAddr, getArtifact("BondingCurveFactory").abi, wallet);
  const createFee = await bc.creationFee();
  console.log("  Factory:", factoryAddr);
  console.log("  Create fee:", ethers.utils.formatEther(createFee));

  const tokenName = "E2ETest" + Date.now().toString().slice(-6);
  const tokenSymbol = "E2E";
  const totalSupply = ethers.utils.parseEther("1000000000");
  const tx1 = await factoryContract.createToken(tokenName, tokenSymbol, totalSupply, "ipfs://test", true, true, true, { ...highGasOverrides, value: createFee });
  const receipt1 = await tx1.wait();
  console.log("  Create tx:", receipt1.transactionHash);

  let tokenAddr = null;
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
    console.error("  Could not find token address from events, checking factory tokens...");
    const totalTokens = await factoryContract.totalTokens();
    tokenAddr = await factoryContract.tokens(totalTokens.sub(1));
  }
  console.log("  Token address:", tokenAddr);

  const token = new ethers.Contract(tokenAddr, tokenArtifact.abi, wallet);
  console.log("  Token dexLister:", await token.dexLister());

  console.log("\n--- Step 3: Buy tokens on bonding curve ---");
  const buyAmount = ethers.utils.parseEther("1.5");
  const tx2 = await bc.buy(tokenAddr, 0, wallet.address, { ...overrides, value: buyAmount });
  const receipt2 = await tx2.wait();
  console.log("  Buy tx:", receipt2.transactionHash);

  const tokenInfo = await bc.getTokenInfo(tokenAddr);
  console.log("  Reserve USDC:", ethers.utils.formatEther(tokenInfo.reserveUsdc));
  console.log("  Is listed on DEX:", tokenInfo.isListedOnDex);
  console.log("  DEX listing threshold:", ethers.utils.formatEther(tokenInfo.dexListingThreshold));

  if (!tokenInfo.isListedOnDex) {
    console.log("\n--- Step 3b: Buy more to reach listing threshold ---");
    const info2a = await bc.getTokenInfo(tokenAddr);
    if (info2a.reserveUsdc.lt(info2a.dexListingThreshold)) {
      const needed = info2a.dexListingThreshold.sub(info2a.reserveUsdc).add(ethers.utils.parseEther("0.1"));
      console.log("  Need to buy more:", ethers.utils.formatEther(needed), "USDC");
      const tx2b = await bc.buy(tokenAddr, 0, wallet.address, { ...overrides, value: needed });
      await tx2b.wait();
      const info2b = await bc.getTokenInfo(tokenAddr);
      console.log("  Reserve USDC now:", ethers.utils.formatEther(info2b.reserveUsdc));
      console.log("  Is listed on DEX:", info2b.isListedOnDex);
    }
  }

  console.log("\n--- Step 4: List on DEX ---");
  try {
    const info3 = await bc.getTokenInfo(tokenAddr);
    console.log("  reserveUsdc:", ethers.utils.formatEther(info3.reserveUsdc));
    console.log("  isListedOnDex:", info3.isListedOnDex);

    const tx3 = await bc.listOnDex(tokenAddr, { ...highGasOverrides });
    console.log("  listOnDex tx sent:", tx3.hash);
    const receipt3 = await tx3.wait();
    console.log("  listOnDex SUCCESS! Gas used:", receipt3.gasUsed.toString());

    const dexPair = await token.dexPair();
    console.log("  DEX pair:", dexPair);

    if (dexPair !== ethers.constants.AddressZero) {
      console.log("\n--- Step 5: Swap on DEX (buy tokens with USDC) ---");
      const swapAmount = ethers.utils.parseEther("0.01");

      const wusdcArtifact = getArtifact("SimpleRouter");
      const wusdc = new ethers.Contract(WUSDC, [
        "function deposit() payable",
        "function withdraw(uint256)",
        "function approve(address,uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)"
      ], wallet);

      console.log("  Depositing USDC to WUSDC...");
      const depositTx = await wusdc.deposit({ ...overrides, value: swapAmount });
      await depositTx.wait();
      console.log("  WUSDC balance:", ethers.utils.formatEther(await wusdc.balanceOf(wallet.address)));

      console.log("  Approving WUSDC to router...");
      const approveTx = await wusdc.approve(simpleRouterAddr, swapAmount);
      await approveTx.wait();

      const amountsOut = await router.getAmountsOut(swapAmount, [WUSDC, tokenAddr]);
      const minTokens = amountsOut[1].mul(95).div(100);
      console.log("  Expected tokens out:", ethers.utils.formatEther(amountsOut[1]));
      console.log("  Min tokens:", ethers.utils.formatEther(minTokens));

      const tx4 = await router.swapExactTokensForTokens(
        swapAmount,
        minTokens,
        [WUSDC, tokenAddr],
        wallet.address,
        Math.floor(Date.now() / 1000) + 300,
        { ...overrides }
      );
      const receipt4 = await tx4.wait();
      console.log("  DEX buy swap SUCCESS! Gas used:", receipt4.gasUsed.toString());

      const balanceAfterBuy = await token.balanceOf(wallet.address);
      console.log("  Token balance after DEX buy:", ethers.utils.formatEther(balanceAfterBuy));

      console.log("\n--- Step 6: Swap on DEX (sell tokens for USDC) ---");
      const sellAmount = balanceAfterBuy.div(4);

      console.log("  Approving token to router...");
      const approveTx2 = await token.approve(simpleRouterAddr, sellAmount);
      await approveTx2.wait();

      const amountsOut2 = await router.getAmountsOut(sellAmount, [tokenAddr, WUSDC]);
      const minUsdc = amountsOut2[1].mul(95).div(100);
      console.log("  Sell amount:", ethers.utils.formatEther(sellAmount));
      console.log("  Expected USDC out:", ethers.utils.formatEther(amountsOut2[1]));

      const tx5 = await router.swapExactTokensForTokens(
        sellAmount,
        minUsdc,
        [tokenAddr, WUSDC],
        wallet.address,
        Math.floor(Date.now() / 1000) + 300,
        { ...overrides }
      );
      const receipt5 = await tx5.wait();
      console.log("  DEX sell swap SUCCESS! Gas used:", receipt5.gasUsed.toString());

      const wusdcBalanceAfter = await wusdc.balanceOf(wallet.address);
      console.log("  WUSDC balance after sell:", ethers.utils.formatEther(wusdcBalanceAfter));
    }
  } catch (err) {
    console.error("  listOnDex FAILED:", err.message);
    if (err.data) {
      console.error("  Error data:", err.data);
    }
  }

  console.log("\n=== E2E Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FATAL:", error.message || error);
    process.exit(1);
  });
