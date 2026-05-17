export interface ShortPoolState {
  availableTokens: string
  borrowedTokens: string
  utilization: number
  dailyRate: number
  collateralRatio: number
  cooldownActive: boolean
  cooldownEndsAt: number
}

export interface LongPoolState {
  totalBnbDeposit: string
  totalBnbBorrowed: string
  depositAPY: number
  borrowAPY: number
  buyAndBurnRatio: number
}

export interface BurnData {
  totalBurned: string
  totalBnbUsed: string
  burnCount: number
  lastBurnTime: number
  nextBurnThreshold: string
  burnRate24h: string
}

export const mockShortPool: ShortPoolState = {
  availableTokens: "0",
  borrowedTokens: "0",
  utilization: 0,
  dailyRate: 0,
  collateralRatio: 150,
  cooldownActive: false,
  cooldownEndsAt: 0,
}

export const mockLongPool: LongPoolState = {
  totalBnbDeposit: "0",
  totalBnbBorrowed: "0",
  depositAPY: 0,
  borrowAPY: 0,
  buyAndBurnRatio: 5,
}

export const mockBurnData: BurnData = {
  totalBurned: "0",
  totalBnbUsed: "0",
  burnCount: 0,
  lastBurnTime: 0,
  nextBurnThreshold: "0.1",
  burnRate24h: "0",
}

export function calculateExponentialRate(utilization: number): number {
  const baseRate = 0.01
  const k = 4.706
  return baseRate * Math.exp(k * Math.pow(utilization / 100, 2)) * 100
}

export const rateCurveData = Array.from({ length: 100 }, (_, i) => ({
  utilization: i,
  dailyRate: calculateExponentialRate(i),
}))
