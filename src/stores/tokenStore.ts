import { create } from 'zustand'

export type TokenInfo = {
  address: string
  name: string
  symbol: string
  creator: string
  curveAddress: string
  totalSupply: string
  marketCap: string
  volume24h: string
  reserveUsdc: string
  priceBnb: string
  priceChange24h: number
  isListedOnDex: boolean
  createdAt: number
  logoUrl: string
  holders: number
  progress: number
}

interface TokenState {
  tokens: TokenInfo[]
  searchQuery: string
  sortBy: 'volume' | 'change' | 'new' | 'marketCap'
  setTokens: (tokens: TokenInfo[]) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sortBy: 'volume' | 'change' | 'new' | 'marketCap') => void
}

export const useTokenStore = create<TokenState>((set) => ({
  tokens: [],
  searchQuery: '',
  sortBy: 'new',
  setTokens: (tokens) => set({ tokens }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
}))
