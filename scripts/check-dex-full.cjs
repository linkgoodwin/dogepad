const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

const ADDRESSES = {
  SimpleFactory: "0xf1b805AF51f8eC789D05aA7c981234C9d854357C",
  SimpleRouter:  "0x6C59fc8e5a4e0CFF1cfD050f1f73B7eA4a49992B",
  DOGE:          "0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c",
  WUSDC:         "0x911b4000D3422F482F4062a913885f7b035382Df",
  BondingCurve:  "0x569944C02A15aAdB5F9D1999e202463e9860F473",
  DexLister:     "0x020bF89469a2bc4C3f91d02AB71E42a481462ebA",
  PriceOracle:   "0xF6ad299b59581CE3AA5eeec00da72bdE0Ce8846A",
  PerpetualPool: "0xB80d0029fc09Ae790Fc89eF629C48A1bD3c89812",
  DAO:           "0x58D1bC74355C11fF01d04b58251bbf118a19259F",
};

const SIMPLE_FACTORY_ABI = [
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function getPair(address, address) view returns (address)",
  "function owner() view returns (address)",
];

const SIMPLE_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint256, uint256, uint256)",
  "function totalSupply() view returns (uint256)",
];

const SIMPLE_ROUTER_ABI = [
  "function factory() view returns (address)",
  "function wusdc() view returns (address)",
];

const BONDING_CURVE_TOKEN_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function dexPair() view returns (address)",
  "function bondingCurve() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const WUSDC_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const BONDING_CURVE_ABI = [
  "function launchDao() view returns (address)",
  "function getTokenInfo(address) view returns (address tokenAddress, address creator, uint256 totalSupply, uint256 reserveUsdc, uint256 tokensSold, bool isListedOnDex, uint256 dexListingThreshold, string metadataURI)",
  "function isListed(address) view returns (bool)",
  "function dexLister() view returns (address)",
  "function factory() view returns (address)",
  "function dexRouter() view returns (address)",
  "function baseAsset() view returns (address)",
  "function perpetualPool() view returns (address)",
  "function priceOracle() view returns (address)",
  "function owner() view returns (address)",
];

const DEX_LISTER_ABI = [
  "function bondingCurve() view returns (address)",
  "function dexRouter() view returns (address)",
  "function baseAsset() view returns (address)",
  "function perpetualPool() view returns (address)",
  "function owner() view returns (address)",
  "function lpUsdcRatio() view returns (uint256)",
  "function lpTokenRatio() view returns (uint256)",
  "function perpPoolUsdcRatio() view returns (uint256)",
  "function perpPoolTokenRatio() view returns (uint256)",
];

const PRICE_ORACLE_ABI = [
  "function owner() view returns (address)",
  "function getPrice(address) view returns (uint256)",
  "function twapPrices(address) view returns (uint256)",
  "function lastUpdateTime(address) view returns (uint256)",
  "function effectivePrice(address) view returns (uint256)",
  "function effectivePriceTime(address) view returns (uint256)",
  "function MAX_PRICE_AGE() view returns (uint256)",
  "function authorizedUpdaters(address) view returns (bool)",
];

const PERPETUAL_POOL_ABI = [
  "function oracle() view returns (address)",
  "function burnEngine() view returns (address)",
  "function bondingCurve() view returns (address)",
  "function dexLister() view returns (address)",
  "function owner() view returns (address)",
  "function isTokenListedForPerp(address) view returns (bool)",
  "function defaultToken() view returns (address)",
  "function getMarkPrice(address) view returns (uint256)",
  "function getOpenInterest(address) view returns (uint256 longOI, uint256 shortOI)",
  "function getListedTokens() view returns (address[])",
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC, CHAIN_ID);

  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  console.log(`\n=== Network Info ===`);
  console.log(`Block: ${blockNumber}  Timestamp: ${block.timestamp}  Date: ${new Date(block.timestamp * 1000).toISOString()}`);

  // ============================================================
  // 1. SimpleFactory
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`1. SimpleFactory (${ADDRESSES.SimpleFactory})`);
  console.log(`${"=".repeat(60)}`);

  const factory = new ethers.Contract(ADDRESSES.SimpleFactory, SIMPLE_FACTORY_ABI, provider);

  try {
    // Check if contract has code
    const factoryCode = await provider.getCode(ADDRESSES.SimpleFactory);
    console.log(`Contract code size: ${factoryCode.length}`);

    let pairsLength;
    try {
      pairsLength = await factory.allPairsLength();
      console.log(`allPairsLength: ${pairsLength}`);
    } catch (e) {
      console.log(`allPairsLength: REVERTED - ${e.message.split(';')[0]}`);
      // Try to enumerate pairs by using getPair with known tokens
      console.log(`  Trying to find pairs via getPair instead...`);
    }

    // Always check the known DOGE-WUSDC pair
    const dogeWusdcPair = await factory.getPair(ADDRESSES.DOGE, ADDRESSES.WUSDC);
    console.log(`getPair(DOGE, WUSDC): ${dogeWusdcPair}`);

    // Collect all pair addresses we know about
    const pairAddresses = [];
    if (pairsLength && pairsLength > 0) {
      for (let i = 0; i < pairsLength; i++) {
        try {
          const pairAddr = await factory.allPairs(i);
          pairAddresses.push(pairAddr);
        } catch (e) {
          console.log(`  allPairs(${i}): ERROR - ${e.message.split(';')[0]}`);
        }
      }
    }
    // Add the known pair if not already in the list
    if (dogeWusdcPair && dogeWusdcPair !== ethers.constants.AddressZero && !pairAddresses.includes(dogeWusdcPair)) {
      pairAddresses.push(dogeWusdcPair);
    }

    for (const pairAddr of pairAddresses) {
      console.log(`\n  Pair: ${pairAddr}`);

      const pair = new ethers.Contract(pairAddr, SIMPLE_PAIR_ABI, provider);
      try {
        const token0 = await pair.token0();
        const token1 = await pair.token1();
        const [reserve0, reserve1, timestampLast] = await pair.getReserves();
        const lpSupply = await pair.totalSupply();

        console.log(`    token0: ${token0}`);
        console.log(`    token1: ${token1}`);
        console.log(`    reserve0: ${ethers.utils.formatEther(reserve0)}`);
        console.log(`    reserve1: ${ethers.utils.formatEther(reserve1)}`);
        console.log(`    timestampLast: ${timestampLast}`);
        console.log(`    LP totalSupply: ${ethers.utils.formatEther(lpSupply)}`);
      } catch (e) {
        console.log(`    ERROR reading pair data: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 2. SimpleRouter
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`2. SimpleRouter (${ADDRESSES.SimpleRouter})`);
  console.log(`${"=".repeat(60)}`);

  const router = new ethers.Contract(ADDRESSES.SimpleRouter, SIMPLE_ROUTER_ABI, provider);

  try {
    const factoryAddr = await router.factory();
    const wusdcAddr = await router.wusdc();
    console.log(`factory: ${factoryAddr}`);
    console.log(`wusdc:   ${wusdcAddr}`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 3. DOGE Token (BondingCurveToken)
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`3. DOGE Token (${ADDRESSES.DOGE})`);
  console.log(`${"=".repeat(60)}`);

  const doge = new ethers.Contract(ADDRESSES.DOGE, BONDING_CURVE_TOKEN_ABI, provider);

  try {
    const name = await doge.name();
    const symbol = await doge.symbol();
    const totalSupply = await doge.totalSupply();
    const dexPair = await doge.dexPair();
    const bondingCurveAddr = await doge.bondingCurve();
    const balanceDAO = await doge.balanceOf(ADDRESSES.DAO);
    const balanceFactory = await doge.balanceOf(ADDRESSES.SimpleFactory);
    const balanceRouter = await doge.balanceOf(ADDRESSES.SimpleRouter);

    console.log(`name:          ${name}`);
    console.log(`symbol:        ${symbol}`);
    console.log(`totalSupply:   ${ethers.utils.formatEther(totalSupply)}`);
    console.log(`dexPair:       ${dexPair}`);
    console.log(`bondingCurve:  ${bondingCurveAddr}`);
    console.log(`balanceOf(DAO):       ${ethers.utils.formatEther(balanceDAO)}`);
    console.log(`balanceOf(Factory):   ${ethers.utils.formatEther(balanceFactory)}`);
    console.log(`balanceOf(Router):    ${ethers.utils.formatEther(balanceRouter)}`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // Check isListed via BondingCurve
  const bc = new ethers.Contract(ADDRESSES.BondingCurve, BONDING_CURVE_ABI, provider);
  try {
    const isListed = await bc.isListed(ADDRESSES.DOGE);
    console.log(`isListed (via BondingCurve): ${isListed}`);
  } catch (e) {
    console.log(`isListed: ERROR - ${e.message}`);
  }

  // ============================================================
  // 4. WUSDC
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`4. WUSDC (${ADDRESSES.WUSDC})`);
  console.log(`${"=".repeat(60)}`);

  const wusdc = new ethers.Contract(ADDRESSES.WUSDC, WUSDC_ABI, provider);

  try {
    const name = await wusdc.name();
    const symbol = await wusdc.symbol();
    const totalSupply = await wusdc.totalSupply();
    console.log(`name:        ${name}`);
    console.log(`symbol:      ${symbol}`);
    console.log(`totalSupply: ${ethers.utils.formatEther(totalSupply)}`);

    // Find DOGE-WUSDC pair
    const dogeWusdcPair = await factory.getPair(ADDRESSES.DOGE, ADDRESSES.WUSDC);
    console.log(`DOGE-WUSDC pair (from factory): ${dogeWusdcPair}`);

    if (dogeWusdcPair && dogeWusdcPair !== ethers.constants.AddressZero) {
      const wusdcBalInPair = await wusdc.balanceOf(dogeWusdcPair);
      console.log(`WUSDC balanceOf(DOGE-WUSDC pair): ${ethers.utils.formatEther(wusdcBalInPair)}`);
    } else {
      console.log(`DOGE-WUSDC pair does not exist`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 5. BondingCurve
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`5. BondingCurve (${ADDRESSES.BondingCurve})`);
  console.log(`${"=".repeat(60)}`);

  try {
    const launchDao = await bc.launchDao();
    const dexRouter = await bc.dexRouter();
    const baseAsset = await bc.baseAsset();
    const bcFactory = await bc.factory();
    const bcDexLister = await bc.dexLister();
    const bcPerpetualPool = await bc.perpetualPool();
    const bcPriceOracle = await bc.priceOracle();
    const bcOwner = await bc.owner();

    console.log(`launchDao:      ${launchDao}`);
    console.log(`  Expected DAO: ${ADDRESSES.DAO}`);
    console.log(`  Match:        ${launchDao.toLowerCase() === ADDRESSES.DAO.toLowerCase()}`);
    console.log(`dexRouter:      ${dexRouter}`);
    console.log(`baseAsset:      ${baseAsset}`);
    console.log(`factory:        ${bcFactory}`);
    console.log(`dexLister:      ${bcDexLister}`);
    console.log(`perpetualPool:  ${bcPerpetualPool}`);
    console.log(`priceOracle:    ${bcPriceOracle}`);
    console.log(`owner:          ${bcOwner}`);

    // getTokenInfo for DOGE
    const tokenInfo = await bc.getTokenInfo(ADDRESSES.DOGE);
    console.log(`\ngetTokenInfo(DOGE):`);
    console.log(`  tokenAddress:       ${tokenInfo.tokenAddress}`);
    console.log(`  creator:            ${tokenInfo.creator}`);
    console.log(`  totalSupply:        ${ethers.utils.formatEther(tokenInfo.totalSupply)}`);
    console.log(`  reserveUsdc:        ${ethers.utils.formatEther(tokenInfo.reserveUsdc)}`);
    console.log(`  tokensSold:         ${ethers.utils.formatEther(tokenInfo.tokensSold)}`);
    console.log(`  isListedOnDex:      ${tokenInfo.isListedOnDex}`);
    console.log(`  dexListingThreshold:${ethers.utils.formatEther(tokenInfo.dexListingThreshold)}`);
    console.log(`  metadataURI:        ${tokenInfo.metadataURI}`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 6. DexLister
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`6. DexLister (${ADDRESSES.DexLister})`);
  console.log(`${"=".repeat(60)}`);

  const dexLister = new ethers.Contract(ADDRESSES.DexLister, DEX_LISTER_ABI, provider);

  try {
    const dlBondingCurve = await dexLister.bondingCurve();
    const dlDexRouter = await dexLister.dexRouter();
    const dlBaseAsset = await dexLister.baseAsset();
    const dlPerpetualPool = await dexLister.perpetualPool();
    const dlOwner = await dexLister.owner();
    const lpUsdcRatio = await dexLister.lpUsdcRatio();
    const lpTokenRatio = await dexLister.lpTokenRatio();
    const perpPoolUsdcRatio = await dexLister.perpPoolUsdcRatio();
    const perpPoolTokenRatio = await dexLister.perpPoolTokenRatio();

    console.log(`bondingCurve:       ${dlBondingCurve}`);
    console.log(`dexRouter:          ${dlDexRouter}`);
    console.log(`baseAsset:          ${dlBaseAsset}`);
    console.log(`perpetualPool:      ${dlPerpetualPool}`);
    console.log(`owner:              ${dlOwner}`);
    console.log(`lpUsdcRatio:        ${lpUsdcRatio}%`);
    console.log(`lpTokenRatio:       ${lpTokenRatio}%`);
    console.log(`perpPoolUsdcRatio:  ${perpPoolUsdcRatio}%`);
    console.log(`perpPoolTokenRatio: ${perpPoolTokenRatio}%`);

    // Check if DOGE has been listOnDex by checking BondingCurve tokenInfo.isListedOnDex
    // and also checking if the DOGE token has a dexPair set
    const dogeDexPair = await doge.dexPair();
    console.log(`\nDOGE dexPair (from token contract): ${dogeDexPair}`);
    if (dogeDexPair !== ethers.constants.AddressZero) {
      console.log(`  => DOGE has been listed on DEX (dexPair is set)`);
    } else {
      console.log(`  => DOGE has NOT been listed on DEX yet (dexPair is zero)`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 7. PriceOracle
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`7. PriceOracle (${ADDRESSES.PriceOracle})`);
  console.log(`${"=".repeat(60)}`);

  const oracle = new ethers.Contract(ADDRESSES.PriceOracle, PRICE_ORACLE_ABI, provider);

  try {
    const owner = await oracle.owner();
    const maxPriceAge = await oracle.MAX_PRICE_AGE();
    const isAuthBondingCurve = await oracle.authorizedUpdaters(ADDRESSES.BondingCurve);

    console.log(`owner:                      ${owner}`);
    console.log(`MAX_PRICE_AGE:              ${maxPriceAge}s (${Number(maxPriceAge) / 3600}h)`);
    console.log(`authorizedUpdaters(BC):     ${isAuthBondingCurve}`);

    // twapPrices for DOGE
    const twapPrice = await oracle.twapPrices(ADDRESSES.DOGE);
    const lastUpdate = await oracle.lastUpdateTime(ADDRESSES.DOGE);
    const effPrice = await oracle.effectivePrice(ADDRESSES.DOGE);
    const effPriceTime = await oracle.effectivePriceTime(ADDRESSES.DOGE);

    console.log(`\ntwapPrices(DOGE):           ${twapPrice.toString()}`);
    console.log(`  => formatted:             ${ethers.utils.formatEther(twapPrice)}`);
    console.log(`lastUpdateTime(DOGE):       ${lastUpdate}  (${new Date(Number(lastUpdate) * 1000).toISOString()})`);
    console.log(`effectivePrice(DOGE):       ${effPrice.toString()}`);
    console.log(`  => formatted:             ${ethers.utils.formatEther(effPrice)}`);
    console.log(`effectivePriceTime(DOGE):   ${effPriceTime}  (${new Date(Number(effPriceTime) * 1000).toISOString()})`);

    // Check staleness
    const now = block.timestamp;
    const age = now - Number(lastUpdate);
    const isStale = age > Number(maxPriceAge);
    console.log(`\nPrice age: ${age}s (${(age / 60).toFixed(1)}min)`);
    console.log(`Price is stale: ${isStale}`);

    // Try getPrice
    try {
      const price = await oracle.getPrice(ADDRESSES.DOGE);
      console.log(`getPrice(DOGE): ${ethers.utils.formatEther(price)}`);
    } catch (e) {
      console.log(`getPrice(DOGE): REVERTED - ${e.message}`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // ============================================================
  // 8. PerpetualPool
  // ============================================================
  console.log(`\n${"=".repeat(60)}`);
  console.log(`8. PerpetualPool (${ADDRESSES.PerpetualPool})`);
  console.log(`${"=".repeat(60)}`);

  const perpPool = new ethers.Contract(ADDRESSES.PerpetualPool, PERPETUAL_POOL_ABI, provider);

  try {
    const oracleAddr = await perpPool.oracle();
    const burnEngine = await perpPool.burnEngine();
    const ppBondingCurve = await perpPool.bondingCurve();
    const ppDexLister = await perpPool.dexLister();
    const ppOwner = await perpPool.owner();
    const defaultToken = await perpPool.defaultToken();
    const isDOGEListed = await perpPool.isTokenListedForPerp(ADDRESSES.DOGE);

    console.log(`oracle:              ${oracleAddr}`);
    console.log(`  Expected oracle:   ${ADDRESSES.PriceOracle}`);
    console.log(`  Match:             ${oracleAddr.toLowerCase() === ADDRESSES.PriceOracle.toLowerCase()}`);
    console.log(`burnEngine:          ${burnEngine}`);
    console.log(`bondingCurve:        ${ppBondingCurve}`);
    console.log(`dexLister:           ${ppDexLister}`);
    console.log(`owner:               ${ppOwner}`);
    console.log(`defaultToken:        ${defaultToken}`);
    console.log(`isTokenListedForPerp(DOGE): ${isDOGEListed}`);

    // Open interest for DOGE
    try {
      const [longOI, shortOI] = await perpPool.getOpenInterest(ADDRESSES.DOGE);
      console.log(`DOGE longOI:   ${ethers.utils.formatEther(longOI)}`);
      console.log(`DOGE shortOI:  ${ethers.utils.formatEther(shortOI)}`);
    } catch (e) {
      console.log(`getOpenInterest(DOGE): ERROR - ${e.message}`);
    }

    // Get mark price for DOGE
    try {
      const markPrice = await perpPool.getMarkPrice(ADDRESSES.DOGE);
      console.log(`getMarkPrice(DOGE): ${ethers.utils.formatEther(markPrice)}`);
    } catch (e) {
      console.log(`getMarkPrice(DOGE): REVERTED - ${e.message}`);
    }

    // Listed tokens
    try {
      const listedTokens = await perpPool.getListedTokens();
      console.log(`listedTokens: ${listedTokens.join(", ") || "(none)"}`);
    } catch (e) {
      console.log(`getListedTokens: ERROR - ${e.message}`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Check complete.`);
  console.log(`${"=".repeat(60)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
