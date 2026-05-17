import { create } from 'zustand'

interface WalletState {
  address: string | null
  isConnected: boolean
  balance: string
  chainId: number | null
  setAddress: (address: string | null) => void
  setConnected: (isConnected: boolean) => void
  setBalance: (balance: string) => void
  setChainId: (chainId: number | null) => void
  disconnect: () => void
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  isConnected: false,
  balance: '0',
  chainId: null,
  setAddress: (address) => set({ address }),
  setConnected: (isConnected) => set({ isConnected }),
  setBalance: (balance) => set({ balance }),
  setChainId: (chainId) => set({ chainId }),
  disconnect: () => set({ address: null, isConnected: false, balance: '0', chainId: null }),
}))
