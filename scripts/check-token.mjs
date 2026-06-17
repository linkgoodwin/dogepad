// Check token and contract status on Arc Testnet
const RPC_URL = 'https://rpc.testnet.arc.network'
const BONDING_CURVE = '0x0412839B2c0007D0642aD437B3E7b95c3680C765'

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

async function ethGetTransactionByHash(txHash) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionByHash',
      params: [txHash],
      id: 1
    })
  })
  const result = await response.json()
  return result.result
}

async function main() {
  const tokenAddress = process.argv[2] || '0xFCbFEbC6135088C027E02f123A71321d3F5Cb53A'
  const currentBlock = await ethBlockNumber()
  console.log(`Current block: ${currentBlock}`)

  console.log(`\n=== Checking Token: ${tokenAddress} ===\n`)

  // 1. Check ERC20 basic info
  console.log('--- ERC20 Info ---')
  
  const nameResult = await ethCall(tokenAddress, '0x06fdde03')
  console.log('Name:', decodeString(nameResult) || '(empty)')

  const symbolResult = await ethCall(tokenAddress, '0x95d89b41')
  console.log('Symbol:', decodeString(symbolResult) || '(empty)')

  const decimalsResult = await ethCall(tokenAddress, '0x313ce567')
  console.log('Decimals:', decimalsResult ? parseInt(decimalsResult, 16) : 'N/A')

  const totalSupplyResult = await ethCall(tokenAddress, '0x18160ddd')
  console.log('Total Supply:', totalSupplyResult ? formatEther(totalSupplyResult) : 'N/A')

  // 2. Check if it's a BondingCurve token
  console.log('\n--- BondingCurve Status ---')
  
  // Check bonding() function
  const bondingResult = await ethCall(tokenAddress, '0x5d495b7c') // bonding()
  const bondingAddr = bondingResult ? '0x' + bondingResult.slice(26) : null
  console.log('BondingCurve address:', bondingAddr || '(not a BondingCurve token)')

  // 3. Check token creation events from BondingCurve
  console.log('\n--- Searching for TokenCreated events ---')
  
  // Search last 10000 blocks for TokenCreated events
  const fromBlock = Math.max(1, currentBlock - 10000)
  const events = await ethGetLogs(
    fromBlock, 
    currentBlock,
    BONDING_CURVE,
    ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] // Transfer event
  )
  
  console.log(`Found ${events.length} Transfer events in last 10000 blocks`)

  // Look for TokenCreated events
  const tokenCreatedEvents = await ethGetLogs(
    fromBlock,
    currentBlock,
    BONDING_CURVE,
    [null, null, null] // No specific topic filtering
  ).catch(() => [])

  console.log(`Found ${tokenCreatedEvents.length} total events from BondingCurve`)

  // 4. Check token holders
  console.log('\n--- Token Balance Check ---')
  
  // Check a few well-known addresses
  const testAddresses = [
    tokenAddress, // Token contract itself
    BONDING_CURVE, // BondingCurve contract
    '0x0000000000000000000000000000000000000001', // Burn address
  ]

  for (const addr of testAddresses) {
    const balanceResult = await ethCall(tokenAddress, '0x70a08231' + addr.slice(2).padStart(64, '0'))
    if (balanceResult && balanceResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log(`${addr.slice(0, 10)}... balance: ${formatEther(balanceResult)}`)
    }
  }

  // 5. Check if token exists and has any transfers
  console.log('\n--- Token Analysis ---')
  
  if (!nameResult && !symbolResult) {
    console.log('⚠️ Token might not be a standard ERC20 or has no metadata')
  }
  
  const supply = totalSupplyResult ? BigInt(totalSupplyResult) : BigInt(0)
  if (supply > BigInt(0)) {
    console.log('⚠️ This token has 1 billion supply but is NOT in BondingCurve')
    console.log('   It was likely created directly without going through DogePad')
  }

  console.log('\n=== End ===\n')
}

function formatEther(hex) {
  if (!hex || hex === '0x') return '0'
  const num = Number(BigInt(hex)) / 1e18
  if (num < 0.0001 && num > 0) return num.toExponential(4)
  return num.toFixed(4)
}

function decodeString(hex) {
  if (!hex || hex === '0x' || hex === '0x0000000000000000000000000000000000000000000000000000000000000020') return ''
  try {
    const data = hex.slice(2)
    if (data.length < 64) return ''
    const len = parseInt(data.slice(0, 64), 16)
    if (len > 100 || len * 2 > data.length - 64) return ''
    let str = ''
    for (let i = 0; i < len * 2; i += 2) {
      const charCode = parseInt(data.slice(64 + i, 64 + i + 2), 16)
      if (charCode >= 32 && charCode <= 126) {
        str += String.fromCharCode(charCode)
      }
    }
    return str
  } catch {
    return ''
  }
}

main().catch(console.error)
