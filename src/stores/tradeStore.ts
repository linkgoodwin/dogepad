import { create } from 'zustand'
import type { TokenInfo } from './tokenStore'

export type Trade = {
  id: string
  type: 'buy' | 'sell'
  trader: string
  amount: string
  price: string
  bnbAmount: string
  timestamp: number
}

interface TradeState {
  currentToken: TokenInfo | null
  trades: Trade[]
  buyAmount: string
  sellAmount: string
  slippage: number
  setCurrentToken: (token: TokenInfo | null) => void
  setTrades: (trades: Trade[]) => void
  setBuyAmount: (amount: string) => void
  setSellAmount: (amount: string) => void
  setSlippage: (slippage: number) => void
}

export const useTradeStore = create<TradeState>((set) => ({
  currentToken: null,
  trades: [],
  buyAmount: '',
  sellAmount: '',
  slippage: 0.5,
  setCurrentToken: (currentToken) => set({ currentToken }),
  setTrades: (trades) => set({ trades }),
  setBuyAmount: (buyAmount) => set({ buyAmount }),
  setSellAmount: (sellAmount) => set({ sellAmount }),
  setSlippage: (slippage) => set({ slippage }),
}))
