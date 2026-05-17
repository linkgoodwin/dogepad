import { create } from 'zustand'

export type TokenHolding = {
  address: string
  name: string
  symbol: string
  balance: string
  valueBnb: string
  costBnb: string
  pnl: number
  pnlPercent: number
}

interface PortfolioState {
  holdings: TokenHolding[]
  totalValueBnb: string
  totalPnl: number
  setHoldings: (holdings: TokenHolding[]) => void
  setTotalValue: (totalValueBnb: string) => void
  setTotalPnl: (totalPnl: number) => void
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  holdings: [],
  totalValueBnb: '0',
  totalPnl: 0,
  setHoldings: (holdings) => set({ holdings }),
  setTotalValue: (totalValueBnb) => set({ totalValueBnb }),
  setTotalPnl: (totalPnl) => set({ totalPnl }),
}))
