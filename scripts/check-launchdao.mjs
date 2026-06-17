// Check LaunchDAO tokens and DEX listing status
const RPC_URL = 'https://rpc.testnet.arc.network'
const LAUNCH_DAO = '0x5a36007E5A5CE4823364D3EDf33220D259Fd206d'
const BONDING_CURVE = '0x0412839B2c0007D0642aD437B3E7b95c3680C765'
const USER_TOKEN = '0xFCbFEbC6135088C027E02f123A71321d3F5Cb53A'

async function ethCall(to, data) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
      id: 1
    })
  })
  const result = await response.json()
  return result.result
}

async function ethGetLogs(fromBlock, toBlock, address, topics) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getLogs',
      params: [{
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
        address,
        topics
      }],
      id: 1
    })
  })
  const result = await response.json()
  return result.result || []
}

async function ethBlockNumber() {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    })
  })
  const result = await response.json()
  return parseInt(result.result, 16)
}

async function main() {
  const currentBlock = await ethBlockNumber()
  console.log(`Current block: ${currentBlock}`)

  console.log('\n=== Checking User Token ===\n')
  
  // 1. Check token bonding() function
  console.log('Token:', USER_TOKEN)
  
  // bonding() - should return BondingCurve address
  const bondingResult = await ethCall(USER_TOKEN, '0x5d495b7c')
  console.log('\n1. bonding() function:')
  if (bondingResult && bondingResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('   ✓ BondingCurve:', '0x' + bondingResult.slice(26))
  } else {
    console.log('   ✗ Returns 0 (not a BondingCurve token)')
  }

  // 2. Check if token is in BondingCurve tokens mapping
  console.log('\n2. Checking BondingCurve.tokens() mapping:')
  const tokensFn = '0x4d4e4e2e' + USER_TOKEN.slice(2).padStart(64, '0')
  const tokensResult = await ethCall(BONDING_CURVE, tokensFn)
  
  if (tokensResult && tokensResult !== '0x') {
    console.log('   ✓ Token found in BondingCurve')
    // Parse the result
    const creator = '0x' + tokensResult.slice(2).slice(24, 64)
    const reserveUsdc = BigInt('0x' + tokensResult.slice(66, 130))
    const tradeCount = parseInt('0x' + tokensResult.slice(514, 578), 16)
    const uniqueBuyers = parseInt('0x' + tokensResult.slice(578, 642), 16)
    const isListed = tokensResult.slice(642, 66 + 642) === '1'
    
    console.log('   Creator:', creator)
    console.log('   Reserve USDC:', Number(reserveUsdc) / 1e18)
    console.log('   Trade Count:', tradeCount)
    console.log('   Unique Buyers:', uniqueBuyers)
    console.log('   Is Listed:', isListed)
  } else {
    console.log('   ✗ Token NOT found in BondingCurve.tokens()')
  }

  // 3. Check DEX pair
  console.log('\n3. Checking DEX pair:')
  const dexPairResult = await ethCall(USER_TOKEN, '0x5d495b7c') // This is bonding() not dexPair!
  
  // Actually dexPair is a different function
  // Let me check the BondingCurveToken for dexPair
  // For now, let's just check if there's any LP token
  
  const totalSupplyResult = await ethCall(USER_TOKEN, '0x18160ddd')
  console.log('   Total Supply:', formatEther(totalSupplyResult))
  
  // 4. Check LaunchDAO for this token
  console.log('\n4. Checking LaunchDAO for launched tokens:')
  
  // Search for TokenLaunched events
  const fromBlock = 1
  try {
    // TokenLaunched event signature
    const launchedEvents = await ethGetLogs(
      fromBlock,
      currentBlock,
      LAUNCH_DAO,
      [null, null, USER_TOKEN.slice(2).toLowerCase()] // indexed token parameter
    )
    
    if (launchedEvents.length > 0) {
      console.log('   ✓ Found TokenLaunched event for this token!')
      console.log('   Block:', parseInt(launchedEvents[0].blockNumber, 16))
    } else {
      console.log('   ✗ No TokenLaunched event found')
    }
  } catch (e) {
    console.log('   Error searching:', e.message)
  }

  // 5. Check if token was listed on DEX via DexLister
  console.log('\n5. Checking DexLister:')
  const DEX_LISTER = '0x026D1A2c92000754EA7Aa938046d62F32127AddB'
  
  // Search for DexListed events
  try {
    const dexListedEvents = await ethGetLogs(
      fromBlock,
      currentBlock,
      DEX_LISTER,
      [null, null, USER_TOKEN.slice(2).toLowerCase()]
    )
    
    if (dexListedEvents.length > 0) {
      console.log('   ✓ Token was listed on DEX!')
      console.log('   Block:', parseInt(dexListedEvents[0].blockNumber, 16))
    } else {
      console.log('   ✗ No DexListed event found')
    }
  } catch (e) {
    console.log('   Error:', e.message)
  }

  // 6. Check SimplePair for this token
  console.log('\n6. Checking DEX pair (SimplePair):')
  const SIMPLE_FACTORY = '0x148f3f0710976aB48c979A5064D201BffdfB1446'
  
  // getPair(token, WUSDC)
  const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df'
  const getPairFn = '0xc456db2c' // getPair(address,address)
  const getPairData = getPairFn + 
    WUSDC.slice(2).padStart(64, '0') + 
    USER_TOKEN.slice(2).padStart(64, '0')
  const pairResult = await ethCall(SIMPLE_FACTORY, getPairData)
  
  if (pairResult && pairResult !== '0x0000000000000000000000000000000000000000') {
    console.log('   ✓ DEX Pair exists:', '0x' + pairResult.slice(26))
    
    // Check pair reserves
    const reservesResult = await ethCall('0x' + pairResult.slice(26), '0x0902f15c') // getReserves()
    if (reservesResult) {
      const reserve0 = BigInt('0x' + reservesResult.slice(2, 66))
      const reserve1 = BigInt('0x' + reservesResult.slice(66, 130))
      console.log('   Reserve 0 (USDC):', Number(reserve0) / 1e18)
      console.log('   Reserve 1 (Token):', Number(reserve1) / 1e18)
    }
  } else {
    console.log('   ✗ No DEX pair found')
    console.log('   (Token not listed on DEX yet)')
  }

  console.log('\n=== Summary ===')
  console.log('Based on the analysis:')
  
  // Final verdict
  if (pairResult && pairResult !== '0x0000000000000000000000000000000000000000') {
    console.log('✓ Token HAS a DEX pair')
    console.log('✓ External trading SHOULD work')
    console.log('  If it does not work, the issue is likely:')
    console.log('  - Frontend configuration issue')
    console.log('  - RPC/network issue')
    console.log('  - Need to approve tokens before trading')
  } else {
    console.log('✗ Token does NOT have a DEX pair')
    console.log('✗ This means the token was NOT listed on external DEX')
    console.log('  Possible reasons:')
    console.log('  - listOnDex() was not called')
    console.log('  - DEX listing failed')
    console.log('  - Not enough liquidity was provided')
  }

  console.log('\n=== End ===\n')
}

function formatEther(hex) {
  if (!hex || hex === '0x') return '0'
  const num = Number(BigInt(hex)) / 1e18
  if (num < 0.0001 && num > 0) return num.toExponential(4)
  return num.toFixed(4)
}

main().catch(console.error)
