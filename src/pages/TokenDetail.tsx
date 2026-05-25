import { useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, ExternalLink, Globe, Twitter, MessageCircle, UsersRound, SearchX, Loader2, TrendingUp } from 'lucide-react'
import { useReadContract, useReadContracts, usePublicClient } from 'wagmi'
import { formatEther, parseEther, parseAbiItem, zeroAddress } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { BONDING_CURVE_ABI, LAUNCH_DAO_ABI, getContractAddress, isZeroAddress, getBscScanUrl, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { cn, parseMetadata, sanitizeHref, formatUsdc } from '@/lib/utils'
import CopyableAddress from '@/components/CopyableAddress'
import PriceChart from '@/components/PriceChart'
import InternalTradePanel from '@/components/InternalTradePanel'
import ExternalTradePanel from '@/components/ExternalTradePanel'
import { useT } from '@/i18n/useT'

const ERC20_ABI = [
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export default function TokenDetail() {
  const { address } = useParams()
  const t = useT()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const tokenAddress = (address || '') as `0x${string}`
  const bondingCurveAddress = getContractAddress(chainId, 'bondingCurve')
  const daoAddress = getContractAddress(chainId, 'launchDAO')
  const isValidAddress = tokenAddress.startsWith('0x') && tokenAddress.length === 42
  const contractReady = isValidAddress && !isZeroAddress(bondingCurveAddress)

  const { data: tokenInfo, isLoading: isTokenInfoLoading, refetch: refetchTokenInfo } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getTokenInfo',
    args: [tokenAddress],
    chainId,
    query: { enabled: contractReady },
  })

  const { data: candidateCountData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getCandidateCount',
    chainId,
    query: { enabled: !isZeroAddress(daoAddress) },
  })

  const candidateCount = candidateCountData ? Number(candidateCountData as bigint) : 0

  const candidateQueries = useMemo(() => {
    if (!candidateCount || isZeroAddress(daoAddress)) return []
    return Array.from({ length: candidateCount }, (_, i) => ({
      address: daoAddress,
      abi: LAUNCH_DAO_ABI,
      functionName: 'candidates' as const,
      args: [BigInt(i)],
      chainId,
    }))
  }, [candidateCount, daoAddress, chainId])

  const { data: candidatesData } = useReadContracts({
    contracts: candidateQueries,
    query: { enabled: candidateQueries.length > 0 },
  })

  const tokenData = useMemo(() => {
    if (!tokenInfo) return null
    const d = tokenInfo as any
    const tokenAddress_ = d.tokenAddress ?? d[0] ?? zeroAddress
    if (isZeroAddress(tokenAddress_ as `0x${string}`)) return null
    return {
      tokenAddress: tokenAddress_ as `0x${string}`,
      creator: (d.creator ?? d[1] ?? '') as string,
      totalSupply: BigInt(d.totalSupply ?? d[2] ?? 0n),
      reserveUsdc: BigInt(d.reserveUsdc ?? d[3] ?? 0n),
      tokensSold: BigInt(d.tokensSold ?? d[4] ?? 0n),
      isListedOnDex: Boolean(d.isListedOnDex ?? d[5] ?? false),
      dexListingThreshold: BigInt(d.dexListingThreshold ?? d[6] ?? 0n),
      metadataURI: String(d.metadataURI ?? d[7] ?? ''),
    }
  }, [tokenInfo])

  const { data: erc20Name } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'name',
    chainId,
    query: { enabled: tokenData !== null && isValidAddress },
  })

  const { data: erc20Symbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    chainId,
    query: { enabled: tokenData !== null && isValidAddress },
  })

  const tokenName = String(erc20Name ?? '')
  const tokenSymbol = String(erc20Symbol ?? '')

  const meta = useMemo(() => {
    if (!tokenData || !candidatesData) return {}
    for (const result of candidatesData) {
      if (result.status !== 'success' || !result.result) continue
      const raw = result.result as any
      const launchedToken = raw.launchedToken ?? raw[12]
      const metadataURI = raw.metadataURI ?? raw[3]
      if (launchedToken && String(launchedToken).toLowerCase() === tokenAddress.toLowerCase()) {
        if (metadataURI) return parseMetadata(String(metadataURI))
      }
    }
    return {}
  }, [tokenData, candidatesData, tokenAddress])

  const { data: isListedData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'isListed',
    args: [tokenAddress],
    chainId,
    query: { enabled: contractReady },
  })

  const isListed = isListedData ?? tokenData?.isListedOnDex ?? false

  const oneUsdcAfterFee = useMemo(() => {
    const oneUsdc = parseEther('1')
    const feeBps = BigInt(100)
    return (oneUsdc * (BigInt(10000) - feeBps)) / BigInt(10000)
  }, [])

  const { data: basePriceData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getBuyPrice',
    args: [tokenAddress, oneUsdcAfterFee],
    chainId,
    query: { enabled: contractReady && !isListed },
  })

  const internalBasePricePerToken = useMemo(() => {
    if (!basePriceData || basePriceData === BigInt(0)) return 0
    const tokensPerUsdc = Number(formatEther(basePriceData))
    if (tokensPerUsdc === 0) return 0
    return 1 / tokensPerUsdc
  }, [basePriceData])

  const { data: dexRouterData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'dexRouter',
    chainId,
    query: { enabled: contractReady && isListed },
  })

  const { data: baseAssetData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'baseAsset',
    chainId,
    query: { enabled: contractReady && isListed },
  })

  const dexRouter = dexRouterData as `0x${string}` | undefined
  const baseAsset = baseAssetData as `0x${string}` | undefined

  const { data: dexFactoryAddress } = useReadContract({
    address: dexRouter,
    abi: [{ type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
    functionName: 'factory',
    chainId,
    query: { enabled: !!dexRouter && isListed },
  })

  const { data: dexFactoryPair } = useReadContract({
    address: dexFactoryAddress as `0x${string}` | undefined,
    abi: [{ type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }],
    functionName: 'getPair',
    args: baseAsset && tokenAddress ? [baseAsset, tokenAddress] : undefined,
    chainId,
    query: { enabled: !!dexFactoryAddress && !!baseAsset && !!tokenAddress && isListed },
  })

  const lpPairAddress = dexFactoryPair as `0x${string}` | undefined

  const { data: dexReserves } = useReadContract({
    address: lpPairAddress,
    abi: [{ type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] }],
    functionName: 'getReserves',
    chainId,
    query: { enabled: !!lpPairAddress && isListed },
  })

  const dexLpInfo = useMemo(() => {
    if (!dexReserves || !baseAsset || !tokenAddress) return null
    const [r0, r1] = dexReserves as [bigint, bigint, number]
    const tokenIsToken0 = tokenAddress.toLowerCase() < baseAsset.toLowerCase()
    const lpUsdc = tokenIsToken0 ? Number(formatEther(BigInt(r1))) : Number(formatEther(BigInt(r0)))
    const lpTokens = tokenIsToken0 ? Number(formatEther(BigInt(r0))) : Number(formatEther(BigInt(r1)))
    return { lpUsdc, lpTokens }
  }, [dexReserves, baseAsset, tokenAddress])

  const dexPricePerToken = useMemo(() => {
    if (!dexLpInfo || dexLpInfo.lpTokens === 0) return 0
    return dexLpInfo.lpUsdc / dexLpInfo.lpTokens
  }, [dexLpInfo])

  const pricePerToken = isListed ? dexPricePerToken : internalBasePricePerToken

  const marketCap = useMemo(() => {
    if (!tokenData || pricePerToken === 0) return 0
    const supply = Number(formatEther(tokenData.totalSupply))
    return supply * pricePerToken
  }, [tokenData, pricePerToken])

  const publicClient = usePublicClient({ chainId })

  const { data: trades } = useQuery({
    queryKey: ['trades', tokenAddress, chainId, isListed, dexRouter],
    queryFn: async () => {
      if (!publicClient || !tokenAddress || isZeroAddress(bondingCurveAddress)) return []
      const buyEvent = parseAbiItem('event TokenBought(address indexed token, address indexed buyer, uint256 usdcAmount, uint256 tokenAmount)')
      const sellEvent = parseAbiItem('event TokenSold(address indexed token, address indexed seller, uint256 tokenAmount, uint256 usdcAmount)')
      const [buyLogs, sellLogs] = await Promise.all([
        publicClient.getLogs({ address: bondingCurveAddress, event: buyEvent, args: { token: tokenAddress }, fromBlock: 'earliest', toBlock: 'latest' }),
        publicClient.getLogs({ address: bondingCurveAddress, event: sellEvent, args: { token: tokenAddress }, fromBlock: 'earliest', toBlock: 'latest' }),
      ])
      const all: { type: 'buy' | 'sell'; source: 'internal' | 'external'; address: `0x${string}`; usdcAmount: bigint; tokenAmount: bigint; blockNumber: bigint; txHash: `0x${string}` }[] = [
        ...buyLogs.map((log) => ({ type: 'buy' as const, source: 'internal' as const, address: log.args.buyer!, usdcAmount: log.args.usdcAmount!, tokenAmount: log.args.tokenAmount!, blockNumber: log.blockNumber!, txHash: log.transactionHash })),
        ...sellLogs.map((log) => ({ type: 'sell' as const, source: 'internal' as const, address: log.args.seller!, usdcAmount: log.args.usdcAmount!, tokenAmount: log.args.tokenAmount!, blockNumber: log.blockNumber!, txHash: log.transactionHash })),
      ]

      if (isListed && dexRouter && !isZeroAddress(dexRouter) && baseAsset) {
        try {
          const swapEvent = parseAbiItem('event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)')
          const pairCreatedEvent = parseAbiItem('event PairCreated(address indexed token0, address indexed token1, address pair, uint256)')
          const pairLogs = await publicClient.getLogs({ address: dexRouter, event: pairCreatedEvent, fromBlock: 'earliest', toBlock: 'latest' })
          const pairAddr = pairLogs
            .map((log) => {
              const args = log.args as any
              const t0 = String(args.token0 ?? args[0] ?? '').toLowerCase()
              const t1 = String(args.token1 ?? args[1] ?? '').toLowerCase()
              const pair = String(args.pair ?? args[2] ?? '')
              if ((t0 === tokenAddress.toLowerCase() && t1 === baseAsset.toLowerCase()) ||
                  (t1 === tokenAddress.toLowerCase() && t0 === baseAsset.toLowerCase())) {
                return pair
              }
              return null
            })
            .find((p) => p !== null)

          if (pairAddr) {
            const swapLogs = await publicClient.getLogs({ address: pairAddr as `0x${string}`, event: swapEvent, fromBlock: 'earliest', toBlock: 'latest' })
            const tokenIsToken0 = tokenAddress.toLowerCase() < baseAsset.toLowerCase()
            for (const log of swapLogs) {
              const args = log.args as any
              const amount0In = BigInt(args.amount0In ?? args[1] ?? 0)
              const amount1In = BigInt(args.amount1In ?? args[2] ?? 0)
              const amount0Out = BigInt(args.amount0Out ?? args[3] ?? 0)
              const amount1Out = BigInt(args.amount1Out ?? args[4] ?? 0)
              const tokenIn = tokenIsToken0 ? amount0In : amount1In
              const tokenOut = tokenIsToken0 ? amount0Out : amount1Out
              const usdcIn = tokenIsToken0 ? amount1In : amount0In
              const usdcOut = tokenIsToken0 ? amount1Out : amount0Out
              if (tokenIn > BigInt(0) && usdcOut > BigInt(0)) {
                all.push({ type: 'sell' as const, source: 'external' as const, address: (args.sender ?? args[0]) as `0x${string}`, usdcAmount: usdcOut, tokenAmount: tokenIn, blockNumber: log.blockNumber!, txHash: log.transactionHash })
              } else if (usdcIn > BigInt(0) && tokenOut > BigInt(0)) {
                all.push({ type: 'buy' as const, source: 'external' as const, address: (args.sender ?? args[0]) as `0x${string}`, usdcAmount: usdcIn, tokenAmount: tokenOut, blockNumber: log.blockNumber!, txHash: log.transactionHash })
              }
            }
          }
        } catch (e) {
          console.error('Failed to fetch DEX trades:', e)
        }
      }

      return all.sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, 50)
    },
    enabled: !!publicClient && !!tokenAddress && !isZeroAddress(bondingCurveAddress),
    staleTime: 30_000,
  })

  const volume24h = useMemo(() => {
    if (!trades || trades.length === 0) return 0
    return trades.reduce((sum, trade) => sum + Number(formatEther(trade.usdcAmount)), 0)
  }, [trades])

  const priceChange24h = useMemo(() => {
    if (!trades || trades.length < 2) return { change: 0, percent: 0 }
    const oldestPrice = Number(formatEther(trades[trades.length - 1].usdcAmount)) / Number(formatEther(trades[trades.length - 1].tokenAmount))
    const newestPrice = Number(formatEther(trades[0].usdcAmount)) / Number(formatEther(trades[0].tokenAmount))
    if (oldestPrice === 0) return { change: 0, percent: 0 }
    const change = newestPrice - oldestPrice
    const percent = (change / oldestPrice) * 100
    return { change, percent }
  }, [trades])

  const { data: holders } = useQuery({
    queryKey: ['holders', tokenAddress, chainId],
    queryFn: async () => {
      if (!publicClient || !tokenAddress) return []
      const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
      const logs = await publicClient.getLogs({ event: transferEvent, address: tokenAddress, fromBlock: 'earliest', toBlock: 'latest' })
      const balances: Record<string, bigint> = {}
      for (const log of logs) {
        const from = log.args.from!
        const to = log.args.to!
        const value = log.args.value!
        if (from !== '0x0000000000000000000000000000000000000000') {
          balances[from] = (balances[from] || BigInt(0)) - value
        }
        if (to !== '0x0000000000000000000000000000000000000000') {
          balances[to] = (balances[to] || BigInt(0)) + value
        }
      }
      return Object.entries(balances)
        .filter(([, bal]) => bal > BigInt(0))
        .map(([addr, bal]) => ({ address: addr, balance: bal }))
        .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
        .slice(0, 20)
    },
    enabled: !!publicClient && !!tokenAddress,
    staleTime: 30_000,
  })

  const { data: subBnb } = useQuery({
    queryKey: ['subBnb', tokenAddress, chainId, daoAddress],
    queryFn: async () => {
      if (!publicClient || !tokenAddress || isZeroAddress(daoAddress)) return BigInt(0)
      const buyEvent = parseAbiItem('event TokenBought(address indexed token, address indexed buyer, uint256 usdcAmount, uint256 tokenAmount)')
      const logs = await publicClient.getLogs({ address: bondingCurveAddress, event: buyEvent, args: { token: tokenAddress, buyer: daoAddress }, fromBlock: 'earliest', toBlock: 'latest' })
      return logs.reduce((sum, log) => sum + (log.args.usdcAmount ?? BigInt(0)), BigInt(0))
    },
    enabled: !!publicClient && !!tokenAddress && !isZeroAddress(daoAddress),
    staleTime: 30_000,
  })

  const holderCount = holders?.length ?? 0
  const totalHolderBalance = useMemo(() => {
    if (!holders || holders.length === 0) return BigInt(0)
    return holders.reduce((sum, h) => sum + h.balance, BigInt(0))
  }, [holders])

  const handleTxConfirmed = useCallback(() => {
    refetchTokenInfo()
  }, [refetchTokenInfo])

  if (isTokenInfoLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t('common.back')}</span>
        </Link>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
        </div>
      </div>
    )
  }

  if (!tokenData) {
    return (
      <div className="animate-fade-in">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t('common.back')}</span>
        </Link>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-20 h-20 rounded-2xl bg-dark-700 flex items-center justify-center mb-6">
            <SearchX className="w-10 h-10 text-gray-500" />
          </div>
          <h2 className="font-display font-bold text-2xl mb-2">{t('tokenDetail.tokenNotFound')}</h2>
          <p className="text-gray-400 mb-6">{t('tokenDetail.tokenNotFoundDesc')}</p>
          <Link to="/create" className="btn-primary">{t('tokenDetail.createToken')}</Link>
        </div>
      </div>
    )
  }

  const formatBnb = (val: number) => formatUsdc(val)
  const reserveBnb = tokenData ? Number(formatEther(tokenData.reserveUsdc)) : 0
  const dexThreshold = tokenData ? Number(formatEther(tokenData.dexListingThreshold)) : 20
  const progress = Math.min((reserveBnb / dexThreshold) * 100, 100)

  return (
    <div className="animate-fade-in">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">{t('common.back')}</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card-dark">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden">
                {meta.image ? (
                  <img src={sanitizeHref(meta.image)} alt={tokenName} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display font-bold text-xl text-neon-green">
                    {tokenName.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display font-bold text-2xl">{tokenName}</h1>
                  <span className="text-gray-400">{tokenSymbol}</span>
                  {isListed && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 rounded-full">
                      DEX
                    </span>
                  )}
                </div>
                <CopyableAddress address={tokenAddress} chainId={chainId} type="token" short={false} />
              </div>
            </div>

            <div className="flex items-end gap-4 mb-6">
              <span className="font-display font-bold text-4xl neon-text">{formatBnb(pricePerToken)}</span>
              <span className="text-gray-400 text-lg mb-1">{nativeSymbol}</span>
              {priceChange24h.percent !== 0 && (
                <span className={cn('text-sm font-semibold mb-1.5', priceChange24h.percent >= 0 ? 'text-neon-green' : 'text-neon-red')}>
                  {priceChange24h.percent >= 0 ? '+' : ''}{priceChange24h.percent.toFixed(2)}%
                </span>
              )}
            </div>

            <PriceChart trades={trades ? [...trades].reverse() : []} />
          </div>

          <div className="card-dark">
            {isListed ? (
              <>
                <h3 className="font-display font-semibold text-lg mb-4">{t('tokenDetail.dexLiquidityPool')}</h3>
                {dexLpInfo ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{nativeSymbol} {t('tokenDetail.liquidity')}</span>
                      <span className="font-display font-semibold text-neon-green">{formatUsdc(dexLpInfo.lpUsdc)} {nativeSymbol}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{tokenSymbol} {t('tokenDetail.liquidity')}</span>
                      <span className="font-display font-semibold text-doge-cyan">{dexLpInfo.lpTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} {tokenSymbol}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-dark-500/30">
                      <span className="text-gray-400 text-sm">{t('tokenDetail.lpTotalValue')}</span>
                      <span className="font-display font-bold text-lg neon-text">{formatUsdc(dexLpInfo.lpUsdc * 2)} {nativeSymbol}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{t('tokenDetail.lpBurned')}</p>
                  </div>
                ) : (
                  <div className="bg-dark-700/50 rounded-lg p-4 text-center">
                    <p className="text-gray-400 text-sm">{t('tokenDetail.loadingLpInfo')}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-display font-semibold text-lg mb-4">{t('tokenDetail.dexProgress')}</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">{t('tokenDetail.reserve')}</span>
                  <span className="font-display font-semibold">{formatUsdc(reserveBnb)} / {formatUsdc(dexThreshold)} {nativeSymbol}</span>
                </div>
                <div className="w-full h-4 bg-dark-700 rounded-full overflow-hidden flex">
                  {(() => {
                    const subBnbVal = subBnb ? Number(formatEther(subBnb)) : 0
                    const curveBnbVal = Math.max(0, reserveBnb - subBnbVal)
                    const subPct = Math.min((subBnbVal / dexThreshold) * 100, 100)
                    const curvePct = Math.min((curveBnbVal / dexThreshold) * 100, 100 - subPct)
                    return (
                      <>
                        <div className="h-full bg-doge-gold transition-all duration-500" style={{ width: `${subPct}%` }} title={`${t('tokenDetail.subBnb')}: ${formatUsdc(subBnbVal)} ${nativeSymbol}`} />
                        <div className="h-full bg-doge-cyan transition-all duration-500" style={{ width: `${curvePct}%` }} title={`${t('tokenDetail.curveBnb')}: ${formatUsdc(curveBnbVal)} ${nativeSymbol}`} />
                      </>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-doge-gold inline-block" />{t('tokenDetail.subBnb')}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-doge-cyan inline-block" />{t('tokenDetail.curveBnb')}</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  {progress >= 100
                    ? t('tokenDetail.alreadyListed')
                    : `${formatUsdc(dexThreshold - reserveBnb)} ${nativeSymbol} ${t('tokenDetail.remaining')}`}
                </p>
              </>
            )}
          </div>

          <div className="card-dark">
            <h3 className="font-display font-semibold text-lg mb-4">{t('tokenDetail.recentTrades')}</h3>
            {!trades || trades.length === 0 ? (
              <div className="bg-dark-700/50 rounded-lg p-6 text-center">
                <p className="text-gray-400 text-sm">{trades ? t('tokenDetail.noTrades') : t('tokenDetail.loadingTrades')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-dark-500/30">
                      <th className="text-left py-2 px-2">{t('tokenDetail.tradeType')}</th>
                      <th className="text-left py-2 px-2">{t('tokenDetail.tradeAddress')}</th>
                      <th className="text-right py-2 px-2">{nativeSymbol}</th>
                      <th className="text-right py-2 px-2">{tokenSymbol}</th>
                      <th className="text-right py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, i) => (
                      <tr key={i} className="border-b border-dark-500/10 hover:bg-dark-700/30">
                        <td className="py-2 px-2">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', trade.type === 'buy' ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red')}>
                            {trade.type === 'buy' ? t('tokenDetail.buy') : t('tokenDetail.sell')}
                          </span>
                          {'source' in trade && (
                            <span className={cn('text-[10px] ml-1 px-1.5 py-0.5 rounded', trade.source === 'external' ? 'bg-doge-cyan/10 text-doge-cyan' : 'bg-dark-600 text-gray-400')}>
                              {trade.source === 'external' ? 'DEX' : 'BC'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          <a href={getBscScanUrl(chainId, 'address', trade.address)} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-doge-gold transition-colors">
                            {String(trade.address ?? '').slice(0, 6)}...{String(trade.address ?? '').slice(-4)}
                          </a>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{formatUsdc(Number(formatEther(trade.usdcAmount)))}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{Number(formatEther(trade.tokenAmount)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-2 px-2 text-right">
                          <a href={getBscScanUrl(chainId, 'tx', trade.txHash)} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-doge-gold transition-colors">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card-dark">
            <h3 className="font-display font-semibold text-lg mb-4">{t('tokenDetail.holders')}</h3>
            {!holders || holders.length === 0 ? (
              <div className="bg-dark-700/50 rounded-lg p-6 text-center">
                <p className="text-gray-400 text-sm">{holders ? t('tokenDetail.noHolders') : t('tokenDetail.loadingHolders')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-dark-500/30">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">{t('tokenDetail.holderAddress')}</th>
                      <th className="text-right py-2 px-2">{t('tokenDetail.holderBalance')}</th>
                      <th className="text-right py-2 px-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((holder, i) => {
                      const pct = totalHolderBalance > BigInt(0) ? Number(holder.balance * BigInt(10000) / totalHolderBalance) / 100 : 0
                      return (
                        <tr key={i} className="border-b border-dark-500/10 hover:bg-dark-700/30">
                          <td className="py-2 px-2 text-gray-500">{i + 1}</td>
                          <td className="py-2 px-2 font-mono text-xs">
                            <a href={getBscScanUrl(chainId, 'address', holder.address)} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-doge-gold transition-colors">
                              {String(holder.address ?? '').slice(0, 6)}...{String(holder.address ?? '').slice(-4)}
                            </a>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">{Number(formatEther(holder.balance)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="py-2 px-2 text-right text-doge-gold text-xs font-semibold">{pct.toFixed(2)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {isListed ? (
            <ExternalTradePanel
              tokenAddress={tokenAddress}
              tokenSymbol={tokenSymbol}
              nativeSymbol={nativeSymbol}
              bondingCurveAddress={bondingCurveAddress}
              chainId={chainId}
              onTxConfirmed={handleTxConfirmed}
            />
          ) : (
            <InternalTradePanel
              tokenAddress={tokenAddress}
              tokenSymbol={tokenSymbol}
              nativeSymbol={nativeSymbol}
              bondingCurveAddress={bondingCurveAddress}
              chainId={chainId}
              onTxConfirmed={handleTxConfirmed}
            />
          )}

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3">{t('tokenDetail.tokenInfo')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetail.marketCap')}</span>
                <span className="font-medium">{marketCap > 0 ? `${formatUsdc(marketCap)} ${nativeSymbol}` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetail.24hVolume')}</span>
                <span className="font-medium">{volume24h > 0 ? `${formatUsdc(volume24h)} ${nativeSymbol}` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetail.holders')}</span>
                <span className="font-medium flex items-center gap-1"><Users className="w-3 h-3" />{holderCount || '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetail.totalSupply')}</span>
                <span className="font-medium">{Number(formatEther(tokenData.totalSupply)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetail.creator')}</span>
                <span className="font-mono text-xs">{String(tokenData.creator).slice(0, 6)}...{String(tokenData.creator).slice(-4)}</span>
              </div>
              <a
                href={getBscScanUrl(chainId, 'address', tokenAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-neon-green text-xs hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> {t('tokenDetail.viewBscScan')}
              </a>
              {(meta.website || meta.twitter || meta.telegram || meta.discord) && (
                <div className="pt-2 border-t border-dark-500/30">
                  <div className="flex items-center gap-3">
                    {meta.website && (
                      <a href={sanitizeHref(meta.website)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-gold transition-colors" title={t('tokenDetail.website')}>
                        <Globe className="w-4 h-4" />
                      </a>
                    )}
                    {meta.twitter && (
                      <a href={sanitizeHref(/^(https?:\/\/|twitter\.com|x\.com)/i.test(meta.twitter) ? meta.twitter : `https://twitter.com/${meta.twitter}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-cyan transition-colors" title={t('tokenDetail.twitter')}>
                        <Twitter className="w-4 h-4" />
                      </a>
                    )}
                    {meta.telegram && (
                      <a href={sanitizeHref(/^(https?:\/\/|t\.me)/i.test(meta.telegram) ? meta.telegram : `https://t.me/${meta.telegram}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-cyan transition-colors" title={t('tokenDetail.telegram')}>
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                    {meta.discord && (
                      <a href={sanitizeHref(/^(https?:\/\/|discord\.gg|discord\.com)/i.test(meta.discord) ? meta.discord : `https://discord.gg/${meta.discord}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-violet transition-colors" title={t('tokenDetail.discord')}>
                        <UsersRound className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isListed && (
            <div className="card-dark">
              <h3 className="font-display font-semibold mb-3">{t('tokenDetail.longShort')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/perpetual"
                  className="bg-neon-green/5 border border-neon-green/20 rounded-xl p-4 text-center hover:bg-neon-green/10 transition-all group"
                >
                  <TrendingUp className="w-6 h-6 mx-auto mb-2 text-neon-green group-hover:scale-110 transition-transform" />
                  <div className="font-display font-bold text-neon-green text-sm">{t('tokenDetail.goLong')}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{t('tokenDetail.goLongDesc')}</div>
                </Link>
                <Link
                  to="/perpetual"
                  className="bg-neon-red/5 border border-neon-red/20 rounded-xl p-4 text-center hover:bg-neon-red/10 transition-all group"
                >
                  <ArrowLeft className="w-6 h-6 mx-auto mb-2 text-neon-red group-hover:scale-110 transition-transform" />
                  <div className="font-display font-bold text-neon-red text-sm">{t('tokenDetail.goShort')}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{t('tokenDetail.goShortDesc')}</div>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
