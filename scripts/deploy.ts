import { network } from "hardhat";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function setEnvValue(key: string, value: string) {
  const envPath = path.resolve(__dirname, "../.env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, envContent);
}

const PCS_ROUTER_TESTNET = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PCS_ROUTER_MAINNET = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const UNISWAP_V2_ROUTER_MONAD_TESTNET = "0xfB8e1C3b833f9E67a71C859a132cf783b645e436";
const XYLO_ROUTER_ARC_TESTNET = "0x73742278c31a76dBb0D2587d03ef92E6E2141023";
const WUSDC_ARC_TESTNET = "0x911b4000D3422F482F4062a913885f7b035382Df";
const WBNB_BSC = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const WBNB_BSC_TESTNET = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const WMON_MONAD_TESTNET = "0x760AfE86e5de5660dA5373f683c1C053a0351D19";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("\nERROR: DEPLOYER_PRIVATE_KEY not set in .env");
    console.error("Please add your deployer private key to .env:");
    console.error("  DEPLOYER_PRIVATE_KEY=0x_your_private_key_here\n");
    process.exit(1);
  }

  const conn = await network.create();
  const provider = new ethers.providers.Web3Provider(conn.provider);
  const wallet = new ethers.Wallet(pk, provider);
  const deployerAddress = wallet.address;

  const networkInfo = await provider.getNetwork();
  const chainId = networkInfo.chainId;
  const isMainnet = chainId === 56;
  const isMonadTestnet = chainId === 10143;
  const isArcTestnet = chainId === 5042002;

  console.log("========================================");
  console.log("  DogePad Contract Deployment");
  console.log("========================================");
  console.log("Deployer:", deployerAddress);
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(deployerAddress)), isArcTestnet ? "USDC" : isMonadTestnet ? "MON" : "BNB");
  console.log("Chain ID:", chainId.toString());
  console.log("Mode:", isMainnet ? "MAINNET" : isArcTestnet ? "ARC TESTNET" : isMonadTestnet ? "MONAD TESTNET" : "TESTNET");
  console.log("");

  const balance = await provider.getBalance(deployerAddress);
  const minBalance = isMainnet ? "0.5" : "0.05";
  if (balance.lt(ethers.utils.parseEther(minBalance))) {
    console.error(`ERROR: Deployer needs at least ${minBalance} ${isArcTestnet ? 'USDC' : isMonadTestnet ? 'MON' : 'BNB'} to deploy!`);
    if (isArcTestnet) {
      console.error("Get testnet USDC from: https://faucet.circle.com");
    } else if (isMonadTestnet) {
      console.error("Get testnet MON from: https://faucet.monad.xyz");
    } else if (!isMainnet) {
      console.error("Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart");
    }
    process.exit(1);
  }

  let DEX_ROUTER: string;
  let dexName: string;
  let isXyloRouter: boolean;
  let baseAsset: string;
  if (isArcTestnet) {
    DEX_ROUTER = XYLO_ROUTER_ARC_TESTNET;
    dexName = "XyloRouter";
    isXyloRouter = true;
    baseAsset = WUSDC_ARC_TESTNET;
  } else if (isMonadTestnet) {
    DEX_ROUTER = UNISWAP_V2_ROUTER_MONAD_TESTNET;
    dexName = "UniswapV2";
    isXyloRouter = false;
    baseAsset = WMON_MONAD_TESTNET;
  } else {
    DEX_ROUTER = isMainnet ? PCS_ROUTER_MAINNET : PCS_ROUTER_TESTNET;
    dexName = "PancakeSwap";
    isXyloRouter = false;
    baseAsset = isMainnet ? WBNB_BSC : WBNB_BSC_TESTNET;
  }
  console.log(`${dexName} Router:`, DEX_ROUTER, isMainnet ? "(Mainnet)" : isMonadTestnet ? "(Monad Testnet)" : "(Testnet)");
  console.log("");

  const deployOverrides = isArcTestnet ? { gasPrice: 2_000_000_000, gasLimit: 6_000_000 } : {};
  const txOverrides = isArcTestnet ? { gasPrice: 2_000_000_000, gasLimit: 500_000 } : {};

  function getFactory(name: string) {
    const subdirs = ["core", "periphery", "pool", "dao"];
    for (const dir of subdirs) {
      const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${dir}/${name}.sol/${name}.json`);
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
      }
    }
    throw new Error(`Artifact not found for ${name}`);
  }

  console.log("--- Phase 1: Rate Models + Oracle ---");

  const PriceOracle = getFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(deployOverrides);
  await priceOracle.deployed();
  const priceOracleAddr = priceOracle.address;
  console.log("PriceOracle:", priceOracleAddr);

  const ExponentialRateModel = getFactory("ExponentialRateModel");
  const expRateModel = await ExponentialRateModel.deploy(deployOverrides);
  await expRateModel.deployed();
  const expRateModelAddr = expRateModel.address;
  console.log("ExponentialRateModel:", expRateModelAddr);

  const LinearRateModel = getFactory("LinearRateModel");
  const linRateModel = await LinearRateModel.deploy(deployOverrides);
  await linRateModel.deployed();
  const linRateModelAddr = linRateModel.address;
  console.log("LinearRateModel:", linRateModelAddr);

  console.log("\n--- Phase 2: Core (BondingCurve + Factory) ---");

  const BondingCurve = getFactory("BondingCurve");
  const bondingCurve = await BondingCurve.deploy(DEX_ROUTER, deployerAddress, isXyloRouter, baseAsset, deployOverrides);
  await bondingCurve.deployed();
  const bondingCurveAddr = bondingCurve.address;
  console.log("BondingCurve:", bondingCurveAddr, "(feeDistributor=temp:deployer)");

  const BondingCurveFactory = getFactory("BondingCurveFactory");
  const factory = await BondingCurveFactory.deploy(bondingCurveAddr, deployOverrides);
  await factory.deployed();
  const factoryAddr = factory.address;
  console.log("BondingCurveFactory:", factoryAddr);

  await bondingCurve.setFactory(factoryAddr, txOverrides);
  console.log("  -> BondingCurve.factory set");

  console.log("\n--- Phase 3: BuyAndBurn ---");

  const BuyAndBurnEngine = getFactory("BuyAndBurnEngine");
  const burnEngine = await BuyAndBurnEngine.deploy(DEX_ROUTER, deployerAddress, isXyloRouter, baseAsset, deployOverrides);
  await burnEngine.deployed();
  const burnEngineAddr = burnEngine.address;
  console.log("BuyAndBurnEngine:", burnEngineAddr);

  console.log("\n--- Phase 4: FeeDistributor ---");

  const FeeDistributor = getFactory("FeeDistributor");
  const feeDist = await FeeDistributor.deploy(
    ethers.constants.AddressZero,
    DEX_ROUTER,
    burnEngineAddr,
    baseAsset,
    deployOverrides
  );
  await feeDist.deployed();
  const feeDistAddr = feeDist.address;
  console.log("FeeDistributor:", feeDistAddr, "(fairToken=ZeroAddress, pending DOGE token)");

  console.log("\n--- Phase 5: PerpetualPool ---");

  const PerpetualPool = getFactory("PerpetualPool");
  const perpetualPool = await PerpetualPool.deploy(priceOracleAddr, burnEngineAddr, deployerAddress, deployOverrides);
  await perpetualPool.deployed();
  const perpetualPoolAddr = perpetualPool.address;
  console.log("PerpetualPool:", perpetualPoolAddr);

  await bondingCurve.setPerpetualPool(perpetualPoolAddr, txOverrides);
  console.log("  -> BondingCurve.perpetualPool set");

  await bondingCurve.setBuyAndBurnEngine(burnEngineAddr, txOverrides);
  await bondingCurve.setPriceOracle(priceOracleAddr, txOverrides);
  console.log("  -> BondingCurve.burnEngine + priceOracle set");

  await perpetualPool.setBondingCurve(bondingCurveAddr, txOverrides);
  console.log("  -> PerpetualPool.bondingCurve set");

  console.log("\n--- Phase 6: LaunchDAO ---");

  const LaunchDAO = getFactory("LaunchDAO");
  const launchDao = await LaunchDAO.deploy(bondingCurveAddr, deployerAddress, deployOverrides);
  await launchDao.deployed();
  const launchDaoAddr = launchDao.address;
  console.log("LaunchDAO:", launchDaoAddr, "(feeDistributor=temp:deployer)");

  await bondingCurve.setLaunchDao(launchDaoAddr, txOverrides);
  await bondingCurve.setDaoOnlyLaunch(true, txOverrides);
  console.log("  -> BondingCurve.launchDao set + daoOnlyLaunch enabled");

  console.log("\n--- Phase 7: CreatorRewardManager ---");

  const CreatorRewardManager = getFactory("CreatorRewardManager");
  const creatorRewardMgr = await CreatorRewardManager.deploy(bondingCurveAddr, deployOverrides);
  await creatorRewardMgr.deployed();
  const creatorRewardMgrAddr = creatorRewardMgr.address;
  console.log("CreatorRewardManager:", creatorRewardMgrAddr);

  await bondingCurve.setCreatorRewardManager(creatorRewardMgrAddr, txOverrides);
  console.log("  -> BondingCurve.creatorRewardManager set");

  console.log("\n--- Phase 8: Final Wiring ---");

  await bondingCurve.setFeeDistributor(feeDistAddr, txOverrides);
  console.log("  -> BondingCurve.feeDistributor updated:", feeDistAddr);

  await launchDao.setFeeDistributor(feeDistAddr, txOverrides);
  console.log("  -> LaunchDAO.feeDistributor updated:", feeDistAddr);

  await perpetualPool.setPlatformTreasury(feeDistAddr, txOverrides);
  console.log("  -> PerpetualPool.platformTreasury updated:", feeDistAddr);

  await priceOracle.setAuthorizedUpdater(bondingCurveAddr, true, txOverrides);
  await priceOracle.setAuthorizedUpdater(perpetualPoolAddr, true, txOverrides);
  console.log("  -> PriceOracle: updaters authorized (bondingCurve, perpetualPool)");

  console.log("\n========================================");
  console.log("  Writing addresses to .env ...");
  console.log("========================================");

  const prefix = isArcTestnet ? 'VITE_ARC_TESTNET' : isMonadTestnet ? 'VITE_MONAD_TESTNET' : isMainnet ? 'VITE_MAINNET' : 'VITE_TESTNET';

  setEnvValue(`${prefix}_BONDING_CURVE_ADDRESS`, bondingCurveAddr);
  setEnvValue(`${prefix}_FACTORY_ADDRESS`, factoryAddr);
  setEnvValue(`${prefix}_PERPETUAL_POOL_ADDRESS`, perpetualPoolAddr);
  setEnvValue(`${prefix}_BUY_AND_BURN_ADDRESS`, burnEngineAddr);
  setEnvValue(`${prefix}_LAUNCH_DAO_ADDRESS`, launchDaoAddr);
  setEnvValue(`${prefix}_PRICE_ORACLE_ADDRESS`, priceOracleAddr);
  setEnvValue(`${prefix}_FEE_DISTRIBUTOR_ADDRESS`, feeDistAddr);
  setEnvValue(`${prefix}_CREATOR_REWARD_MANAGER_ADDRESS`, creatorRewardMgrAddr);
  setEnvValue(`${prefix}_EXP_RATE_MODEL_ADDRESS`, expRateModelAddr);
  setEnvValue(`${prefix}_LIN_RATE_MODEL_ADDRESS`, linRateModelAddr);
  setEnvValue("VITE_CHAIN_ID", chainId.toString());

  console.log("Done! Contract addresses saved to .env");
  console.log(`  Network: ${isMainnet ? "MAINNET" : isArcTestnet ? "ARC TESTNET" : isMonadTestnet ? "MONAD TESTNET" : "TESTNET"}`);
  console.log(`  Prefix:  ${prefix}_*`);

  console.log("\n========================================");
  console.log("  ALL CONTRACTS DEPLOYED SUCCESSFULLY");
  console.log("========================================\n");

  console.log(JSON.stringify({
    priceOracle: priceOracleAddr,
    exponentialRateModel: expRateModelAddr,
    linearRateModel: linRateModelAddr,
    bondingCurve: bondingCurveAddr,
    bondingCurveFactory: factoryAddr,
    perpetualPool: perpetualPoolAddr,
    buyAndBurnEngine: burnEngineAddr,
    launchDao: launchDaoAddr,
    feeDistributor: feeDistAddr,
    creatorRewardManager: creatorRewardMgrAddr,
  }, null, 2));

  console.log("\n========================================");
  console.log("  POST-DEPLOYMENT REMINDERS");
  console.log("========================================");
  console.log("1. FeeDistributor.setFairToken(dogeTokenAddr) - call after DOGE token is created");
  console.log("2. LaunchDAO.setFairToken(dogeTokenAddr) - call after DOGE token is created");
  console.log("3. BuyAndBurnEngine.setKeeper(keeperAddr) - update keeper from deployer if needed");
  console.log("4. Transfer ownership of all contracts to multisig/governance for production");
  console.log("");

  await conn.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error.message || error);
    process.exit(1);
  });
