import { encodeFunctionData, type Abi } from 'viem'

const RELAY_RPCS: Record<number, string[]> = {
  97: [
    'https://bsc-testnet.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545/',
    'https://data-seed-prebsc-2-s1.binance.org:8545/',
    'https://data-seed-prebsc-1-s2.binance.org:8545/',
  ],
  56: [
    'https://bsc.publicnode.com',
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed.binance.org/',
  ],
  10143: [
    'https://testnet-rpc.monad.xyz',
    'https://rpc.ankr.com/monad_testnet',
  ],
  5042002: [
    'https://rpc.testnet.arc.network',
    'https://arc-testnet.drpc.org',
  ],
}

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || String(json.error))
  return json.result
}

async function findWorkingRpc(chainId: number): Promise<string> {
  const urls = RELAY_RPCS[chainId]
  if (!urls) throw new Error(`No relay RPC configured for chain ${chainId}`)
  for (const url of urls) {
    try {
      await rpcCall(url, 'eth_blockNumber', [])
      return url
    } catch { continue }
  }
  return urls[0]
}

export async function relayWriteContract(params: {
  address: `0x${string}`
  abi: Abi
  functionName: string
  args: readonly unknown[]
  value?: bigint
  gas?: bigint
  account: `0x${string}`
  chainId: number
}): Promise<`0x${string}`> {
  const { address, abi, functionName, args, value, gas, account, chainId } = params

  const provider = (window as any)?.ethereum
  if (!provider) throw new Error('No wallet found')

  const rpcUrl = await findWorkingRpc(chainId)

  const data = encodeFunctionData({ abi, args, functionName: functionName as any })

  const [nonce, gasPrice] = await Promise.all([
    rpcCall(rpcUrl, 'eth_getTransactionCount', [account, 'latest']),
    rpcCall(rpcUrl, 'eth_gasPrice', []),
  ])

  const txObj = {
    from: account,
    to: address,
    data,
    value: `0x${(value ?? 0n).toString(16)}`,
    gas: `0x${(gas ?? 5_000_000n).toString(16)}`,
    gasPrice,
    nonce,
    chainId: `0x${chainId.toString(16)}`,
  }

  let signedTx: string
  try {
    signedTx = await provider.request({
      method: 'eth_signTransaction',
      params: [txObj],
    })
  } catch (err: any) {
    const msg = String(err?.message || err?.code || '')
    if (msg.includes('4200') || msg.includes('not supported') || msg.includes('not available') || msg.includes('reject')) {
      throw new Error('SIGN_NOT_SUPPORTED')
    }
    throw err
  }

  const txHash = await rpcCall(rpcUrl, 'eth_sendRawTransaction', [signedTx])
  return txHash as `0x${string}`
}

export function getRelayRpcUrl(chainId: number): string {
  const urls = RELAY_RPCS[chainId]
  if (!urls) throw new Error(`No relay RPC configured for chain ${chainId}`)
  return urls[0]
}
