import { http, createConfig, fallback } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { QueryClient } from '@tanstack/react-query'
import type { Chain } from 'viem'
import { defineChain } from 'viem'

export const queryClient = new QueryClient()

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID'

const TESTNET_RPC_URLS = [
  import.meta.env.VITE_BSC_TESTNET_RPC || 'https://bsc-testnet.publicnode.com',
  'https://data-seed-prebsc-1-s1.binance.org:8545/',
  'https://data-seed-prebsc-2-s1.binance.org:8545/',
  'https://data-seed-prebsc-1-s2.binance.org:8545/',
]

const MAINNET_RPC_URLS = [
  import.meta.env.VITE_BSC_MAINNET_RPC || 'https://bsc.publicnode.com',
  'https://bsc-dataseed1.binance.org/',
  'https://bsc-dataseed.binance.org/',
]

const MONAD_TESTNET_RPC_URLS = [
  import.meta.env.VITE_MONAD_TESTNET_RPC || 'https://testnet-rpc.monad.xyz',
  'https://rpc.ankr.com/monad_testnet',
]

const ARC_TESTNET_RPC_URLS = [
  import.meta.env.VITE_ARC_TESTNET_RPC || 'https://rpc.testnet.arc.network',
  'https://arc-testnet.drpc.org',
]

export const monadTestnet: Chain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: MONAD_TESTNET_RPC_URLS },
    public: { http: MONAD_TESTNET_RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
})

export const arcTestnet: Chain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ARC_TESTNET_RPC_URLS },
    public: { http: ARC_TESTNET_RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
})

export const dogeBscTestnet: Chain = {
  ...bscTestnet,
  rpcUrls: {
    default: { http: TESTNET_RPC_URLS },
    public: { http: TESTNET_RPC_URLS },
  },
}

export const dogeBscMainnet: Chain = {
  ...bsc,
  rpcUrls: {
    default: { http: MAINNET_RPC_URLS },
    public: { http: MAINNET_RPC_URLS },
  },
}

function getOKXConnector() {
  return injected({
    target: {
      id: 'okxwallet',
      name: 'OKX Wallet',
      provider: (window: any) => window?.okxwallet,
    },
  })
}

function getBinanceConnector() {
  return injected({
    target: {
      id: 'binance',
      name: 'Binance Wallet',
      provider: (window: any) => window?.BinanceChain || window?.binance,
    },
  })
}

function getMetaMaskConnector() {
  return injected({
    target: {
      id: 'metamask',
      name: 'MetaMask',
      provider: (window: any) => {
        if (window?.ethereum?.isMetaMask && !window?.ethereum?.isOKExWallet && !window?.ethereum?.isBinance) {
          return window.ethereum
        }
        if (window?.ethereum?.providers) {
          return window.ethereum.providers.find((p: any) => p.isMetaMask && !p.isOKExWallet && !p.isBinance)
        }
        return undefined
      },
    },
  })
}

export const config = createConfig({
  chains: [dogeBscMainnet, dogeBscTestnet, monadTestnet, arcTestnet],
  transports: {
    [dogeBscMainnet.id]: fallback(MAINNET_RPC_URLS.map(url => http(url))),
    [dogeBscTestnet.id]: fallback(TESTNET_RPC_URLS.map(url => http(url))),
    [monadTestnet.id]: fallback(MONAD_TESTNET_RPC_URLS.map(url => http(url))),
    [arcTestnet.id]: fallback(ARC_TESTNET_RPC_URLS.map(url => http(url))),
  },
  connectors: [
    getMetaMaskConnector(),
    getOKXConnector(),
    getBinanceConnector(),
    injected(),
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
    }),
  ],
})

export async function fixWalletNetwork(chainId: number): Promise<'success' | 'rejected' | 'no_provider'> {
  const provider = (window as any)?.ethereum
  if (!provider) return 'no_provider'

  const isMonadTestnet = chainId === 10143
  const isBscTestnet = chainId === 97
  const isArcTestnet = chainId === 5042002
  const isTestnet = isBscTestnet || isMonadTestnet || isArcTestnet

  if (isArcTestnet) {
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${chainId.toString(16)}`,
          chainName: 'Arc Testnet',
          nativeCurrency: {
            name: 'USDC',
            symbol: 'USDC',
            decimals: 18,
          },
          rpcUrls: [ARC_TESTNET_RPC_URLS[0]],
          blockExplorerUrls: ['https://testnet.arcscan.app'],
        }],
      })
      return 'success'
    } catch {
      return 'rejected'
    }
  }

  if (isMonadTestnet) {
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${chainId.toString(16)}`,
          chainName: 'Monad Testnet',
          nativeCurrency: {
            name: 'MON',
            symbol: 'MON',
            decimals: 18,
          },
          rpcUrls: [MONAD_TESTNET_RPC_URLS[0]],
          blockExplorerUrls: ['https://testnet.monadvision.com'],
        }],
      })
      return 'success'
    } catch {
      return 'rejected'
    }
  }

  const rpcUrl = isBscTestnet ? TESTNET_RPC_URLS[0] : MAINNET_RPC_URLS[0]

  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: `0x${chainId.toString(16)}`,
        chainName: isBscTestnet ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain Mainnet',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'BNB',
          decimals: 18,
        },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: [isBscTestnet ? 'https://testnet.bscscan.com' : 'https://bscscan.com'],
      }],
    })
    return 'success'
  } catch {
    return 'rejected'
  }
}
