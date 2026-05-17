import { create } from 'zustand'

export type LendAsset = {
  address: string
  symbol: string
  name: string
  totalDeposit: string
  totalBorrow: string
  depositAPY: number
  borrowAPY: number
  utilizationRate: number
  availableLiquidity: string
  iconUrl: string
  isCollateral: boolean
}

export type UserLendPosition = {
  asset: string
  depositAmount: string
  borrowAmount: string
  collateralAmount: string
  healthFactor: number
}

interface LendState {
  assets: LendAsset[]
  userPositions: UserLendPosition[]
  setAssets: (assets: LendAsset[]) => void
  setUserPositions: (positions: UserLendPosition[]) => void
}

export const useLendStore = create<LendState>((set) => ({
  assets: [],
  userPositions: [],
  setAssets: (assets) => set({ assets }),
  setUserPositions: (userPositions) => set({ userPositions }),
}))
