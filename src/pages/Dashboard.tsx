import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { TrendingUp, BarChart3, Flame, Rocket, Loader2, Clock, Zap, ArrowRight, Shield, Target } from 'lucide-react'
import StatCard from '@/components/StatCard'
import { LAUNCH_DAO_ABI, BONDING_CURVE_ABI, FEE_DISTRIBUTOR_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { parseMetadata, sanitizeHref, cn, formatUsdc } from '@/lib/utils'
import type { TokenMeta } from '@/lib/utils'
import { useT } from '@/i18n/useT'

interface CandidateInfo {
  id: number
  name: string
  symbol: string
  proposer: string
  metadataURI: string
  totalWeight: bigint
  totalSubBnb: bigint
  submitTime: bigint
  expireTime: bigint
  status: number
  wasLaunched: boolean
  launchedToken: string
  durationTier: number
}

function CandidateCard({ candidateId }: { candidateId: number }) {
  const t = useT()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const daoAddress = getContractAddress(targetChainId, 'launchDAO')

  const { data, isLoading } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'candidates',
    args: [BigInt(candidateId)],
    chainId: targetChainId,
    query: { enabled: !isZeroAddress(daoAddress), refetchInterval: 30000 },
  })

  const candidate = useMemo<CandidateInfo | null>(() => {
    if (!data) return null
    const d = data as any
    return {
      id: candidateId,
      proposer: d.proposer ?? d[0] ?? '',
      name: d.name ?? d[1] ?? '',
      symbol: d.symbol ?? d[2] ?? '',
      metadataURI: d.metadataURI ?? d[3] ?? '',
      totalWeight: d.totalWeight ?? d[4] ?? 0n,
      totalSubBnb: d.totalSubBnb ?? d[5] ?? 0n,
      submitTime: d.submitTime ?? d[8] ?? 0n,
      expireTime: d.expireTime ?? d[10] ?? 0n,
      status: Number(d.status ?? d[12] ?? 0),
      wasLaunched: d.wasLaunched ?? d[13] ?? false,
      launchedToken: d.launchedToken ?? d[14] ?? '',
      durationTier: Number(d.durationTier ?? d[6] ?? 0),
    }
  }, [data, candidateId])

  const meta = useMemo<TokenMeta>(() => parseMetadata(candidate?.metadataURI || ''), [candidate?.metadataURI])

  if (isLoading) {
    return (
      <div className="card-dark flex items-center justify-center py-5">
        <Loader2 className="w-4 h-4 text-doge-gold animate-spin" />
      </div>
    )
  }

  if (!candidate) return null

  const committedBnb = Number(formatEther(candidate.totalSubBnb))
  const timeAgo = candidate.submitTime > 0n
    ? Math.max(0, Math.floor((Date.now() / 1000 - Number(candidate.submitTime)) / 3600))
    : 0
  const timeLabel = timeAgo < 1 ? t('dashboard.justNow') : timeAgo < 24 ? `${timeAgo}h` : `${Math.floor(timeAgo / 24)}d`

  return (
    <Link to="/dao" className="block">
      <div className="card-dark group hover:border-doge-gold/30 transition-all h-12 flex items-center px-3">
        <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden shrink-0">
          {meta.image ? (
            <img src={sanitizeHref(meta.image)} alt={candidate.name} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const f = (e.target as HTMLImageElement).nextElementSibling as HTMLElement; if (f) f.classList.remove('hidden') }} />
          ) : null}
          <div className={cn('w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center font-display font-bold text-doge-gold text-[10px]', meta.image ? 'hidden' : '')}>
            {candidate.name ? candidate.name.charAt(0).toUpperCase() : '#'}
          </div>
        </div>
        <div className="flex-1 min-w-0 ml-2">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-semibold text-white text-sm truncate">{candidate.name}</span>
            <span className="text-[10px] text-gray-500">{candidate.symbol}</span>
          </div>
        </div>
        <span className="text-xs text-gray-400 mr-2">{formatUsdc(committedBnb)} {nativeSymbol}</span>
        <span className="badge-cyan text-[10px] shrink-0">{t('dao.phase.voting')}</span>
      </div>
    </Link>
  )
}

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
] as const

function TokenCard({ tokenAddress, isListed }: { tokenAddress: string; isListed: boolean }) {
  const t = useT()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const bondingCurveAddress = getContractAddress(targetChainId, 'bondingCurve')
  const isEnabled = !isZeroAddress(bondingCurveAddress) && !isZeroAddress(tokenAddress as `0x${string}`)

  const { data, isLoading } = useReadContract({
    address: bondingCurveAddress as `0x${string}`,
    abi: BONDING_CURVE_ABI,
    functionName: 'getTokenInfo',
    args: [tokenAddress as `0x${string}`],
    chainId: targetChainId,
    query: { enabled: isEnabled, refetchInterval: 30000 },
  })

  const { data: erc20Name } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'name',
    chainId: targetChainId,
    query: { enabled: isEnabled },
  })

  const { data: erc20Symbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'symbol',
    chainId: targetChainId,
    query: { enabled: isEnabled },
  })

  const tokenInfo = useMemo(() => {
    if (!data) return null
    const d = data as any
    const tokenAddr = d.tokenAddress ?? d[0]
    if (!tokenAddr || isZeroAddress(tokenAddr as `0x${string}`)) return null
    return {
      reserveUsdc: BigInt(d.reserveUsdc ?? d[3] ?? 0n),
      isListedOnDex: Boolean(d.isListedOnDex ?? d[5] ?? false),
    }
  }, [data])

  const name = String(erc20Name ?? '')
  const symbol = String(erc20Symbol ?? '')
  const reserve = tokenInfo ? Number(formatEther(tokenInfo.reserveUsdc)) : 0

  if (isLoading || !tokenInfo) {
    return (
      <div className="card-dark flex items-center justify-center py-5">
        <Loader2 className="w-4 h-4 text-neon-green animate-spin" />
      </div>
    )
  }

  const accentColor = isListed ? 'text-doge-violet' : 'text-neon-green'
  const borderColor = isListed ? 'border-doge-violet/20 hover:border-doge-violet/40' : 'border-neon-green/20 hover:border-neon-green/40'
  const badgeColor = isListed ? 'bg-doge-violet/10 text-doge-violet border-doge-violet/20' : 'bg-neon-green/10 text-neon-green border-neon-green/20'
  const badgeText = isListed ? 'DEX' : t('home.internalTrade')

  return (
    <Link to={`/token/${tokenAddress}`} className="block">
      <div className={cn('card-dark group transition-all h-12 flex items-center px-3 border', borderColor)}>
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 border', isListed ? 'bg-doge-violet/10 border-doge-violet/30' : 'bg-neon-green/10 border-neon-green/30')}>
          <span className={cn('font-display font-bold text-[10px]', accentColor)}>
            {name ? name.charAt(0).toUpperCase() : '#'}
          </span>
        </div>
        <div className="flex-1 min-w-0 ml-2">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-semibold text-white text-sm truncate">{name}</span>
            <span className="text-[10px] text-gray-500">{symbol}</span>
          </div>
        </div>
        <span className="text-xs text-gray-400 mr-2">{formatUsdc(reserve)} {nativeSymbol}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium border shrink-0', badgeColor)}>
          {badgeText}
        </span>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const t = useT()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const daoAddress = getContractAddress(targetChainId, 'launchDAO')
  const feeDistributorAddress = getContractAddress(targetChainId, 'feeDistributor')
  const contractReady = !isZeroAddress(daoAddress)

  const { data: activeData, isLoading: loadingActive } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getActiveCandidates',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const { data: totalStakedData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'totalStakedBnb',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: candidateCountData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getCandidateCount',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: feeTotalDistributedData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'totalDistributed',
    chainId: targetChainId,
    query: { enabled: !isZeroAddress(feeDistributorAddress) },
  })

  const parsedCandidates = useMemo(() => {
    if (!activeData) return []
    const d = activeData as any
    const ids: bigint[] = d.ids ?? d[0] ?? []
    const names: string[] = d.names ?? d[1] ?? []
    const weights: bigint[] = d.weights ?? d[2] ?? []
    const committedBnbs: bigint[] = d.committedBnbs ?? d[3] ?? []
    if (!ids || !ids.length) return []
    return ids.map((id, i) => ({
      id: Number(id),
      name: names[i] ?? '',
      weight: Number(weights[i] ?? 0n),
      committedBnb: Number(formatEther(committedBnbs[i] ?? 0n)),
    }))
  }, [activeData])

  const newCandidates = useMemo(() => {
    return [...parsedCandidates].reverse().slice(0, 10)
  }, [parsedCandidates])

  const totalStaked = totalStakedData ? Number(formatEther(totalStakedData as bigint)) : 0
  const candidateCount = candidateCountData ? Number(candidateCountData as bigint) : 0
  const totalDistributed = feeTotalDistributedData ? Number(formatEther(feeTotalDistributedData as bigint)) : 0

  const allCandidateQueries = useMemo(() => {
    if (!candidateCount || !contractReady) return []
    return Array.from({ length: candidateCount }, (_, i) => ({
      address: daoAddress as `0x${string}`,
      abi: LAUNCH_DAO_ABI,
      functionName: 'candidates' as const,
      args: [BigInt(i)],
      chainId: targetChainId,
    }))
  }, [candidateCount, daoAddress, targetChainId, contractReady])

  const { data: allCandidatesData } = useReadContracts({
    contracts: allCandidateQueries,
    query: { enabled: allCandidateQueries.length > 0 },
  })

  const launchedTokens = useMemo(() => {
    if (!allCandidatesData) return []
    const tokens: { address: string; submitTime: number }[] = []
    allCandidatesData.forEach((result) => {
      if (result.status !== 'success' || !result.result) return
      const raw = result.result as any
      const wasLaunched = Boolean(raw.wasLaunched ?? raw[13] ?? false)
      const launchedToken = String(raw.launchedToken ?? raw[14] ?? '')
      const submitTime = Number(raw.submitTime ?? raw[8] ?? 0n)
      if (wasLaunched && !isZeroAddress(launchedToken as `0x${string}`)) {
        tokens.push({ address: launchedToken, submitTime })
      }
    })
    return tokens.sort((a, b) => b.submitTime - a.submitTime)
  }, [allCandidatesData])

  const bondingCurveAddress = getContractAddress(targetChainId, 'bondingCurve')

  const listedQueries = useMemo(() => {
    if (!launchedTokens.length || isZeroAddress(bondingCurveAddress)) return []
    return launchedTokens.map((t) => ({
      address: bondingCurveAddress as `0x${string}`,
      abi: BONDING_CURVE_ABI,
      functionName: 'isListed' as const,
      args: [t.address as `0x${string}`],
      chainId: targetChainId,
    }))
  }, [launchedTokens, bondingCurveAddress, targetChainId])

  const { data: listedResults } = useReadContracts({
    contracts: listedQueries,
    query: { enabled: listedQueries.length > 0 },
  })

  const internalTokens = useMemo(() => {
    if (!listedResults) return launchedTokens.map((t) => t.address)
    return launchedTokens.filter((_, i) => {
      if (listedResults[i]?.status !== 'success') return true
      return !Boolean(listedResults[i].result)
    }).map((t) => t.address)
  }, [launchedTokens, listedResults])

  const externalTokens = useMemo(() => {
    if (!listedResults) return []
    return launchedTokens.filter((_, i) => {
      if (listedResults[i]?.status !== 'success') return false
      return Boolean(listedResults[i].result)
    }).map((t) => t.address)
  }, [launchedTokens, listedResults])

  const launchedCount = launchedTokens.length

  const EmptyColumn = () => (
    <div className="card-dark text-center py-10">
      <p className="text-gray-500 text-sm">{t('dashboard.noTokens')}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.totalTvl')} value={`${formatUsdc(totalStaked)} ${nativeSymbol}`} icon={<TrendingUp className="w-5 h-5 text-doge-gold" />} />
        <StatCard title={t('dashboard.24hVolume')} value={`${formatUsdc(totalDistributed)} ${nativeSymbol}`} icon={<BarChart3 className="w-5 h-5 text-doge-cyan" />} />
        <StatCard title={t('dashboard.forgedTokens')} value={String(candidateCount)} icon={<Flame className="w-5 h-5 text-doge-gold" />} />
        <StatCard title={t('dashboard.launchedDex')} value={String(launchedCount)} icon={<Rocket className="w-5 h-5 text-neon-green" />} />
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/create" className="card-dark group hover:border-doge-gold/30 transition-all p-4 flex items-center gap-4">
          <div className="rounded-xl bg-doge-gold/10 p-3">
            <Flame className="w-6 h-6 text-doge-gold group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-white text-sm">{t('home.submitToken')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.quickForgeDesc')}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-doge-gold transition-colors" />
        </Link>
        <Link to="/perpetual" className="card-dark group hover:border-doge-cyan/30 transition-all p-4 flex items-center gap-4">
          <div className="rounded-xl bg-doge-cyan/10 p-3">
            <Target className="w-6 h-6 text-doge-cyan group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-white text-sm">{t('perpetualTrading')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.quickPerpDesc')}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-doge-cyan transition-colors" />
        </Link>
        <Link to="/dao" className="card-dark group hover:border-neon-green/30 transition-all p-4 flex items-center gap-4">
          <div className="rounded-xl bg-neon-green/10 p-3">
            <Shield className="w-6 h-6 text-neon-green group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-white text-sm">{t('dashboard.quickDao')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('dashboard.quickDaoDesc')}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-neon-green transition-colors" />
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-display font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-doge-cyan" />
              {t('dashboard.latestForge')}
            </h2>
            <Link to="/dao" className="text-xs text-doge-gold hover:text-doge-gold-light flex items-center gap-0.5">
              {t('dashboard.subscribeStake')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            {newCandidates.length > 0 ? (
              newCandidates.map((c) => (
                <CandidateCard key={c.id} candidateId={c.id} />
              ))
            ) : (
              <EmptyColumn />
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-display font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-neon-green" />
              {t('dashboard.internalMarket')}
            </h2>
            <span className="text-xs text-gray-500">{t('dashboard.trade')}</span>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            {internalTokens.length > 0 ? (
              internalTokens.map((addr) => (
                <TokenCard key={addr} tokenAddress={addr} isListed={false} />
              ))
            ) : (
              <EmptyColumn />
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-display font-bold flex items-center gap-2">
              <Rocket className="w-4 h-4 text-doge-violet" />
              {t('dashboard.externalMarket')}
            </h2>
            <span className="text-xs text-gray-500">{t('dashboard.trade')}</span>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            {externalTokens.length > 0 ? (
              externalTokens.map((addr) => (
                <TokenCard key={addr} tokenAddress={addr} isListed={true} />
              ))
            ) : (
              <EmptyColumn />
            )}
          </div>
        </div>
      </section>

      {parsedCandidates.length === 0 && launchedTokens.length === 0 && !loadingActive && (
        <div className="card-dark text-center py-16">
          <Rocket className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-display mb-2">{t('dashboard.noTokensYet')}</p>
          <p className="text-gray-500 text-sm mb-6">{t('dashboard.beFirstForge')}</p>
          <Link to="/create" className="btn-primary inline-flex items-center gap-2">
            <Flame className="w-4 h-4" /> {t('home.submitToken')}
          </Link>
        </div>
      )}
    </div>
  )
}
