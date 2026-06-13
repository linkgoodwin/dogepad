/**
 * Debug script: Simulates the EXACT data reading chain that the frontend ExternalTradePanel does.
 * Step-by-step reads with timing and error reporting.
 *
 * RPC: https://rpc.testnet.arc.network
 * Chain ID: 5042002
 */

const { ethers } = require('ethers')

const RPC_URL = 'https://rpc.testnet.arc.network'
const CHAIN_ID = 5042002

const ADDRESSES = {
  bondingCurve: '0x569944C02A15aAdB5F9D1999e202463e9860F473',
  simpleRouter: '0x6C59fc8e5a4e0CFF1cfD050f1f73B7eA4a49992B',
  simpleFactory: '0xf1b805AF51f8eC789D05aA7c981234C9d854357C',
  wusdc: '0x911b4000D3422F482F4062a913885f7b035382Df',
  dogeToken: '0xe2B1CbF3b81894e24B3f57830f0071aDBBF9b13c',
  dogeWusdcPair: '0xD485fb189dFeA2F445856A552994d2c8051778ea',
}

// ---- ABIs (matching frontend exactly) ----

const BONDING_CURVE_ABI = [
  {
    inputs: [],
    name: 'dexRouter',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'baseAsset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isXyloRouter',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
]

const ROUTER_FACTORY_ABI = [
  {
    type: 'function',
    name: 'factory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
]

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getPair',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'address' }],
  },
]

// Frontend uses uint256 (matching SimplePair.sol which returns uint256)
const PAIR_ABI_UINT256 = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
]

// Uniswap V2 style (uint112) — test if this causes issues
const PAIR_ABI_UINT112 = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
  },
]

// ---- Quote function (same as frontend) ----
function quote(amountIn, reserveIn, reserveOut) {
  if (reserveIn === BigInt(0) || reserveOut === BigInt(0) || amountIn === BigInt(0)) return BigInt(0)
  const amountInWithFee = amountIn * BigInt(997)
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn * BigInt(1000) + amountInWithFee
  return numerator / denominator
}

async function main() {
  console.log('=== Debug Frontend Data Reading Chain ===')
  console.log(`RPC: ${RPC_URL}`)
  console.log(`Chain ID: ${CHAIN_ID}`)
  console.log('')

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, CHAIN_ID)

  // Quick connectivity check
  let networkInfo
  try {
    const t0 = Date.now()
    networkInfo = await provider.getNetwork()
    console.log(`[Network] chainId=${networkInfo.chainId}, name=${networkInfo.name} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`[FATAL] Cannot connect to RPC: ${err.message}`)
    process.exit(1)
  }

  // Also check block number
  try {
    const t0 = Date.now()
    const blockNum = await provider.getBlockNumber()
    console.log(`[Block] current block number: ${blockNum} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`[WARN] Cannot get block number: ${err.message}`)
  }
  console.log('')

  // ---- Step 1: Read BondingCurve.dexRouter() ----
  console.log('--- Step 1: BondingCurve.dexRouter() ---')
  let dexRouter
  try {
    const t0 = Date.now()
    const bc = new ethers.Contract(ADDRESSES.bondingCurve, BONDING_CURVE_ABI, provider)
    dexRouter = await bc.dexRouter()
    console.log(`  Result: ${dexRouter} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 2: Read BondingCurve.baseAsset() ----
  console.log('--- Step 2: BondingCurve.baseAsset() ---')
  let baseAsset
  try {
    const t0 = Date.now()
    const bc = new ethers.Contract(ADDRESSES.bondingCurve, BONDING_CURVE_ABI, provider)
    baseAsset = await bc.baseAsset()
    console.log(`  Result: ${baseAsset} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 3: Read BondingCurve.isXyloRouter() ----
  console.log('--- Step 3: BondingCurve.isXyloRouter() ---')
  let isXyloRouter
  try {
    const t0 = Date.now()
    const bc = new ethers.Contract(ADDRESSES.bondingCurve, BONDING_CURVE_ABI, provider)
    isXyloRouter = await bc.isXyloRouter()
    console.log(`  Result: ${isXyloRouter} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 4: Read SimpleRouter.factory() ----
  console.log('--- Step 4: SimpleRouter.factory() ---')
  let factoryAddress
  try {
    const t0 = Date.now()
    const router = new ethers.Contract(ADDRESSES.simpleRouter, ROUTER_FACTORY_ABI, provider)
    factoryAddress = await router.factory()
    console.log(`  Result: ${factoryAddress} (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 5: Read SimpleFactory.getPair(WUSDC, DOGE) ----
  console.log('--- Step 5: SimpleFactory.getPair(WUSDC, DOGE) ---')
  let pairAddress
  try {
    const t0 = Date.now()
    const factory = new ethers.Contract(ADDRESSES.simpleFactory, FACTORY_ABI, provider)
    pairAddress = await factory.getPair(ADDRESSES.wusdc, ADDRESSES.dogeToken)
    console.log(`  Result: ${pairAddress} (${Date.now() - t0}ms)`)
    if (pairAddress === ethers.constants.AddressZero) {
      console.log('  WARNING: getPair returned zero address — pair does not exist!')
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 6: Read Pair.token0() ----
  console.log('--- Step 6: Pair(DOGE-WUSDC).token0() ---')
  let token0
  const pairToRead = pairAddress && pairAddress !== ethers.constants.AddressZero ? pairAddress : ADDRESSES.dogeWusdcPair
  try {
    const t0 = Date.now()
    const pair = new ethers.Contract(pairToRead, PAIR_ABI_UINT256, provider)
    token0 = await pair.token0()
    console.log(`  Result: ${token0} (${Date.now() - t0}ms)`)
    console.log(`  token0 is WUSDC? ${token0.toLowerCase() === ADDRESSES.wusdc.toLowerCase()}`)
    console.log(`  token0 is DOGE?  ${token0.toLowerCase() === ADDRESSES.dogeToken.toLowerCase()}`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Step 7: Read Pair.getReserves() — with BOTH ABI types ----
  console.log('--- Step 7a: Pair.getReserves() with uint256 ABI (frontend style) ---')
  let reserves256
  try {
    const t0 = Date.now()
    const pair = new ethers.Contract(pairToRead, PAIR_ABI_UINT256, provider)
    reserves256 = await pair.getReserves()
    console.log(`  Result type: ${typeof reserves256}, is array: ${Array.isArray(reserves256)}`)
    console.log(`  Raw values:`)
    if (Array.isArray(reserves256) || (reserves256 && typeof reserves256 === 'object')) {
      for (let i = 0; i < 3; i++) {
        const val = reserves256[i]
        console.log(`    [${i}] = ${val.toString()} (type: ${typeof val}, constructor: ${val.constructor.name})`)
        console.log(`         hex: ${val.toHexString ? val.toHexString() : 'N/A'}`)
      }
    }
    console.log(`  (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
    if (err.reason) console.error(`  Reason: ${err.reason}`)
    if (err.code) console.error(`  Code: ${err.code}`)
    if (err.data) console.error(`  Data: ${err.data}`)
  }

  console.log('--- Step 7b: Pair.getReserves() with uint112 ABI (Uniswap V2 style) ---')
  let reserves112
  try {
    const t0 = Date.now()
    const pair = new ethers.Contract(pairToRead, PAIR_ABI_UINT112, provider)
    reserves112 = await pair.getReserves()
    console.log(`  Result type: ${typeof reserves112}, is array: ${Array.isArray(reserves112)}`)
    console.log(`  Raw values:`)
    if (Array.isArray(reserves112) || (reserves112 && typeof reserves112 === 'object')) {
      for (let i = 0; i < 3; i++) {
        const val = reserves112[i]
        console.log(`    [${i}] = ${val.toString()} (type: ${typeof val}, constructor: ${val.constructor.name})`)
        console.log(`         hex: ${val.toHexString ? val.toHexString() : 'N/A'}`)
      }
    }
    console.log(`  (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
    if (err.reason) console.error(`  Reason: ${err.reason}`)
    if (err.code) console.error(`  Code: ${err.code}`)
    if (err.data) console.error(`  Data: ${err.data}`)
  }

  // Compare the two results
  if (reserves256 && reserves112) {
    console.log('--- Step 7c: Comparison of uint256 vs uint112 results ---')
    const match0 = reserves256[0].eq(reserves112[0])
    const match1 = reserves256[1].eq(reserves112[1])
    const match2 = reserves256[2].eq(reserves112[2])
    console.log(`  reserve0 match: ${match0}`)
    console.log(`  reserve1 match: ${match1}`)
    console.log(`  timestamp match: ${match2}`)
    if (!match0 || !match1) {
      console.log(`  DIFFERENCE DETECTED!`)
      console.log(`    uint256: [${reserves256[0].toString()}, ${reserves256[1].toString()}, ${reserves256[2].toString()}]`)
      console.log(`    uint112: [${reserves112[0].toString()}, ${reserves112[1].toString()}, ${reserves112[2].toString()}]`)
    }
  }

  // ---- Step 8: Calculate estimated output for buying 1 USDC worth of DOGE ----
  console.log('')
  console.log('--- Step 8: Quote — Buy 1 USDC worth of DOGE ---')
  if (reserves256 && token0 && baseAsset) {
    const buyAmountIn = ethers.utils.parseEther('1') // 1 USDC (18 decimals)
    const r0 = BigInt(reserves256[0].toString())
    const r1 = BigInt(reserves256[1].toString())

    // Determine which reserve is USDC and which is DOGE
    const tokenIsToken0 = ADDRESSES.dogeToken.toLowerCase() < baseAsset.toLowerCase()
    const reserveUsdc = tokenIsToken0 ? r1 : r0
    const reserveTokens = tokenIsToken0 ? r0 : r1

    console.log(`  tokenIsToken0 (DOGE < WUSDC): ${tokenIsToken0}`)
    console.log(`  token0: ${token0}`)
    console.log(`  reserveUsdc (WUSDC): ${ethers.utils.formatEther(reserveUsdc.toString())}`)
    console.log(`  reserveTokens (DOGE): ${ethers.utils.formatEther(reserveTokens.toString())}`)

    const estimatedTokens = quote(BigInt(buyAmountIn.toString()), reserveUsdc, reserveTokens)
    console.log(`  Buy 1 USDC → estimated DOGE out: ${ethers.utils.formatEther(estimatedTokens.toString())}`)
  } else {
    console.log('  SKIPPED: Missing reserves or token0 data')
  }

  // ---- Step 9: Calculate estimated output for selling 1 DOGE ----
  console.log('')
  console.log('--- Step 9: Quote — Sell 1 DOGE ---')
  if (reserves256 && token0 && baseAsset) {
    const sellAmountIn = ethers.utils.parseEther('1') // 1 DOGE
    const r0 = BigInt(reserves256[0].toString())
    const r1 = BigInt(reserves256[1].toString())

    const tokenIsToken0 = ADDRESSES.dogeToken.toLowerCase() < baseAsset.toLowerCase()
    const reserveUsdc = tokenIsToken0 ? r1 : r0
    const reserveTokens = tokenIsToken0 ? r0 : r1

    const estimatedUsdc = quote(BigInt(sellAmountIn.toString()), reserveTokens, reserveUsdc)
    console.log(`  Sell 1 DOGE → estimated USDC out: ${ethers.utils.formatEther(estimatedUsdc.toString())}`)
  } else {
    console.log('  SKIPPED: Missing reserves or token0 data')
  }

  // ---- Extra: Try raw eth_call for getReserves to see raw bytes ----
  console.log('')
  console.log('--- Extra: Raw eth_call for getReserves ---')
  try {
    const t0 = Date.now()
    // getReserves() selector = 0x0902f1ac
    const result = await provider.call({
      to: pairToRead,
      data: '0x0902f1ac',
    })
    console.log(`  Raw result: ${result} (${Date.now() - t0}ms)`)
    console.log(`  Length: ${result.length} chars (including 0x)`)
    if (result.length > 2) {
      // Each uint256 is 32 bytes = 64 hex chars
      const data = result.slice(2)
      const chunks = []
      for (let i = 0; i < data.length; i += 64) {
        chunks.push('0x' + data.slice(i, i + 64))
      }
      console.log(`  Chunks (${chunks.length}):`)
      chunks.forEach((chunk, i) => {
        const asBN = ethers.BigNumber.from(chunk)
        console.log(`    [${i}] hex: ${chunk}`)
        console.log(`         dec: ${asBN.toString()}`)
      })
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Extra: Try calling getReserves with no output ABI (raw) ----
  console.log('')
  console.log('--- Extra: getReserves with empty outputs ABI (raw decode) ---')
  try {
    const t0 = Date.now()
    const rawAbi = [{
      type: 'function',
      name: 'getReserves',
      stateMutability: 'view',
      inputs: [],
      outputs: [],
    }]
    const pair = new ethers.Contract(pairToRead, rawAbi, provider)
    const rawResult = await pair.callStatic.getReserves()
    console.log(`  Raw result type: ${typeof rawResult}`)
    console.log(`  Raw result: ${rawResult}`)
    if (rawResult && rawResult.length !== undefined) {
      console.log(`  Raw result length: ${rawResult.length}`)
    }
    // Try manual decoding
    const iface = new ethers.utils.Interface([
      'function getReserves() returns (uint256, uint256, uint256)',
    ])
    const decoded = iface.decodeFunctionResult('getReserves', rawResult)
    console.log(`  Manually decoded (uint256): [${decoded[0].toString()}, ${decoded[1].toString()}, ${decoded[2].toString()}]`)

    const iface112 = new ethers.utils.Interface([
      'function getReserves() returns (uint112, uint112, uint32)',
    ])
    const decoded112 = iface112.decodeFunctionResult('getReserves', rawResult)
    console.log(`  Manually decoded (uint112): [${decoded112[0].toString()}, ${decoded112[1].toString()}, ${decoded112[2].toString()}]`)
    console.log(`  (${Date.now() - t0}ms)`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }

  // ---- Summary ----
  console.log('')
  console.log('=== Summary ===')
  console.log(`  dexRouter:     ${dexRouter || 'FAILED'}`)
  console.log(`  baseAsset:     ${baseAsset || 'FAILED'}`)
  console.log(`  isXyloRouter:  ${isXyloRouter !== undefined ? isXyloRouter : 'FAILED'}`)
  console.log(`  factory:       ${factoryAddress || 'FAILED'}`)
  console.log(`  pairAddress:   ${pairAddress || 'FAILED'}`)
  console.log(`  token0:        ${token0 || 'FAILED'}`)
  if (reserves256) {
    console.log(`  reserves(uint256): [${reserves256[0].toString()}, ${reserves256[1].toString()}, ${reserves256[2].toString()}]`)
  } else {
    console.log(`  reserves(uint256): FAILED`)
  }
  if (reserves112) {
    console.log(`  reserves(uint112): [${reserves112[0].toString()}, ${reserves112[1].toString()}, ${reserves112[2].toString()}]`)
  } else {
    console.log(`  reserves(uint112): FAILED`)
  }

  // Diagnose common issues
  console.log('')
  console.log('=== Diagnosis ===')
  if (!dexRouter || dexRouter === ethers.constants.AddressZero) {
    console.log('  ❌ dexRouter is zero or failed — BondingCurve contract may not have dexRouter set')
  }
  if (!baseAsset || baseAsset === ethers.constants.AddressZero) {
    console.log('  ❌ baseAsset is zero or failed — BondingCurve contract may not have baseAsset set')
  }
  if (pairAddress === ethers.constants.AddressZero) {
    console.log('  ❌ getPair returned zero — the pair has not been created on the factory')
  }
  if (reserves256 && reserves256[0].isZero() && reserves256[1].isZero()) {
    console.log('  ❌ Reserves are both zero — no liquidity in the pair')
  }
  if (dexRouter && baseAsset && pairAddress && pairAddress !== ethers.constants.AddressZero && reserves256 && !reserves256[0].isZero()) {
    console.log('  ✅ All data reads succeeded and reserves are non-zero')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
