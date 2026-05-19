import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { Flame, Vote, Rocket, TrendingUp, Shield, Coins, ArrowRight, Loader2, Search, Zap, Users, Gem, ChevronRight, BarChart3 } from 'lucide-react'
import { LAUNCH_DAO_ABI, BONDING_CURVE_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import CopyableAddress from '@/components/CopyableAddress'
import { useTargetChainId } from '@/hooks/useNetwork'
import { parseMetadata, sanitizeHref, cn, formatUsdc } from '@/lib/utils'
import type { TokenMeta } from '@/lib/utils'
import { useT } from '@/i18n/useT'

function PawIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor">
      <ellipse cx="50" cy="68" rx="22" ry="26" />
      <ellipse cx="24" cy="38" rx="12" ry="15" />
      <ellipse cx="76" cy="38" rx="12" ry="15" />
      <ellipse cx="14" cy="58" rx="9" ry="12" />
      <ellipse cx="86" cy="58" rx="9" ry="12" />
    </svg>
  )
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

  const candidate = useMemo(() => {
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
      status: Number(d.status ?? d[12] ?? 0),
      wasLaunched: d.wasLaunched ?? d[13] ?? false,
      launchedToken: d.launchedToken ?? d[14] ?? '',
    }
  }, [data, candidateId])

  const meta = useMemo<TokenMeta>(() => parseMetadata(candidate?.metadataURI || ''), [candidate?.metadataURI])

  if (isLoading) {
    return (
      <div className="bg-dark-800/50 border border-dark-500/20 rounded-xl p-5 flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 text-doge-gold animate-spin" />
      </div>
    )
  }

  if (!candidate) return null

  const isLaunched = candidate.wasLaunched && !isZeroAddress(candidate.launchedToken as `0x${string}`)

  const card = (
    <div className="group bg-dark-800/60 border border-dark-500/20 rounded-xl p-5 transition-all duration-300 hover:border-doge-gold/30 hover:bg-dark-800/80 shimmer">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden shrink-0 border border-dark-500/30">
          {meta.image ? (
            <img
              src={sanitizeHref(meta.image)}
              alt={candidate.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const f = (e.target as HTMLImageElement).nextElementSibling as HTMLElement; if (f) f.classList.remove('hidden') }}
            />
          ) : null}
          <div className={cn('w-11 h-11 rounded-full bg-dark-600 flex items-center justify-center font-display font-bold text-doge-gold text-lg', meta.image ? 'hidden' : '')}>
            {candidate.name ? candidate.name.charAt(0).toUpperCase() : '#'}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-white truncate">{candidate.name}</span>
            <span className="text-xs text-gray-500">{candidate.symbol}doge</span>
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', isLaunched ? 'bg-doge-gold/10 text-doge-gold border border-doge-gold/20' : 'bg-doge-cyan/10 text-doge-cyan border border-doge-cyan/20')}>
            {isLaunched ? 'Launched' : 'Voting'}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Subscribed</p>
          <p className="font-display font-bold text-white">{formatUsdc(Number(formatEther(candidate.totalSubBnb)))} {nativeSymbol}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Weight</p>
          <p className="font-display font-semibold text-doge-gold">{Number(candidate.totalWeight).toLocaleString()} 分</p>
        </div>
      </div>

      {isLaunched && !isZeroAddress(candidate.launchedToken as `0x${string}`) && (
        <div className="mt-3 pt-3 border-t border-dark-500/20" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] text-gray-500 mb-1">代币合约</p>
          <CopyableAddress address={candidate.launchedToken} chainId={targetChainId} type="token" />
        </div>
      )}

      {!isLaunched && candidate.proposer && !isZeroAddress(candidate.proposer as `0x${string}`) && (
        <div className="mt-3 pt-3 border-t border-dark-500/20">
          <p className="text-[10px] text-gray-500 mb-1">提案者</p>
          <CopyableAddress address={candidate.proposer} chainId={targetChainId} type="address" />
        </div>
      )}
    </div>
  )

  if (isLaunched) {
    return <Link to={`/token/${candidate.launchedToken}`} className="block">{card}</Link>
  }
  return card
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

const FEATURES = [
  {
    icon: Vote,
    title: 'DAO 民主发射',
    desc: '社区质押投票决定哪些代币发射，DOGE 质押享 3 倍队列排序加成',
    color: 'text-doge-gold',
    bg: 'bg-doge-gold/10',
    border: 'border-doge-gold/20',
    glow: 'border-glow-gold',
  },
  {
    icon: Shield,
    title: 'USDC 公平认购',
    desc: '认购只用 USDC，满 20000 自动入队，超额按比例退还本金',
    color: 'text-doge-cyan',
    bg: 'bg-doge-cyan/10',
    border: 'border-doge-cyan/20',
    glow: 'border-glow-cyan',
  },
  {
    icon: Coins,
    title: '每日限量发射',
    desc: '每天只发射 1 只代币，队列按分值排序，认购满优先于投票胜出',
    color: 'text-doge-gold',
    bg: 'bg-doge-gold/10',
    border: 'border-doge-gold/20',
    glow: 'border-glow-gold',
  },
  {
    icon: Zap,
    title: '联合曲线交易',
    desc: '70% USDC配30%代币组LP + 25%做多池 + 5%平台，做多做空双向获利',
    color: 'text-neon-green',
    bg: 'bg-neon-green/10',
    border: 'border-neon-green/20',
    glow: 'border-glow-gold',
  },
]

const STEPS = [
  { num: '01', title: '提交候选', desc: '支付 3-10 USDC 候选费，提交代币方案进入投票池', icon: Flame },
  { num: '02', title: '认购投票', desc: '用 USDC 认购候选币（最低 1 USDC），质押 DOGE 获取投票权益加成', icon: Vote },
  { num: '03', title: '发射交易', desc: '认购满 20000 USDC 或投票第一，代币进入联合曲线内盘交易', icon: Rocket },
]

export default function Home() {
  const t = useT()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const daoAddress = getContractAddress(targetChainId, 'launchDAO')
  const contractReady = !isZeroAddress(daoAddress)

  const [searchQuery, setSearchQuery] = useState('')
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  const parsedCandidates = useMemo(() => {
    if (!activeData) return []
    const d = activeData as any
    const ids: bigint[] = d.ids ?? d[0] ?? []
    const names: string[] = d.names ?? d[1] ?? []
    const weights: bigint[] = d.weights ?? d[3] ?? []
    const subBnbs: bigint[] = d.subBnbs ?? d[4] ?? []
    if (!ids || !ids.length) return []
    return ids.map((id, i) => ({
      id: Number(id),
      name: names[i] ?? '',
      weight: Number(weights[i] ?? 0n),
      subBnb: Number(formatEther(subBnbs[i] ?? 0n)),
    }))
  }, [activeData])

  const filteredCandidates = useMemo(() => {
    let result = [...parsedCandidates]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    result.sort((a, b) => b.subBnb - a.subBnb)
    return result
  }, [parsedCandidates, searchQuery])

  const totalStaked = totalStakedData ? Number(formatEther(totalStakedData as bigint)) : 0

  const parallaxOffset = scrollY * 0.3

  return (
    <div className="space-y-0">
      <section className="relative overflow-hidden min-h-[85vh] flex items-center">
        <div className="absolute inset-0 bg-dark-950">
          <div
            className="absolute inset-0"
            style={{ transform: `translateY(${parallaxOffset * 0.2}px)` }}
          >
            <div className="absolute top-10 left-[10%] w-[500px] h-[500px] bg-doge-gold/[0.04] rounded-full blur-[150px]" />
            <div className="absolute bottom-20 right-[5%] w-[400px] h-[400px] bg-doge-cyan/[0.03] rounded-full blur-[120px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-doge-gold/[0.02] rounded-full blur-[200px]" />
          </div>

          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(245,158,11,0.5) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }} />

          <PawIcon className="absolute top-[8%] right-[12%] w-20 h-20 text-doge-gold paw-float opacity-10" />
          <PawIcon className="absolute top-[25%] left-[8%] w-14 h-14 text-doge-cyan paw-float-delay opacity-10" />
          <PawIcon className="absolute bottom-[20%] right-[25%] w-16 h-16 text-doge-gold paw-float-delay2 opacity-10" />
          <PawIcon className="absolute bottom-[35%] left-[20%] w-10 h-10 text-doge-cyan paw-float opacity-[0.07]" />
          <PawIcon className="absolute top-[45%] right-[6%] w-12 h-12 text-doge-gold paw-float-delay opacity-[0.07]" />
        </div>

        <div className="relative z-10 w-full px-6 lg:px-16 py-20 flex justify-center">
          <div className="max-w-4xl text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center hero-glow">
                <Flame className="w-7 h-7 text-doge-gold" />
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-gold">Launchpad</span>
                <span className="badge-cyan">USDC 认购</span>
              </div>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-black mb-4 leading-[1.1] tracking-tight">
              <span className="text-gradient-gold">DogePad</span>
              <br />
              <span className="text-white/90 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-wide">金狗发射台</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-400 mb-3 max-w-2xl mx-auto leading-relaxed">
              社区驱动的公平发射平台 — USDC 认购、DOGE 质押加成、联合曲线交易
            </p>
            <p className="text-sm text-gray-500 mb-8 max-w-xl mx-auto">
              每一只金狗，都由社区选出。质押 DOGE 获取 3 倍投票加成，1 USDC 即可认购。
            </p>

            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <Link to="/dao" className="btn-primary inline-flex items-center gap-2 text-base px-8 py-3">
                <Vote className="w-5 h-5" />
                进入 DAO 投票
              </Link>
              <Link to="/create" className="btn-secondary inline-flex items-center gap-2 text-base px-8 py-3">
                <Flame className="w-5 h-5" />
                提交候选代币
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
              <div>
                <p className="text-2xl font-display font-bold text-doge-gold">{formatUsdc(totalStaked)}</p>
                <p className="text-xs text-gray-500">{nativeSymbol} 质押</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-doge-cyan">{candidateCount}</p>
                <p className="text-xs text-gray-500">候选代币</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-neon-green">20000</p>
                <p className="text-xs text-gray-500">USDC 发射阈值</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-dark-950 to-transparent" />
      </section>

      <section className="px-6 lg:px-16 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            三步发射<span className="text-gradient-gold">金狗</span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            从提交到发射，全程社区驱动，公平透明
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-doge-gold/30 to-transparent" />
          <div className="hidden md:block absolute top-[48px] left-[33%] w-px h-8 step-line" />
          <div className="hidden md:block absolute top-[48px] right-[33%] w-px h-8 step-line" />

          {STEPS.map((step) => (
            <div key={step.num} className="relative text-center group">
              <div className="w-16 h-16 rounded-2xl bg-dark-800 border border-doge-gold/20 flex items-center justify-center mx-auto mb-5 group-hover:border-doge-gold/50 transition-all duration-300 border-glow-gold">
                <step.icon className="w-7 h-7 text-doge-gold" />
              </div>
              <span className="text-xs font-display font-bold text-doge-gold/60 mb-2 block">{step.num}</span>
              <h3 className="text-xl font-display font-bold mb-2">{step.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 lg:px-16 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            为什么选择<span className="text-gradient-gold"> DogePad</span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            不只是发射台，更是社区共治的代币生态
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className={cn(
                'group bg-dark-800/50 border rounded-xl p-6 transition-all duration-300 hover:bg-dark-800/80',
                feat.border,
                feat.glow
              )}
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center mb-4', feat.bg)}>
                <feat.icon className={cn('w-5 h-5', feat.color)} />
              </div>
              <h3 className="text-lg font-display font-bold mb-2">{feat.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 lg:px-16 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold flex items-center justify-center gap-3">
              <TrendingUp className="w-7 h-7 text-doge-gold" />
              热门候选
            </h2>
            <p className="text-gray-400 text-sm mt-1">社区正在投票的代币项目</p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索代币..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-dark pl-10 w-48"
                />
              </div>
              <Link to="/dao" className="text-sm text-doge-gold hover:text-doge-gold-light flex items-center gap-1 shrink-0">
                查看全部 <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        {loadingActive ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-doge-gold animate-spin" />
          </div>
        ) : filteredCandidates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {filteredCandidates.slice(0, 6).map((c) => (
              <CandidateCard key={c.id} candidateId={c.id} />
            ))}
          </div>
        ) : (
          <div className="bg-dark-800/50 border border-dark-500/20 rounded-xl text-center py-20">
            <PawIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-display mb-2">还没有候选代币</p>
            <p className="text-gray-500 text-sm mb-6">成为第一个在 DogePad 发射代币的创造者</p>
            <Link to="/create" className="btn-primary inline-flex items-center gap-2">
              <Flame className="w-4 h-4" /> 提交候选代币
            </Link>
          </div>
        )}
        </div>
      </section>

      {launchedTokens.length > 0 && (
        <section className="px-6 lg:px-16 py-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-display font-bold flex items-center justify-center gap-3">
                <Rocket className="w-7 h-7 text-neon-green" />
                已发射代币
              </h2>
              <p className="text-gray-400 text-sm mt-1">通过联合曲线交易已发射的代币</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {launchedTokens.map((addr) => (
                <LaunchedTokenCard key={addr} tokenAddress={addr} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-6 lg:px-16 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-dark-800/60 border border-doge-gold/20 p-10 lg:p-16 border-glow-gold text-center">
            <div className="absolute top-0 right-0 w-80 h-80 bg-doge-gold/[0.04] rounded-full blur-[120px]" />
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-doge-cyan/[0.03] rounded-full blur-[100px]" />
            <PawIcon className="absolute top-6 right-10 w-16 h-16 text-doge-gold paw-float opacity-[0.08]" />
            <PawIcon className="absolute bottom-8 left-8 w-12 h-12 text-doge-cyan paw-float-delay opacity-[0.08]" />

            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
                准备好发射你的<span className="text-gradient-gold">金狗</span>了吗？
              </h2>
              <p className="text-gray-400 mb-8 leading-relaxed">
                只需 3 USDC 即可提交候选代币，1 USDC 即可认购参与。质押 DOGE 享 3 倍投票加成。
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link to="/create" className="btn-primary inline-flex items-center gap-2 px-8 py-3">
                  <Rocket className="w-5 h-5" />
                  立即提交代币
                </Link>
                <Link to="/dao" className="btn-secondary inline-flex items-center gap-2 px-8 py-3">
                  <Vote className="w-5 h-5" />
                  参与投票
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 lg:px-16 py-16 border-t border-dark-500/20">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-4xl mx-auto text-center">
          <div>
            <div className="w-10 h-10 rounded-xl bg-doge-gold/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-5 h-5 text-doge-gold" />
            </div>
            <p className="font-display font-bold text-sm">公平认购</p>
            <p className="text-xs text-gray-500 mt-1">USDC 认购，超额退还</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-xl bg-doge-cyan/10 flex items-center justify-center mx-auto mb-3">
              <Users className="w-5 h-5 text-doge-cyan" />
            </div>
            <p className="font-display font-bold text-sm">社区共治</p>
            <p className="text-xs text-gray-500 mt-1">DOGE 3x 加成</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-xl bg-neon-green/10 flex items-center justify-center mx-auto mb-3">
              <Gem className="w-5 h-5 text-neon-green" />
            </div>
            <p className="font-display font-bold text-sm">双向交易</p>
            <p className="text-xs text-gray-500 mt-1">做多+做空</p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-xl bg-doge-violet/10 flex items-center justify-center mx-auto mb-3">
              <Zap className="w-5 h-5 text-doge-violet" />
            </div>
            <p className="font-display font-bold text-sm">反做空飞轮</p>
            <p className="text-xs text-gray-500 mt-1">销毁引擎</p>
          </div>
        </div>
      </section>
    </div>
  )
}
