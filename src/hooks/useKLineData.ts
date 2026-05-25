import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { aggregateKLine, KLineData } from '../components/KLineChart'

const BONDING_CURVE_ABI = [
  'event TokenBought(address indexed token, address indexed buyer, uint256 usdcAmount, uint256 tokenAmount, uint256 price)',
  'event TokenSold(address indexed token, address indexed seller, uint256 usdcAmount, uint256 tokenAmount, uint256 price)',
]

const SIMPLE_PAIR_ABI = [
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
]

const PERPETUAL_POOL_ABI = [
  'event PositionOpened(address indexed token, address indexed user, bool isLong, uint256 margin, uint256 size, uint256 entryPrice, uint256 timestamp)',
  'event PositionClosed(address indexed token, address indexed user, bool isLong, uint256 margin, uint256 size, uint256 exitPrice, int256 pnl, uint256 timestamp)',
]

export type KLineSource = 'bondingCurve' | 'dex' | 'perpetual'

interface Trade {
  price: number
  amount: number
  timestamp: number
}

export function useKLineData(
  tokenAddress: string | undefined,
  source: KLineSource,
  intervalMs: number = 60_000
) {
  const providerRef = useRef<ethers.providers.JsonRpcProvider | null>(null)

  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new ethers.providers.JsonRpcProvider('https://rpc.testnet.arc.network')
    }
    return providerRef.current
  }, [])

  const [klineData, setKlineData] = useState<KLineData[]>([])
  const [loading, setLoading] = useState(false)
  const tradesRef = useRef<Trade[]>([])

  const fetchBondingCurveTrades = useCallback(async () => {
    if (!tokenAddress) return
    const provider = getProvider()
    const bondingCurveAddr = import.meta.env.VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS
    if (!bondingCurveAddr) return

    setLoading(true)
    try {
      const contract = new ethers.Contract(bondingCurveAddr, BONDING_CURVE_ABI, provider)
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 50000)

      const buyFilter = contract.filters.TokenBought(tokenAddress)
      const sellFilter = contract.filters.TokenSold(tokenAddress)

      const [buyEvents, sellEvents] = await Promise.all([
        contract.queryFilter(buyFilter, fromBlock),
        contract.queryFilter(sellFilter, fromBlock),
      ])

      const trades: Trade[] = []

      for (const event of buyEvents) {
        const block = await event.getBlock()
        const price = event.args?.price?.toNumber?.() ?? 0
        const amount = event.args?.tokenAmount
          ? parseFloat(ethers.utils.formatEther(event.args.tokenAmount))
          : 0
        if (price > 0) {
          trades.push({ price: price / 1e18, amount, timestamp: block.timestamp * 1000 })
        }
      }

      for (const event of sellEvents) {
        const block = await event.getBlock()
        const price = event.args?.price?.toNumber?.() ?? 0
        const amount = event.args?.tokenAmount
          ? parseFloat(ethers.utils.formatEther(event.args.tokenAmount))
          : 0
        if (price > 0) {
          trades.push({ price: price / 1e18, amount, timestamp: block.timestamp * 1000 })
        }
      }

      tradesRef.current = trades
      setKlineData(aggregateKLine(trades, intervalMs))
    } catch (err) {
      console.error('Failed to fetch bonding curve trades:', err)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, getProvider, intervalMs])

  const fetchDexTrades = useCallback(async () => {
    if (!tokenAddress) return
    const provider = getProvider()
    const factoryAddr = import.meta.env.VITE_ARC_TESTNET_SIMPLE_FACTORY_ADDRESS
    if (!factoryAddr) return

    setLoading(true)
    try {
      const factory = new ethers.Contract(
        factoryAddr,
        ['function getPair(address,address) view returns (address)'],
        provider
      )
      const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df'
      const pairAddr = await factory.getPair(WUSDC, tokenAddress)
      if (pairAddr === ethers.constants.AddressZero) {
        setKlineData([])
        setLoading(false)
        return
      }

      const pair = new ethers.Contract(pairAddr, SIMPLE_PAIR_ABI, provider)
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 50000)

      const swapEvents = await pair.queryFilter(pair.filters.Swap(), fromBlock)

      const token0 = await pair.token0()
      const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()

      const trades: Trade[] = []
      for (const event of swapEvents) {
        const block = await event.getBlock()
        const amountIn = isToken0 ? event.args.amount1In : event.args.amount0In
        const amountOut = isToken0 ? event.args.amount0Out : event.args.amount1Out

        const tokenAmount = parseFloat(
          ethers.utils.formatEther(amountOut.gt(0) ? amountOut : amountIn)
        )
        const usdcAmount = parseFloat(
          ethers.utils.formatEther(amountIn.gt(0) ? amountIn : amountOut)
        )

        if (tokenAmount > 0 && usdcAmount > 0) {
          trades.push({
            price: usdcAmount / tokenAmount,
            amount: tokenAmount,
            timestamp: block.timestamp * 1000,
          })
        }
      }

      tradesRef.current = trades
      setKlineData(aggregateKLine(trades, intervalMs))
    } catch (err) {
      console.error('Failed to fetch DEX trades:', err)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, getProvider, intervalMs])

  const fetchPerpetualTrades = useCallback(async () => {
    if (!tokenAddress) return
    const provider = getProvider()
    const perpPoolAddr = import.meta.env.VITE_ARC_TESTNET_PERPETUAL_POOL_ADDRESS
    if (!perpPoolAddr) return

    setLoading(true)
    try {
      const contract = new ethers.Contract(perpPoolAddr, PERPETUAL_POOL_ABI, provider)
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 50000)

      const [openEvents, closeEvents] = await Promise.all([
        contract.queryFilter(contract.filters.PositionOpened(tokenAddress), fromBlock),
        contract.queryFilter(contract.filters.PositionClosed(tokenAddress), fromBlock),
      ])

      const trades: Trade[] = []

      for (const event of openEvents) {
        const block = await event.getBlock()
        const entryPrice = event.args?.entryPrice
          ? parseFloat(ethers.utils.formatEther(event.args.entryPrice))
          : 0
        const size = event.args?.size
          ? parseFloat(ethers.utils.formatEther(event.args.size))
          : 0
        if (entryPrice > 0) {
          trades.push({ price: entryPrice, amount: size, timestamp: block.timestamp * 1000 })
        }
      }

      for (const event of closeEvents) {
        const block = await event.getBlock()
        const exitPrice = event.args?.exitPrice
          ? parseFloat(ethers.utils.formatEther(event.args.exitPrice))
          : 0
        const size = event.args?.size
          ? parseFloat(ethers.utils.formatEther(event.args.size))
          : 0
        if (exitPrice > 0) {
          trades.push({ price: exitPrice, amount: size, timestamp: block.timestamp * 1000 })
        }
      }

      tradesRef.current = trades
      setKlineData(aggregateKLine(trades, intervalMs))
    } catch (err) {
      console.error('Failed to fetch perpetual trades:', err)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress, getProvider, intervalMs])

  const refresh = useCallback(() => {
    switch (source) {
      case 'bondingCurve':
        fetchBondingCurveTrades()
        break
      case 'dex':
        fetchDexTrades()
        break
      case 'perpetual':
        fetchPerpetualTrades()
        break
    }
  }, [source, fetchBondingCurveTrades, fetchDexTrades, fetchPerpetualTrades])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { klineData, loading, refresh }
}
