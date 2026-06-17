// Check all DogePad tokens and BondingCurve status
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

async function main() {
  const currentBlock = await ethBlockNumber()
  console.log(`Current block: ${currentBlock}`)

  console.log('\n=== Checking DogePad BondingCurve ===\n')

  // 1. Check if BondingCurve is accessible
  console.log('BondingCurve address:', BONDING_CURVE)
  
  const ownerResult = await ethCall(BONDING_CURVE, '0x8da5cb5b') // owner()
  if (ownerResult) {
    console.log('Owner:', '0x' + ownerResult.slice(26))
  }
  
  const factoryResult = await ethCall(BONDING_CURVE, '0x7a06d27b') // factory()
  if (factoryResult) {
    console.log('Factory:', '0x' + factoryResult.slice(26))
  }

  // 2. Check tokenCount
  const tokenCountResult = await ethCall(BONDING_CURVE, '0x7ee631b7') // tokenCount()
  if (tokenCountResult) {
    const tokenCount = parseInt(tokenCountResult, 16)
    console.log('\nTotal tokens created:', tokenCount)
    
    if (tokenCount > 0) {
      console.log('\n--- Checking each token ---')
      
      for (let i = 0; i < Math.min(tokenCount, 20); i++) {
        // getTokenByIndex
        const indexData = '0x1a7fdraw' + i.toString(16).padStart(64, '0')
        const tokenByIndexResult = await ethCall(BONDING_CURVE, indexData)
        
        if (tokenByIndexResult && tokenByIndexResult !== '0x') {
          // Try to parse token address from result
          console.log(`\nToken #${i + 1}:`)
          console.log('  Raw:', tokenByIndexResult)
          
          // Get token info
          const tokenAddr = '0x' + tokenByIndexResult.slice(26, 66)
          console.log('  Address:', tokenAddr)
          
          // Check if this is the user's token
          if (tokenAddr.toLowerCase() === '0xFCbFEbC6135088C027E02f123A71321d3F5Cb53A'.toLowerCase()) {
            console.log('  *** THIS IS THE USER\'S TOKEN ***')
          }
          
          // Get token name
          const nameResult = await ethCall(tokenAddr, '0x06fdde03')
          console.log('  Name:', decodeString(nameResult) || '(empty)')
          
          // Get total supply
          const supplyResult = await ethCall(tokenAddr, '0x18160ddd')
          console.log('  Total Supply:', formatEther(supplyResult))
          
          // Check BondingCurve status
          const bondingResult = await ethCall(tokenAddr, '0x5d495b7c')
          if (bondingResult && bondingResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            console.log('  ✓ Has BondingCurve:', '0x' + bondingResult.slice(26))
          }
        }
      }
    }
  } else {
    console.log('\ntokenCount() not available - trying getAllTokens()')
    
    // Try getAllTokens
    const allTokensResult = await ethCall(BONDING_CURVE, '0x8d3c4c9a')
    if (allTokensResult) {
      console.log('getAllTokens():', allTokensResult.slice(0, 100) + '...')
    }
  }

  // 3. Check user token specifically
  console.log('\n\n=== User Token Analysis ===')
  const userToken = '0xFCbFEbC6135088C027E02f123A71321d3F5Cb53A'
  
  const bondingResult = await ethCall(userToken, '0x5d495b7c')
  
  console.log(`\nToken: ${userToken}`)
  console.log('Bonding() result:', bondingResult || 'null')
  
  if (bondingResult && bondingResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('✓ This IS a BondingCurve token')
    console.log('  BondingCurve address:', '0x' + bondingResult.slice(26))
    
    // Now check if it's registered in BondingCurve
    const tokensResult = await ethCall(BONDING_CURVE, '0x4d4e4e2e' + userToken.slice(2).padStart(64, '0'))
    if (tokensResult && tokensResult !== '0x') {
      console.log('\n  Token info in BondingCurve:')
      console.log('  ', tokensResult)
    } else {
      console.log('\n  ✗ Token NOT found in BondingCurve.tokens() mapping!')
    }
  } else {
    console.log('✗ This is NOT a BondingCurve token (bonding() returns 0)')
  }
  
  // Check balances
  const totalSupplyResult = await ethCall(userToken, '0x18160ddd')
  console.log('\nTotal Supply:', formatEther(totalSupplyResult))
  
  const contractBalanceResult = await ethCall(userToken, '0x70a08231' + userToken.slice(2).padStart(64, '0'))
  console.log('Contract self-balance:', formatEther(contractBalanceResult))
  
  const bcBalanceResult = await ethCall(userToken, '0x70a08231' + BONDING_CURVE.slice(2).padStart(64, '0'))
  console.log('BondingCurve balance:', formatEther(bcBalanceResult))

  console.log('\n=== Summary ===')
  console.log('The token 0xFCbFEbC6135088C027E02f123A71321d3F5Cb53A:')
  
  if (bondingResult && bondingResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    console.log('- HAS bonding() function pointing to a BondingCurve')
    console.log('- But may not be registered in the BondingCurve.tokens() mapping')
    console.log('- 94.6% of supply held by contract itself')
    console.log('- This could be a pre-mined/honeypot token')
  } else {
    console.log('- Does NOT have bonding() function')
    console.log('- NOT a DogePad token at all')
    console.log('- Likely created on another platform or directly')
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
