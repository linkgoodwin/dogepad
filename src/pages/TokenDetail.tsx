import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, ExternalLink, Globe, Twitter, MessageCircle, UsersRound, SearchX, Loader2, AlertCircle } from 'lucide-react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { formatEther, parseEther, formatUnits, parseAbiItem, zeroAddress } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { BONDING_CURVE_ABI, LAUNCH_DAO_ABI, getContractAddress, isZeroAddress, getBscScanUrl, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, parseMetadata, sanitizeHref, formatUsdc } from '@/lib/utils'
import CopyableAddress from '@/components/CopyableAddress'
import PriceChart from '@/components/PriceChart'
import { useT } from '@/i18n/useT'

const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
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
  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txError, setTxError] = useState('')
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const tokenAddress = (address || '') as `0x${string}`
  const bondingCurveAddress = getContractAddress(chainId, 'bondingCurve')
  const daoAddress = getContractAddress(chainId, 'launchDAO')
  const isValidAddress = tokenAddress.startsWith('0x') && tokenAddress.length === 42
  const contractReady = isValidAddress && !isZeroAddress(bondingCurveAddress)

  const { writeContractAsync, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

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
      reserveBnb: BigInt(d.reserveBnb ?? d[3] ?? 0n),
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

  const buyBnbAmount = useMemo(() => {
    if (!buyAmount || Number(buyAmount) <= 0) return parseEther('1')
    try {
      return parseEther(buyAmount)
    } catch {
      return parseEther('1')
    }
  }, [buyAmount])

  const { data: buyPriceData, refetch: refetchBuyPrice } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getBuyPrice',
    args: [tokenAddress, buyBnbAmount],
    chainId,
    query: { enabled: contractReady },
  })

  const sellTokenAmount = useMemo(() => {
    if (!sellAmount || Number(sellAmount) <= 0) return BigInt(0)
    try {
      return parseEther(sellAmount)
    } catch {
      return BigInt(0)
    }
  }, [sellAmount])

  const { data: sellPriceData, refetch: refetchSellPrice } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getSellPrice',
    args: [tokenAddress, sellTokenAmount],
    chainId,
    query: { enabled: contractReady && sellTokenAmount > BigInt(0) },
  })

  const { data: userTokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: isValidAddress && !!userAddress },
  })

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, bondingCurveAddress] : undefined,
    chainId,
    query: { enabled: isValidAddress && !!userAddress && activeTab === 'sell' },
  })

  useEffect(() => {
    if (isConfirmed) {
      refetchTokenInfo()
      refetchBuyPrice()
      refetchSellPrice()
      refetchBalance()
      refetchAllowance()
    }
  }, [isConfirmed, refetchTokenInfo, refetchBuyPrice, refetchSellPrice, refetchBalance, refetchAllowance])

  const estimatedTokens = useMemo(() => {
    if (!buyPriceData) return BigInt(0)
    return buyPriceData
  }, [buyPriceData])

  const estimatedBnb = useMemo(() => {
    if (!sellPriceData) return BigInt(0)
    return sellPriceData
  }, [sellPriceData])

  const reserveBnb = tokenData ? Number(formatEther(tokenData.reserveBnb)) : 0
  const dexThreshold = tokenData ? Number(formatEther(tokenData.dexListingThreshold)) : 20000
  const progress = Math.min((reserveBnb / dexThreshold) * 100, 100)

  const { data: basePriceData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getBuyPrice',
    args: [tokenAddress, parseEther('1')],
    chainId,
    query: { enabled: contractReady },
  })

  const basePricePerToken = useMemo(() => {
    if (!basePriceData || basePriceData === BigInt(0)) return 0
    const tokensPerUsdc = Number(formatEther(basePriceData))
    if (tokensPerUsdc === 0) return 0
    return 1 / tokensPerUsdc
  }, [basePriceData])

  const pricePerToken = useMemo(() => {
    if (!buyAmount || Number(buyAmount) <= 0 || !estimatedTokens || estimatedTokens === BigInt(0)) return basePricePerToken
    try {
      const usdcVal = Number(buyAmount)
      const tokensVal = Number(formatEther(estimatedTokens))
      if (tokensVal === 0) return basePricePerToken
      return usdcVal / tokensVal
    } catch {
      return basePricePerToken
    }
  }, [buyAmount, estimatedTokens, basePricePerToken])

  const marketCap = useMemo(() => {
    if (!tokenData || pricePerToken === 0) return 0
    const supply = Number(formatEther(tokenData.totalSupply))
    return supply * pricePerToken
  }, [tokenData, pricePerToken])

  const needsApproval = useMemo(() => {
    if (!sellAmount || !allowanceData) return true
    try {
      const tokenWei = parseEther(sellAmount)
      return allowanceData < tokenWei
    } catch {
      return true
    }
  }, [sellAmount, allowanceData])

  const isListed = isListedData ?? tokenData?.isListedOnDex ?? false

  const publicClient = usePublicClient({ chainId })

  const { data: trades } = useQuery({
    queryKey: ['trades', tokenAddress, chainId],
    queryFn: async () => {
      if (!publicClient || !tokenAddress) return []
      const buyEvent = parseAbiItem('event TokenBought(address indexed token, address indexed buyer, uint256 bnbAmount, uint256 tokenAmount)')
      const sellEvent = parseAbiItem('event TokenSold(address indexed token, address indexed seller, uint256 tokenAmount, uint256 bnbAmount)')
      const [buyLogs, sellLogs] = await Promise.all([
        publicClient.getLogs({ event: buyEvent, args: { token: tokenAddress }, fromBlock: 'earliest', toBlock: 'latest' }),
        publicClient.getLogs({ event: sellEvent, args: { token: tokenAddress }, fromBlock: 'earliest', toBlock: 'latest' }),
      ])
      const all = [
        ...buyLogs.map((log) => ({ type: 'buy' as const, address: log.args.buyer!, bnbAmount: log.args.bnbAmount!, tokenAmount: log.args.tokenAmount!, blockNumber: log.blockNumber!, txHash: log.transactionHash })),
        ...sellLogs.map((log) => ({ type: 'sell' as const, address: log.args.seller!, bnbAmount: log.args.bnbAmount!, tokenAmount: log.args.tokenAmount!, blockNumber: log.blockNumber!, txHash: log.transactionHash })),
      ]
      return all.sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, 50)
    },
    enabled: !!publicClient && !!tokenAddress,
    staleTime: 30_000,
  })

  const volume24h = useMemo(() => {
    if (!trades || trades.length === 0) return 0
    return trades.reduce((sum, trade) => sum + Number(formatEther(trade.bnbAmount)), 0)
  }, [trades])

  const priceChange24h = useMemo(() => {
    if (!trades || trades.length < 2) return { change: 0, percent: 0 }
    const oldestPrice = Number(formatEther(trades[trades.length - 1].bnbAmount)) / Number(formatEther(trades[trades.length - 1].tokenAmount))
    const newestPrice = Number(formatEther(trades[0].bnbAmount)) / Number(formatEther(trades[0].tokenAmount))
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
      const buyEvent = parseAbiItem('event TokenBought(address indexed token, address indexed buyer, uint256 bnbAmount, uint256 tokenAmount)')
      const logs = await publicClient.getLogs({ event: buyEvent, args: { token: tokenAddress, buyer: daoAddress }, fromBlock: 'earliest', toBlock: 'latest' })
      return logs.reduce((sum, log) => sum + (log.args.bnbAmount ?? BigInt(0)), BigInt(0))
    },
    enabled: !!publicClient && !!tokenAddress && !isZeroAddress(daoAddress),
    staleTime: 30_000,
  })

  const holderCount = holders?.length ?? 0
  const totalHolderBalance = useMemo(() => {
    if (!holders || holders.length === 0) return BigInt(0)
    return holders.reduce((sum, h) => sum + h.balance, BigInt(0))
  }, [holders])

  const handleBuy = useCallback(() => {
    setTxError('')
    if (!buyAmount || !tokenAddress || estimatedTokens === BigInt(0)) return
    try {
      const bnbWei = parseEther(buyAmount)
      const slippageBps = BigInt(Math.round((100 - slippage) * 100))
      const minTokensOut = (estimatedTokens * slippageBps) / BigInt(10000)
      writeContractAsync({
        address: bondingCurveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [tokenAddress, minTokensOut, zeroAddress],
        value: bnbWei,
        chainId,
        gas: 5_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
      })
    } catch (e) {
      console.error('Buy failed', e)
    }
  }, [buyAmount, tokenAddress, estimatedTokens, slippage, writeContractAsync, bondingCurveAddress, chainId])

  const handleApprove = useCallback(() => {
    setTxError('')
    if (!sellAmount || !tokenAddress) return
    try {
      const tokenWei = parseEther(sellAmount)
      writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [bondingCurveAddress, tokenWei],
        chainId,
        gas: 1_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
      })
    } catch (e) {
      console.error('Approve failed', e)
    }
  }, [sellAmount, tokenAddress, bondingCurveAddress, writeContractAsync, chainId])

  const handleSell = useCallback(() => {
    setTxError('')
    if (!sellAmount || !tokenAddress || estimatedBnb === BigInt(0)) return
    try {
      const tokenWei = parseEther(sellAmount)
      const slippageBps = BigInt(Math.round((100 - slippage) * 100))
      const minBnbOut = (estimatedBnb * slippageBps) / BigInt(10000)
      writeContractAsync({
        address: bondingCurveAddress,
        abi: BONDING_CURVE_ABI,
        functionName: 'sell',
        args: [tokenAddress, tokenWei, minBnbOut],
        chainId,
        gas: 5_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
      })
    } catch (e) {
      console.error('Sell failed', e)
    }
  }, [sellAmount, tokenAddress, estimatedBnb, slippage, writeContractAsync, bondingCurveAddress, chainId])

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
  const formatTokenAmount = (val: bigint) => {
    const num = Number(formatEther(val))
    if (num === 0) return '0'
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (num >= 0.001) return num.toFixed(4)
    return num.toExponential(2)
  }

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
            <h3 className="font-display font-semibold text-lg mb-4">{t('tokenDetail.dexProgress')}</h3>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">{t('tokenDetail.reserve')}</span>
              <span className="font-display font-semibold">{formatUsdc(reserveBnb)} / 20000 {nativeSymbol}</span>
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

            {progress >= 100 && (
              <div className="mt-4 pt-4 border-t border-dark-500/30">
                <h4 className="font-display font-semibold text-sm mb-3">{t('tokenDetail.distribution')}</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neon-green inline-block" />{t('tokenDetail.distLp')}</span>
                    <span className="font-semibold text-neon-green">70% {nativeSymbol} + 30% {t('tokenDetail.tokens')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-doge-cyan inline-block" />{t('tokenDetail.distLongPool')}</span>
                    <span className="font-semibold text-doge-cyan">25% {nativeSymbol}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-doge-violet inline-block" />{t('tokenDetail.distShortPool')}</span>
                    <span className="font-semibold text-doge-violet">15% {t('tokenDetail.tokens')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-doge-gold inline-block" />{t('tokenDetail.distPlatform')}</span>
                    <span className="font-semibold text-doge-gold">5% {nativeSymbol}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neon-red inline-block" />{t('tokenDetail.distBurn')}</span>
                    <span className="font-semibold text-neon-red">5% {t('tokenDetail.tokens')}</span>
                  </div>
                </div>
              </div>
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
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          <a href={getBscScanUrl(chainId, 'address', trade.address)} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-doge-gold transition-colors">
                            {String(trade.address ?? '').slice(0, 6)}...{String(trade.address ?? '').slice(-4)}
                          </a>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{formatUsdc(Number(formatEther(trade.bnbAmount)))}</td>
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
          <div className="card-dark">
            <div className="flex mb-4 bg-dark-700 rounded-lg p-1">
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all',
                  activeTab === 'buy' ? 'bg-neon-green text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('buy')}
              >
                {t('tokenDetail.buy')}
              </button>
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all',
                  activeTab === 'sell' ? 'bg-neon-red text-white' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('sell')}
              >
                {t('tokenDetail.sell')}
              </button>
            </div>

            {isListed ? (
              <div className="text-center py-6">
                <p className="text-neon-green font-display font-semibold mb-2">{t('tokenDetail.listedOnDex')}</p>
                <p className="text-gray-400 text-sm">{t('tokenDetail.listedOnDexDesc')}</p>
                <a
                  href={getBscScanUrl(chainId, 'token', tokenAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-neon-green text-sm hover:underline mt-3"
                >
                  <ExternalLink className="w-3 h-3" /> {t('tokenDetail.viewOnExplorer')}
                </a>
              </div>
            ) : activeTab === 'buy' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('tokenDetail.amount')} ({nativeSymbol})</label>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                  />
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t('tokenDetail.youWillReceive')}</p>
                  <p className="font-display font-bold text-lg">{formatTokenAmount(estimatedTokens)} {tokenSymbol}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('tokenDetail.slippage')}</label>
                  <div className="flex gap-2">
                    {[0.5, 1, 3].map((s) => (
                      <button
                        key={s}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                          slippage === s
                            ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                            : 'bg-dark-700 text-gray-400 border border-dark-500 hover:text-white'
                        )}
                        onClick={() => setSlippage(s)}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                </div>
                {!isConnected ? (
                  <button className="btn-primary w-full text-center opacity-50 cursor-not-allowed" disabled>
                    {t('common.connect')}
                  </button>
                ) : (
                  <button
                    className="btn-primary w-full text-center"
                    onClick={handleBuy}
                    disabled={isWritePending || isConfirming || !buyAmount || Number(buyAmount) <= 0}
                  >
                    {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : `${t('tokenDetail.buy')} ${tokenSymbol}`}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-gray-400">{t('tokenDetail.amount')} ({tokenSymbol})</label>
                    {userTokenBalance !== undefined && (
                      <button
                        className="text-xs text-neon-green hover:underline"
                        onClick={() => setSellAmount(formatEther(userTokenBalance))}
                      >
                        Max: {formatTokenAmount(userTokenBalance)}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                  />
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t('tokenDetail.youWillReceive')}</p>
                  <p className="font-display font-bold text-lg">{estimatedBnb > BigInt(0) ? formatUsdc(Number(formatEther(estimatedBnb))) : '0'} {nativeSymbol}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('tokenDetail.slippage')}</label>
                  <div className="flex gap-2">
                    {[0.5, 1, 3].map((s) => (
                      <button
                        key={s}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                          slippage === s
                            ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                            : 'bg-dark-700 text-gray-400 border border-dark-500 hover:text-white'
                        )}
                        onClick={() => setSlippage(s)}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                </div>
                {!isConnected ? (
                  <button className="btn-danger w-full text-center opacity-50 cursor-not-allowed" disabled>
                    {t('common.connect')}
                  </button>
                ) : needsApproval ? (
                  <button
                    className="btn-primary w-full text-center"
                    onClick={handleApprove}
                    disabled={isWritePending || isConfirming || !sellAmount || Number(sellAmount) <= 0}
                  >
                    {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : t('common.approve', { symbol: tokenSymbol })}
                  </button>
                ) : (
                  <button
                    className="btn-danger w-full text-center"
                    onClick={handleSell}
                    disabled={isWritePending || isConfirming || !sellAmount || Number(sellAmount) <= 0}
                  >
                    {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : `${t('tokenDetail.sell')} ${tokenSymbol}`}
                  </button>
                )}
              </div>
            )}

            {txError && (
              <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
                <p className="text-xs text-neon-red">{txError}</p>
              </div>
            )}

            {writeError && (
              <div className="mt-3 flex items-start gap-2 text-neon-red text-xs bg-neon-red/10 rounded-lg p-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{writeError.message?.includes('User rejected') ? t('common.transactionRejected') : writeError.message?.slice(0, 100) || t('common.transactionFailed')}</span>
              </div>
            )}
            {isConfirmed && (
              <div className="mt-3 flex items-start gap-2 text-neon-green text-xs bg-neon-green/10 rounded-lg p-2">
                <span>{t('common.transactionConfirmed')}</span>
                {txHash && (
                  <a
                    href={getBscScanUrl(chainId, 'tx', txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    {t('common.view')}
                  </a>
                )}
              </div>
            )}
          </div>

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
        </div>
      </div>
    </div>
  )
}
