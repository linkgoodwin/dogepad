import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { TrendingUp, BarChart3, Flame, Users, Search, Vote, ArrowRight, Rocket, Loader2 } from 'lucide-react'
import StatCard from '@/components/StatCard'
import CopyableAddress from '@/components/CopyableAddress'
import { LAUNCH_DAO_ABI, BONDING_CURVE_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
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
}

function CandidateCard({ candidateId }: { candidateId: number }) {
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
      submitTime: d.submitTime ?? d[6] ?? 0n,
      expireTime: d.expireTime ?? d[8] ?? 0n,
      status: Number(d.status ?? d[10] ?? 0),
      wasLaunched: d.wasLaunched ?? d[11] ?? false,
      launchedToken: d.launchedToken ?? d[12] ?? '',
    }
  }, [data, candidateId])

  const meta = useMemo<TokenMeta>(() => parseMetadata(candidate?.metadataURI || ''), [candidate?.metadataURI])

  if (isLoading) {
    return (
      <div className="card-dark flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-doge-gold animate-spin" />
      </div>
    )
  }

  if (!candidate) return null

  const committedBnb = Number(formatEther(candidate.totalSubBnb))
  const isLaunched = candidate.wasLaunched && !isZeroAddress(candidate.launchedToken as `0x${string}`)

  const cardContent = (
    <div className="card-dark">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden shrink-0">
          {meta.image ? (
            <img
              src={sanitizeHref(meta.image)}
              alt={candidate.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement
                if (fallback) fallback.classList.remove('hidden')
              }}
            />
          ) : null}
          <div
            className={cn(
              'w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center font-display font-bold text-doge-gold',
              meta.image ? 'hidden' : ''
            )}
          >
            {candidate.name ? candidate.name.charAt(0).toUpperCase() : '#'}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-white truncate">{candidate.name}</span>
            <span className="text-xs text-gray-400">{candidate.symbol}</span>
          </div>
        </div>
        {isLaunched ? (
          <span className="badge-gold">Launched</span>
        ) : (
          <span className="badge-cyan">Voting</span>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400">Subscribed</p>
          <p className="font-display font-bold text-white">{formatUsdc(committedBnb)} {nativeSymbol}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Weight</p>
          <p className="font-display font-semibold text-doge-gold">{Number(candidate.totalWeight).toLocaleString()}</p>
        </div>
      </div>

      {isLaunched && !isZeroAddress(candidate.launchedToken as `0x${string}`) && (
        <div className="pt-3 border-t border-dark-500/20" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] text-gray-500 mb-1">代币合约</p>
          <CopyableAddress address={candidate.launchedToken} chainId={targetChainId} type="token" />
        </div>
      )}

      {!isLaunched && candidate.proposer && !isZeroAddress(candidate.proposer as `0x${string}`) && (
        <div className="pt-3 border-t border-dark-500/20">
          <p className="text-[10px] text-gray-500 mb-1">提案者</p>
          <CopyableAddress address={candidate.proposer} chainId={targetChainId} type="address" />
        </div>
      )}
    </div>
  )

  if (isLaunched) {
    return <Link to={`/token/${candidate.launchedToken}`} className="block">{cardContent}</Link>
  }

  return cardContent
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

function LaunchedTokenCard({ tokenAddress }: { tokenAddress: string }) {
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

  const { data: listedData } = useReadContract({
    address: bondingCurveAddress as `0x${string}`,
    abi: BONDING_CURVE_ABI,
    functionName: 'isListed',
    args: [tokenAddress as `0x${string}`],
    chainId: targetChainId,
    query: { enabled: isEnabled },
  })

  const tokenInfo = useMemo(() => {
    if (!data) return null
    const d = data as any
    const tokenAddr = d.tokenAddress ?? d[0]
    if (!tokenAddr || isZeroAddress(tokenAddr as `0x${string}`)) return null
    return {
      reserveBnb: BigInt(d.reserveBnb ?? d[3] ?? 0n),
      isListedOnDex: Boolean(d.isListedOnDex ?? d[5] ?? false),
    }
  }, [data])

  const name = String(erc20Name ?? '')
  const symbol = String(erc20Symbol ?? '')
  const reserve = tokenInfo ? Number(formatEther(tokenInfo.reserveBnb)) : 0
  const isListed = listedData ? Boolean(listedData) : tokenInfo?.isListedOnDex ?? false

  if (isLoading || !tokenInfo) {
    return (
      <div className="bg-dark-800/50 border border-dark-500/20 rounded-xl p-5 flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 text-neon-green animate-spin" />
      </div>
    )
  }

  return (
    <Link to={`/token/${tokenAddress}`} className="block">
      <div className="group bg-dark-800/60 border border-neon-green/20 rounded-xl p-5 transition-all duration-300 hover:border-neon-green/40 hover:bg-dark-800/80">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-full bg-neon-green/10 flex items-center justify-center shrink-0 border border-neon-green/30">
            <span className="font-display font-bold text-neon-green text-lg">
              {name ? name.charAt(0).toUpperCase() : '#'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-white truncate">{name}</span>
              <span className="text-xs text-gray-500">{symbol}</span>
            </div>
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium',
              isListed
                ? 'bg-doge-violet/10 text-doge-violet border border-doge-violet/20'
                : 'bg-neon-green/10 text-neon-green border border-neon-green/20'
            )}>
              {isListed ? 'DEX' : '内盘交易'}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">储备量</p>
            <p className="font-display font-bold text-white">{formatUsdc(reserve)} {nativeSymbol}</p>
          </div>
          <div className="text-right">
            <BarChart3 className="w-5 h-5 text-neon-green/50 group-hover:text-neon-green transition-colors" />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-dark-500/20" onClick={(e) => e.stopPropagation()}>
          <CopyableAddress address={tokenAddress} chainId={targetChainId} type="token" />
        </div>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const t = useT()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const daoAddress = getContractAddress(targetChainId, 'launchDAO')
  const contractReady = !isZeroAddress(daoAddress)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'volume' | 'change' | 'new' | 'marketCap'>('volume')

  const sortTabs = [
    { key: 'volume' as const, label: t('home.sort.volume') },
    { key: 'change' as const, label: t('home.sort.gainers') },
    { key: 'new' as const, label: t('home.sort.new') },
    { key: 'marketCap' as const, label: t('home.sort.marketCap') },
  ]

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

  const filteredCandidates = useMemo(() => {
    let result = [...parsedCandidates]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    switch (sortBy) {
      case 'volume':
        result.sort((a, b) => b.committedBnb - a.committedBnb)
        break
      case 'change':
        result.sort((a, b) => b.weight - a.weight)
        break
      case 'new':
        result.reverse()
        break
      case 'marketCap':
        result.sort((a, b) => b.committedBnb - a.committedBnb)
        break
    }
    return result
  }, [parsedCandidates, searchQuery, sortBy])

  const totalStaked = totalStakedData ? Number(formatEther(totalStakedData as bigint)) : 0
  const candidateCount = candidateCountData ? Number(candidateCountData as bigint) : 0

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
    const tokens: string[] = []
    allCandidatesData.forEach((result) => {
      if (result.status !== 'success' || !result.result) return
      const raw = result.result as any
      const wasLaunched = Boolean(raw.wasLaunched ?? raw[13] ?? false)
      const launchedToken = String(raw.launchedToken ?? raw[14] ?? '')
      if (wasLaunched && !isZeroAddress(launchedToken as `0x${string}`)) {
        tokens.push(launchedToken)
      }
    })
    return tokens
  }, [allCandidatesData])

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-dark-800 border border-dark-500/30 p-8 lg:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-doge-gold/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-doge-cyan/3 rounded-full blur-[100px]" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center">
              <Flame className="w-6 h-6 text-doge-gold" />
            </div>
            <span className="badge-gold">{t('home.badge')}</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-display font-extrabold mb-3">
            <span className="gold-text">DogePad</span>
          </h1>
          <p className="text-lg text-gray-400 mb-2">
            {t('home.subtitle')}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {t('home.tagline')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/dao" className="btn-primary inline-flex items-center gap-2">
              <Vote className="w-4 h-4" />
              {t('home.daoVote')}
            </Link>
            <Link to="/create" className="btn-secondary inline-flex items-center gap-2">
              {t('home.submitToken')}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('home.stat.tvl')} value={`${formatUsdc(totalStaked)} ${nativeSymbol}`} change={0} icon={<TrendingUp className="w-5 h-5 text-doge-gold" />} />
        <StatCard title={t('home.stat.volume')} value={`${formatUsdc(totalStaked)} ${nativeSymbol}`} change={0} icon={<BarChart3 className="w-5 h-5 text-doge-cyan" />} />
        <StatCard title={t('home.stat.forged')} value={String(candidateCount)} change={0} icon={<Flame className="w-5 h-5 text-doge-gold" />} />
        <StatCard title={t('home.stat.forgers')} value="0" change={0} icon={<Users className="w-5 h-5 text-doge-cyan" />} />
      </section>

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-display font-bold">{t('home.hotForge')}</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-dark pl-10 w-48"
              />
            </div>
            <div className="flex gap-1">
              {sortTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSortBy(tab.key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors relative ${
                    sortBy === tab.key
                      ? 'text-doge-gold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {sortBy === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-doge-gold" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loadingActive ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-doge-gold animate-spin" />
          </div>
        ) : filteredCandidates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCandidates.map((c) => (
              <CandidateCard key={c.id} candidateId={c.id} />
            ))}
          </div>
        ) : (
          <div className="card-dark text-center py-16">
            <Rocket className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-display mb-2">No tokens yet</p>
            <p className="text-gray-500 text-sm mb-6">Be the first to forge a new token on DogePad</p>
            <Link to="/create" className="btn-primary inline-flex items-center gap-2">
              <Flame className="w-4 h-4" /> {t('home.submitToken')}
            </Link>
          </div>
        )}
      </section>

      {filteredCandidates.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-display font-bold">{t('home.newForge')}</h2>
            <Link to="/dao" className="text-sm text-doge-gold hover:text-doge-gold-light flex items-center gap-1">
              {t('common.viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-nowrap">
            {filteredCandidates.slice(0, 5).map((c) => (
              <div key={c.id} className="min-w-[280px] max-w-[320px]">
                <CandidateCard candidateId={c.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {launchedTokens.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Rocket className="w-6 h-6 text-neon-green" />
              已发射代币
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {launchedTokens.map((addr) => (
              <LaunchedTokenCard key={addr} tokenAddress={addr} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
