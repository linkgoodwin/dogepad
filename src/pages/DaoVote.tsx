import { useState, useMemo, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { Vote, Clock, Flame, TrendingUp, Coins, AlertCircle, Timer, Gem, Sparkles, Inbox, Recycle, RefreshCw, ShieldAlert, Loader2, WifiOff, Globe, Twitter, MessageCircle, UsersRound, Rocket, Wallet, ArrowDownToLine, HandCoins, Zap, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn, parseMetadata, sanitizeHref, formatUsdc } from '@/lib/utils'
import type { TokenMeta } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { LAUNCH_DAO_ABI, BONDING_CURVE_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { fixWalletNetwork } from '@/config/wagmi'
import CopyableAddress from '@/components/CopyableAddress'

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
] as const

interface Candidate {
  id: number
  name: string
  symbol: string
  proposer: string
  totalWeight: bigint
  totalSubBnb: bigint
  totalSubDoge: bigint
  totalRightsVotes: bigint
  submitTime: bigint
  expireTime: bigint
  gracePeriodEnd: bigint
  durationTier: number
  status: number
  metadataURI: string
  wasLaunched: boolean
  launchedToken: string
  queueTime: bigint
}

const DURATION_TIERS = [
  { value: 0, labelKey: 'create.tier3Days', duration: '3d', fee: '3', feeBnb: 3 },
  { value: 1, labelKey: 'create.tier7Days', duration: '7d', fee: '5', feeBnb: 5 },
  { value: 2, labelKey: 'create.tier30Days', duration: '30d', fee: '10', feeBnb: 10 },
]

const STATUS_MAP: Record<number, { labelKey: string; color: string }> = {
  0: { labelKey: 'dao.activeTab', color: 'text-neon-green' },
  1: { labelKey: 'dao.queuedBadge', color: 'text-doge-cyan' },
  2: { labelKey: 'dao.statusExpired', color: 'text-gray-400' },
  3: { labelKey: 'dao.graceTab', color: 'text-neon-yellow' },
  4: { labelKey: 'dao.statusRecyclable', color: 'text-neon-red' },
  5: { labelKey: 'dao.launched', color: 'text-doge-gold' },
}

const STAKE_DURATIONS = [
  { value: 0, label: 'dao.stakeDurationFlexible', multiplier: '1x' },
  { value: 1, label: 'dao.stakeDuration30d', multiplier: '1.5x' },
  { value: 2, label: 'dao.stakeDuration90d', multiplier: '2x' },
  { value: 3, label: 'dao.stakeDuration180d', multiplier: '3x' },
]

interface StakePosition {
  id: number
  token: `0x${string}`
  amount: bigint
  startTime: bigint
  duration: bigint
  maturityTime: bigint
  withdrawn: boolean
}

function CandidateDetailCard({
  candidateId,
  isSelected,
  onSelect,
  rank,
  variant,
  daoAddress,
  abi,
  doWrite,
  onError,
  currentAddress,
}: {
  candidateId: number
  isSelected: boolean
  onSelect: () => void
  rank: number
  variant: 'active' | 'grace' | 'recycle' | 'queued'
  daoAddress: `0x${string}`
  abi: typeof LAUNCH_DAO_ABI
  doWrite: (params: { functionName: string; args: readonly unknown[]; value?: bigint; gas?: bigint }) => Promise<`0x${string}`>
  onError?: (msg: string) => void
  currentAddress?: `0x${string}`
}) {
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const t = useT()

  const { data, isLoading } = useReadContract({
    address: daoAddress,
    abi,
    functionName: 'candidates',
    args: [BigInt(candidateId)],
    chainId: targetChainId,
    query: { enabled: !isZeroAddress(daoAddress), refetchInterval: 30000 },
  })

  const candidate = useMemo<Candidate | null>(() => {
    if (!data) return null
    const d = data as any
    const proposer = d.proposer ?? d[0] ?? ''
    const name = d.name ?? d[1] ?? ''
    const symbol = d.symbol ?? d[2] ?? ''
    const metadataURI = d.metadataURI ?? d[3] ?? ''
    const totalWeight = d.totalWeight ?? d[4] ?? 0n
    const totalSubBnb = d.totalSubBnb ?? d[5] ?? 0n
    const totalSubDoge = d.totalSubDoge ?? d[6] ?? 0n
    const totalRightsVotes = d.totalRightsVotes ?? d[7] ?? 0n
    const submitTime = d.submitTime ?? d[8] ?? 0n
    const durationTier = d.durationTier ?? d[9] ?? 0
    const expireTime = d.expireTime ?? d[10] ?? 0n
    const gracePeriodEnd = d.gracePeriodEnd ?? d[11] ?? 0n
    const status = d.status ?? d[12] ?? 0
    const wasLaunched = d.wasLaunched ?? d[13] ?? false
    const launchedToken = d.launchedToken ?? d[14] ?? ''
    const launchedTokenSupply = d.launchedTokenSupply ?? d[15] ?? 0n
    const queueTime = d.queueTime ?? d[16] ?? 0n
    return {
      id: candidateId,
      name,
      symbol,
      proposer,
      metadataURI,
      totalWeight,
      totalSubBnb,
      totalSubDoge,
      totalRightsVotes,
      submitTime,
      expireTime,
      gracePeriodEnd,
      durationTier: Number(durationTier),
      status: Number(status),
      wasLaunched,
      launchedToken,
      queueTime,
    }
  }, [data, candidateId])

  const meta = useMemo<TokenMeta>(() => parseMetadata(candidate?.metadataURI || ''), [candidate?.metadataURI])

  const formatCountdown = (timestamp: number) => {
    const diff = timestamp - Date.now() / 1000
    if (diff <= 0) return t('dao.statusExpired')
    const d = Math.floor(diff / 86400)
    const h = Math.floor((diff % 86400) / 3600)
    const m = Math.floor((diff % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dark-500/30 bg-dark-700 p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-doge-gold animate-spin" />
      </div>
    )
  }

  if (!candidate) return null

  const tier = DURATION_TIERS[candidate.durationTier] || DURATION_TIERS[0]

  const borderColor = variant === 'active'
    ? isSelected ? 'border-doge-gold/50 bg-doge-gold/5' : 'border-dark-500/30 bg-dark-700 hover:border-dark-500/60'
    : variant === 'queued'
    ? isSelected ? 'border-doge-cyan/50 bg-doge-cyan/10' : 'border-doge-cyan/30 bg-doge-cyan/5 hover:border-doge-cyan/50'
    : variant === 'grace'
    ? 'border-neon-yellow/30 bg-neon-yellow/5'
    : 'border-neon-red/30 bg-neon-red/5'

  const accentColor = variant === 'active' ? 'text-doge-gold' : variant === 'queued' ? 'text-doge-cyan' : variant === 'grace' ? 'text-neon-yellow' : 'text-neon-red'

  return (
    <div
      className={cn(
        'relative rounded-xl border p-4 transition-all duration-200',
        (variant === 'active' || variant === 'queued') ? 'cursor-pointer' : '',
        borderColor
      )}
      onClick={(variant === 'active' || variant === 'queued') ? onSelect : undefined}
    >
      {rank === 0 && variant === 'active' && (
        <div className="absolute top-2 right-2">
          <span className="badge-gold text-[10px]">{t('dao.leading')}</span>
        </div>
      )}
      {variant === 'queued' && (
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 text-[10px] font-medium bg-doge-cyan/10 text-doge-cyan border border-doge-cyan/30 rounded-full">{t('dao.queuedBadge')}</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {meta.image ? (
            <img
              src={sanitizeHref(meta.image)}
              alt={candidate.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-dark-500/50"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
            />
          ) : null}
          <div className={cn('w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center font-display font-bold', accentColor, meta.image ? 'hidden' : '')}>
            {candidate.name ? candidate.name.charAt(0).toUpperCase() : `#${candidateId}`}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-base">{candidate.name}</span>
            {candidate.symbol && (
              <span className="text-xs text-gray-400 bg-dark-600 px-1.5 py-0.5 rounded">{candidate.symbol}</span>
            )}
            {candidate.proposer && typeof candidate.proposer === 'string' && (
              <span className="text-xs text-gray-500">
                by {String(candidate.proposer).slice(0, 6)}...{String(candidate.proposer).slice(-4)}
              </span>
            )}
          </div>

          {meta.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{meta.description}</p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <div>
              <div className={cn('font-display font-bold text-sm', accentColor)}>
                {formatUsdc(Number(formatEther(candidate.totalSubBnb)))} {nativeSymbol}
              </div>
              <div className="text-xs text-gray-500">{t('dao.subscribed')}</div>
            </div>
            {candidate.totalSubDoge > 0n && (
              <div>
                <div className="font-display font-bold text-sm text-doge-cyan">
                  {formatUsdc(Number(formatEther(candidate.totalSubDoge)))} DOGE
                </div>
                <div className="text-xs text-gray-500">{t('dao.dogeSub')}</div>
              </div>
            )}
            <div>
              <div className="font-display font-bold text-sm">{Number(candidate.totalWeight).toLocaleString()} {t('dao.pointsUnit')}</div>
              <div className="text-xs text-gray-500">{t('dao.weight')}</div>
            </div>
            {variant === 'active' && candidate.expireTime > 0n && (
              <div>
                <div className="text-xs text-gray-300">{formatCountdown(Number(candidate.expireTime))}</div>
                <div className="text-xs text-gray-500">{t('dao.expires')}</div>
              </div>
            )}
            {variant === 'grace' && candidate.gracePeriodEnd > 0n && (
              <div>
                <div className="text-xs font-bold text-neon-yellow">{formatCountdown(Number(candidate.gracePeriodEnd))}</div>
                <div className="text-xs text-gray-500">{t('dao.graceEnds')}</div>
              </div>
            )}
          </div>

          {(meta.website || meta.twitter || meta.telegram || meta.discord) && (
            <div className="flex items-center gap-2 mt-2">
              {meta.website && (
                <a href={sanitizeHref(meta.website)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-gold transition-colors" title={t('common.website')} onClick={(e) => e.stopPropagation()}>
                  <Globe className="w-3.5 h-3.5" />
                </a>
              )}
              {meta.twitter && (
                <a href={sanitizeHref(/^(https?:\/\/|twitter\.com|x\.com)/i.test(meta.twitter) ? meta.twitter : `https://twitter.com/${meta.twitter}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-cyan transition-colors" title={t('tokenDetail.twitter')} onClick={(e) => e.stopPropagation()}>
                  <Twitter className="w-3.5 h-3.5" />
                </a>
              )}
              {meta.telegram && (
                <a href={sanitizeHref(/^(https?:\/\/|t\.me)/i.test(meta.telegram) ? meta.telegram : `https://t.me/${meta.telegram}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-cyan transition-colors" title={t('tokenDetail.telegram')} onClick={(e) => e.stopPropagation()}>
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              )}
              {meta.discord && (
                <a href={sanitizeHref(/^(https?:\/\/|discord\.gg|discord\.com)/i.test(meta.discord) ? meta.discord : `https://discord.gg/${meta.discord}`)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-doge-violet transition-colors" title={t('tokenDetail.discord')} onClick={(e) => e.stopPropagation()}>
                  <UsersRound className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {candidate.wasLaunched && !isZeroAddress(candidate.launchedToken as `0x${string}`) && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] text-gray-500 mb-0.5">{t('dao.tokenContract')}</p>
              <CopyableAddress address={candidate.launchedToken} chainId={targetChainId} type="token" />
            </div>
          )}

          {!candidate.wasLaunched && candidate.proposer && !isZeroAddress(candidate.proposer as `0x${string}`) && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] text-gray-500 mb-0.5">{t('dao.proposer')}</p>
              <CopyableAddress address={candidate.proposer} chainId={targetChainId} type="address" />
            </div>
          )}
        </div>
      </div>

      {variant === 'grace' && (
        <div className="bg-dark-700/50 rounded-lg p-3 mt-3">
          <p className="text-xs text-neon-yellow mb-2">{t('dao.graceOnlyCreator')}</p>
          <div className="flex gap-2">
            {DURATION_TIERS.map((tier) => (
              <button
                key={tier.value}
                className="flex-1 py-1.5 text-xs rounded bg-dark-600 text-gray-300 hover:text-neon-yellow hover:bg-dark-500 transition-colors border border-dark-500"
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await doWrite({
                      functionName: 'renewCandidate',
                      args: [BigInt(candidateId), BigInt(tier.value), true, true, true],
                      value: parseEther(tier.feeBnb.toFixed(2)),
                    })
                  } catch (err: any) {
                    const msg = err?.shortMessage || err?.message || ''
                    if (msg !== 'RPC_LIMITED' && !msg.includes('User rejected') && !msg.includes('denied')) {
                      onError?.(msg.slice(0, 150))
                    } else if (msg === 'RPC_LIMITED') {
                      onError?.('RPC_LIMITED')
                    }
                  }
                }}
              >
                {t(tier.labelKey)} · {tier.fee} {nativeSymbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {variant === 'recycle' && (
        <div className="bg-dark-700/50 rounded-lg p-3 mt-3">
          <p className="text-xs text-neon-red mb-2">{t('revival.anyoneClaim')}</p>
          <div className="flex gap-2">
            {DURATION_TIERS.map((tier) => (
              <button
                key={tier.value}
                className="flex-1 py-1.5 text-xs rounded bg-dark-600 text-gray-300 hover:text-neon-red hover:bg-dark-500 transition-colors border border-dark-500"
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await doWrite({
                      functionName: 'claimRecycled',
                      args: [BigInt(candidateId), BigInt(tier.value), true, true, true],
                      value: parseEther(tier.feeBnb.toFixed(2)),
                    })
                  } catch (err: any) {
                    const msg = err?.shortMessage || err?.message || ''
                    if (msg !== 'RPC_LIMITED' && !msg.includes('User rejected') && !msg.includes('denied')) {
                      onError?.(msg.slice(0, 150))
                    } else if (msg === 'RPC_LIMITED') {
                      onError?.('RPC_LIMITED')
                    }
                  }
                }}
              >
                {t(tier.labelKey)} · {tier.fee} {nativeSymbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {variant === 'active' && candidate && currentAddress &&
        candidate.proposer.toLowerCase() === currentAddress.toLowerCase() &&
        candidate.status === 0 &&
        Number(formatEther(candidate.totalSubBnb)) >= 20 && (
        <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-3 mt-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-doge-gold" />
            <p className="text-xs text-doge-gold font-bold">{t('dao.earlyQueueTitle')}</p>
          </div>
          <p className="text-xs text-gray-400 mb-2">{t('dao.earlyQueueDesc')}</p>
          <button
            className="w-full py-2 text-xs rounded-lg bg-doge-gold/10 text-doge-gold border border-doge-gold/30 hover:bg-doge-gold/20 transition-colors font-bold flex items-center justify-center gap-1.5"
            onClick={async () => {
              try {
                await doWrite({
                  functionName: 'earlyQueue',
                  args: [BigInt(candidateId)],
                })
              } catch (err: any) {
                const msg = err?.shortMessage || err?.message || ''
                if (msg !== 'RPC_LIMITED' && !msg.includes('User rejected') && !msg.includes('denied')) {
                  onError?.(msg.slice(0, 150))
                } else if (msg === 'RPC_LIMITED') {
                  onError?.('RPC_LIMITED')
                }
              }
            }}
          >
            <Rocket className="w-3.5 h-3.5" />
            {t('dao.earlyQueueBtn')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function DaoVote() {
  const t = useT()
  const { address } = useAccount()
  const targetChainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const daoAddress = getContractAddress(targetChainId, 'launchDAO')
  const contractReady = !isZeroAddress(daoAddress)

  const { writeContractAsync: _writeAsync, data: txHash, isPending: isWriting } = useWriteContract()
  const writeContractAsync = _writeAsync as (params: any) => Promise<`0x${string}`>

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'voting' | 'queue' | 'grace' | 'recycle'>('voting')
  const [stakeTokenTab, setStakeTokenTab] = useState<'bnb' | 'doge'>('bnb')
  const [stakeDuration, setStakeDuration] = useState<number>(0)
  const [stakeAmount, setStakeAmount] = useState('')
  const [showUnstakePanel, setShowUnstakePanel] = useState(false)
  const [txError, setTxError] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const [lastAction, setLastAction] = useState<'settle' | 'launch' | null>(null)

  const getUtcDay = () => new Date().toISOString().slice(0, 10)

  const isLaunchWindowOpen = (() => {
    const utcHour = new Date().getUTCHours()
    return utcHour >= 4
  })()
  const nextLaunchWindowTime = (() => {
    const now = new Date()
    const utcHour = now.getUTCHours()
    if (utcHour < 4) {
      const next = new Date(now)
      next.setUTCHours(4, 0, 0, 0)
      return next
    }
    const next = new Date(now)
    next.setUTCDate(next.getUTCDate() + 1)
    next.setUTCHours(4, 0, 0, 0)
    return next
  })()

  const isSettledToday = (() => {
    try { return localStorage.getItem('dogepad-settle-day') === getUtcDay() } catch { return false }
  })()
  const isLaunchedToday = (() => {
    try { return localStorage.getItem('dogepad-launch-day') === getUtcDay() } catch { return false }
  })()

  const [settleDone, setSettleDone] = useState(isSettledToday)
  const [launchDone, setLaunchDone] = useState(isLaunchedToday)

  useEffect(() => {
    if (isConfirmed && lastAction) {
      const day = getUtcDay()
      if (lastAction === 'settle') {
        localStorage.setItem('dogepad-settle-day', day)
        setSettleDone(true)
      } else if (lastAction === 'launch') {
        localStorage.setItem('dogepad-launch-day', day)
        setLaunchDone(true)
      }
      setLastAction(null)
    }
  }, [isConfirmed, lastAction])

  const [subBnbAmount, setSubBnbAmount] = useState('')
  const [voteRightsAmount, setVoteRightsAmount] = useState('')

  const { data: activeData, isLoading: loadingActive, error: errorActive, refetch: refetchActive } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getActiveCandidates',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const { data: queuedData, isLoading: loadingQueued, refetch: refetchQueued } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getQueuedCandidates',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const { data: graceData, isLoading: loadingGrace, refetch: refetchGrace } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getGracePeriodCandidates',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const { data: recycleData, isLoading: loadingRecycle, refetch: refetchRecycle } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getRecyclableCandidates',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const { data: epochRemaining } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getEpochTimeRemaining',
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 10000 },
  })

  const { data: maxLaunchsPerDayData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'maxLaunchsPerDay',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const todayDay = Math.floor(Date.now() / 86400000)
  const { data: todayLaunchCountData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'dayLaunchCount',
    args: [BigInt(todayDay)],
    chainId: targetChainId,
    query: { enabled: contractReady, refetchInterval: 15000 },
  })

  const maxLaunchsPerDay = Number(maxLaunchsPerDayData ?? 1)
  const todayLaunchCount = Number(todayLaunchCountData ?? 0)
  const canLaunchToday = todayLaunchCount < maxLaunchsPerDay

  const { data: totalStakedBnbData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'totalStakedBnb',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: totalStakedDogeData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'totalStakedDoge',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: totalStakedUsdtData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'totalStakedUsdt',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: pendingRightsData, refetch: refetchRights } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getPendingRights',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && !!address, refetchInterval: 30000 },
  })

  const { data: userRightsData, refetch: refetchEffectiveRights } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getEffectiveRights',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && !!address },
  })

  const { data: totalEffectiveRightsData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getUserTotalEffectiveRights',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && !!address, refetchInterval: 30000 },
  })

  const { data: userRawRightsData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'userRawRights',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && !!address },
  })

  const { data: dogeTokenData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'dogeToken',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const { data: queueLengthData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getQueueLength',
    chainId: targetChainId,
    query: { enabled: contractReady },
  })

  const bondingCurveAddress = getContractAddress(targetChainId, 'bondingCurve')
  const { data: bondingCurveLaunchDaoData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'launchDao',
    chainId: targetChainId,
    query: { enabled: !isZeroAddress(bondingCurveAddress) },
  })
  const launchDaoMismatch = !isZeroAddress(daoAddress) &&
    bondingCurveLaunchDaoData != null &&
    String(bondingCurveLaunchDaoData).toLowerCase() !== daoAddress.toLowerCase()

  const { data: stakePositionsData, refetch: refetchPositions } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getStakePositions',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && !!address, refetchInterval: 30000 },
  })

  const dogeTokenAddr = (dogeTokenData as `0x${string}` | undefined) ?? undefined
  const dogeTokenReady = !!dogeTokenAddr && !isZeroAddress(dogeTokenAddr)

  const { data: dogeTokenNameData } = useReadContract({
    address: dogeTokenAddr,
    abi: ERC20_ABI,
    functionName: 'name',
    chainId: targetChainId,
    query: { enabled: dogeTokenReady },
  })

  const { data: dogeBalanceData } = useReadContract({
    address: dogeTokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: dogeTokenReady && !!address },
  })

  const { data: dogeAllowanceData, refetch: refetchDogeAllowance } = useReadContract({
    address: dogeTokenAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && dogeTokenAddr ? [address, daoAddress] : undefined,
    chainId: targetChainId,
    query: { enabled: dogeTokenReady && !!address },
  })

  const { data: selectedCandidateData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'candidates',
    args: selectedCandidate !== null ? [BigInt(selectedCandidate)] : undefined,
    chainId: targetChainId,
    query: { enabled: contractReady && selectedCandidate !== null },
  })

  const selectedCandidateInfo = useMemo(() => {
    if (!selectedCandidateData) return null
    const d = selectedCandidateData as any
    return {
      expireTime: Number(d.expireTime ?? d[10] ?? 0n),
      status: Number(d.status ?? d[12] ?? 0),
      totalSubBnb: BigInt(d.totalSubBnb ?? d[5] ?? 0n),
      proposer: String(d.proposer ?? d[0] ?? ''),
      launchedToken: String(d.launchedToken ?? d[14] ?? ''),
    }
  }, [selectedCandidateData])

  const selectedTokenIsListed = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'isListed',
    args: selectedCandidateInfo?.launchedToken && !isZeroAddress(selectedCandidateInfo.launchedToken as `0x${string}`)
      ? [selectedCandidateInfo.launchedToken as `0x${string}`]
      : undefined,
    chainId: targetChainId,
    query: { enabled: !!selectedCandidateInfo?.launchedToken && !isZeroAddress(selectedCandidateInfo.launchedToken as `0x${string}`) },
  })

  const parseIds = (data: unknown): number[] => {
    if (!data) return []
    const d = data as any
    const ids = d.ids ?? d[0] ?? []
    if (!ids || !ids.length) return []
    return ids.map((id: bigint) => Number(id))
  }

  const activeIds = parseIds(activeData)
  const queuedIds = parseIds(queuedData)
  const graceIds = parseIds(graceData)
  const recycleIds = parseIds(recycleData)

  const epochTimeRemaining = Number(epochRemaining ?? 0)
  const totalStakedBnb = totalStakedBnbData ? Number(formatEther(totalStakedBnbData as bigint)) : 0
  const totalStakedDoge = totalStakedDogeData ? Number(formatEther(totalStakedDogeData as bigint)) : 0
  const totalStakedUsdt = totalStakedUsdtData ? Number(formatEther(totalStakedUsdtData as bigint)) : 0
  const queueLength = Number(queueLengthData ?? 0)

  const dogeTokenName = (dogeTokenNameData as string) || 'DOGE'

  const pendingRights = pendingRightsData ? Number(pendingRightsData as bigint) : 0
  const effectiveRights = userRightsData ? Number(userRightsData as bigint) : 0
  const totalEffectiveRights = totalEffectiveRightsData ? Number(totalEffectiveRightsData as bigint) : 0
  const rawRights = userRawRightsData ? Number(userRawRightsData as bigint) : 0
  const userDogeBalance = dogeBalanceData ? Number(formatEther(dogeBalanceData as bigint)) : 0
  const userDogeAllowance = dogeAllowanceData ? Number(formatEther(dogeAllowanceData as bigint)) : 0

  const stakePositions = useMemo<StakePosition[]>(() => {
    if (!stakePositionsData) return []
    const d = stakePositionsData as any
    const tokens: `0x${string}`[] = d.tokens ?? d[0] ?? []
    const amounts: bigint[] = d.amounts ?? d[1] ?? []
    const startTimes: bigint[] = d.startTimes ?? d[2] ?? []
    const durations: bigint[] = d.durations ?? d[3] ?? []
    const maturityTimes: bigint[] = d.maturityTimes ?? d[4] ?? []
    const withdrawns: boolean[] = d.withdrawns ?? d[5] ?? []
    return tokens.map((token, i) => ({
      id: i,
      token,
      amount: amounts[i] ?? 0n,
      startTime: startTimes[i] ?? 0n,
      duration: durations[i] ?? 0n,
      maturityTime: maturityTimes[i] ?? 0n,
      withdrawn: withdrawns[i] ?? false,
    }))
  }, [stakePositionsData])

  const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

  const getTokenLabel = (tokenAddr: `0x${string}`): { symbol: string; color: string; bg: string } => {
    if (tokenAddr.toLowerCase() === ZERO_ADDR) return { symbol: nativeSymbol, color: 'text-neon-green', bg: 'bg-neon-green/20' }
    if (dogeTokenReady && tokenAddr.toLowerCase() === dogeTokenAddr!.toLowerCase()) return { symbol: dogeTokenName, color: 'text-doge-cyan', bg: 'bg-doge-cyan/20' }
    return { symbol: '???', color: 'text-gray-400', bg: 'bg-gray-400/20' }
  }

  const getDurationLabel = (duration: bigint) => {
    const d = Number(duration)
    if (d === 0) return t('dao.stakeDurationFlexible')
    if (d === 1) return t('dao.stakeDuration30d')
    if (d === 2) return t('dao.stakeDuration90d')
    if (d === 3) return t('dao.stakeDuration180d')
    const days = Math.floor(d / 86400)
    if (days === 30) return t('dao.stakeDuration30d')
    if (days === 90) return t('dao.stakeDuration90d')
    if (days === 180) return t('dao.stakeDuration180d')
    return `${days}${t('dao.daysUnit')}`
  }

  const getPositionStatus = (pos: StakePosition): 'withdrawn' | 'withdrawable' | 'locked' => {
    if (pos.withdrawn) return 'withdrawn'
    if (Number(pos.duration) === 0) return 'withdrawable'
    if (pos.maturityTime > 0n) {
      const now = Math.floor(Date.now() / 1000)
      return Number(pos.maturityTime) <= now ? 'withdrawable' : 'locked'
    }
    return 'locked'
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }

  const formatCountdown = (timestamp: number) => {
    const diff = timestamp - Date.now() / 1000
    if (diff <= 0) return t('dao.statusExpired')
    const d = Math.floor(diff / 86400)
    const h = Math.floor((diff % 86400) / 3600)
    const m = Math.floor((diff % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const formatDate = (timestamp: number) => {
    if (timestamp === 0) return '-'
    const d = new Date(timestamp * 1000)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const handleRefresh = () => {
    refetchActive()
    refetchQueued()
    refetchGrace()
    refetchRecycle()
    refetchRights()
    refetchPositions()
    refetchEffectiveRights()
  }

  const BSC_GAS_CAP = 5_000_000n

  const doWrite = async (params: {
    functionName: string
    args: readonly unknown[]
    value?: bigint
    gas?: bigint
  }): Promise<`0x${string}`> => {
    try {
      const hash = await writeContractAsync({
        address: daoAddress,
        abi: LAUNCH_DAO_ABI,
        functionName: params.functionName,
        args: params.args,
        value: params.value,
        gas: params.gas ?? BSC_GAS_CAP,
      })
      return hash
    } catch (err: any) {
      const msg = String(err?.shortMessage || err?.message || '')
      const isRateLimit = msg.includes('rate limit') || msg.includes('rate limited') || msg.includes('Requested resource not available')
      if (isRateLimit) throw new Error('RPC_LIMITED')
      throw err
    }
  }

  const handleSubscribeBnb = async () => {
    if (selectedCandidate === null) return
    setTxError('')
    if (!subBnbAmount || parseFloat(subBnbAmount) < 1) {
      setTxError(t('dao.subscribeMinAmount', { symbol: nativeSymbol }))
      return
    }
    try {
      await doWrite({
        functionName: 'subscribeBnb',
        args: [BigInt(selectedCandidate)],
        value: parseEther(subBnbAmount),
      })
      setSubBnbAmount('')
      setTimeout(() => handleRefresh(), 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 150))
    }
  }

  const handleStake = async () => {
    setTxError('')
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      setTxError(t('dao.enterStakeAmount'))
      return
    }
    try {
      if (stakeTokenTab === 'bnb') {
        if (parseFloat(stakeAmount) < 0.1) {
          setTxError(t('dao.stakeMinAmount', { symbol: nativeSymbol }))
          return
        }
        await doWrite({
          functionName: 'stakeBnb',
          args: [stakeDuration],
          value: parseEther(stakeAmount),
        })
      } else if (stakeTokenTab === 'doge') {
        if (!dogeTokenReady) {
          setTxError(t('dao.platformTokenNotSet'))
          return
        }
        const needed = parseEther(stakeAmount)
        if (dogeAllowanceData == null || (dogeAllowanceData as bigint) < needed) {
          setTxError(t('dao.approvePlatformTokenFirst'))
          return
        }
        await doWrite({
          functionName: 'stakeDoge',
          args: [needed, stakeDuration],
        })
      }
      setStakeAmount('')
      setTimeout(() => {
        refetchPositions()
        refetchDogeAllowance()
      }, 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 150))
    }
  }

  const handleUnstakePosition = async (positionId: number) => {
    setTxError('')
    try {
      await doWrite({
        functionName: 'unstakePosition',
        args: [BigInt(positionId)],
      })
      setTimeout(() => {
        refetchPositions()
        refetchRights()
        refetchEffectiveRights()
      }, 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 150))
    }
  }

  const handleClaimRights = async () => {
    setTxError('')
    try {
      await doWrite({ functionName: 'claimRights', args: [] })
      setTimeout(() => {
        refetchRights()
        refetchPositions()
        refetchEffectiveRights()
      }, 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 150))
    }
  }

  const handleVoteWithRights = async () => {
    if (selectedCandidate === null) return
    setTxError('')
    if (!voteRightsAmount || parseFloat(voteRightsAmount) <= 0) {
      setTxError(t('dao.enterVoteRightsAmount'))
      return
    }
    try {
      await doWrite({
        functionName: 'voteWithRights',
        args: [BigInt(selectedCandidate), BigInt(Math.round(parseFloat(voteRightsAmount)))],
      })
      setVoteRightsAmount('')
      setTimeout(() => handleRefresh(), 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 150))
    }
  }

  const handleSettleEpoch = async () => {
    setTxError('')
    setLastAction('settle')
    try {
      await doWrite({ functionName: 'settleEpoch', args: [] })
      setTimeout(() => handleRefresh(), 2000)
    } catch (err: any) {
      setLastAction(null)
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 200))
    }
  }

  const handleLaunchToken = async () => {
    setTxError('')
    setLastAction('launch')
    try {
      await doWrite({ functionName: 'launchToken', args: [] })
      setTimeout(() => handleRefresh(), 2000)
    } catch (err: any) {
      setLastAction(null)
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 200))
    }
  }

  const handleApproveDoge = async () => {
    if (!dogeTokenAddr || !address) return
    setTxError('')
    setIsApproving(true)
    try {
      const maxUint256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
      await writeContractAsync({
        address: dogeTokenAddr,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [daoAddress, maxUint256],
        gas: BSC_GAS_CAP,
      })
      setTimeout(() => refetchDogeAllowance(), 2000)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.slice(0, 200))
    } finally {
      setIsApproving(false)
    }
  }

  const renderTxError = () => {
    if (!txError) return null
    if (txError === 'RPC_LIMITED') {
      return (
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3 space-y-2">
          <p className="text-xs text-neon-red">{t('dao.rpcLimited')}</p>
          <div className="bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg p-2 space-y-2">
            <p className="text-xs text-neon-yellow">{t('dao.rpcFixHint')}</p>
            <code className="text-xs text-white bg-dark-700 px-2 py-1 rounded select-all block break-all">
              {targetChainId === 97 ? 'https://bsc-testnet.publicnode.com' : 'https://bsc.publicnode.com'}
            </code>
            <button
              className="w-full py-1.5 text-xs rounded-lg bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/20 transition-colors font-bold"
              onClick={async () => {
                const result = await fixWalletNetwork(targetChainId)
                if (result === 'success') setTxError('')
              }}
            >
              {t('dao.rpcFixBtn')}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
        <p className="text-xs text-neon-red break-all">{txError}</p>
      </div>
    )
  }

  const renderConfigWarning = () => {
    if (!launchDaoMismatch) return null
    return (
      <div className="bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg p-3 space-y-1">
        <p className="text-xs text-neon-yellow font-bold">{t('dao.configWarning')}</p>
        <p className="text-xs text-neon-yellow/80">{t('dao.launchDaoMismatch')}</p>
        <p className="text-xs text-gray-400 mt-1">
          BondingCurve.launchDao = {String(bondingCurveLaunchDaoData).slice(0, 10)}...
          &nbsp;≠ LaunchDAO = {daoAddress.slice(0, 10)}...
        </p>
      </div>
    )
  }

  const currentTokenLabel = stakeTokenTab === 'bnb' ? nativeSymbol : dogeTokenName
  const currentTotalStaked = stakeTokenTab === 'bnb' ? totalStakedBnb : totalStakedDoge
  const currentBalance = stakeTokenTab === 'bnb' ? 0 : userDogeBalance
  const currentAllowance = stakeTokenTab === 'doge' ? userDogeAllowance : Infinity
  const needsApprove = stakeTokenTab === 'doge' && currentAllowance < (parseFloat(stakeAmount) || 0)

  if (!contractReady) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <WifiOff className="w-12 h-12 text-gray-500 mb-4" />
        <p className="text-gray-400 mb-2">{t('dao.contractNotDeployed')}</p>
        <p className="text-xs text-gray-500">{t('dao.pleaseDeployAndConnect')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Vote className="w-6 h-6 text-doge-gold" />
            {t('dao.title')}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{t('dao.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge-cyan">
            <Clock className="w-3 h-3 mr-1" />
            {formatTime(epochTimeRemaining)}
          </span>
          <span className="badge-gold">
            <Flame className="w-3 h-3 mr-1" />
            {t('dao.queueTab')}: {queueLength} ({t('dao.top3PerDay')})
          </span>
          <button onClick={handleRefresh} className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card-dark">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg">{t('dao.candidates')}</h3>
            </div>

            <div className="flex mb-4 bg-dark-700 rounded-lg p-1">
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  activeTab === 'voting' ? 'bg-neon-green text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('voting')}
              >
                <Vote className="w-4 h-4" /> {t('dao.activeTab')} ({activeIds.length})
              </button>
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  activeTab === 'queue' ? 'bg-doge-cyan text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('queue')}
              >
                <Rocket className="w-4 h-4" /> {t('dao.queueTab')} ({queuedIds.length})
              </button>
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  activeTab === 'grace' ? 'bg-neon-yellow text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('grace')}
              >
                <ShieldAlert className="w-4 h-4" /> {t('dao.graceTab')} ({graceIds.length})
              </button>
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  activeTab === 'recycle' ? 'bg-neon-red text-white' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('recycle')}
              >
                <Recycle className="w-4 h-4" /> {t('dao.recycleTab')} ({recycleIds.length})
              </button>
            </div>

            {activeTab === 'voting' && (
              loadingActive ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 text-doge-gold animate-spin" />
                </div>
              ) : errorActive ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-neon-red/10 flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8 text-neon-red" />
                  </div>
                  <p className="text-neon-red mb-2">{t('dao.readContractFailed')}</p>
                  <p className="text-xs text-gray-500 max-w-md">{String(errorActive).slice(0, 200)}</p>
                </div>
              ) : activeIds.length > 0 ? (
                <div className="space-y-3">
                  {activeIds.map((id, idx) => (
                    <CandidateDetailCard
                      key={id}
                      candidateId={id}
                      isSelected={selectedCandidate === id}
                      onSelect={() => setSelectedCandidate(id)}
                      rank={idx}
                      variant="active"
                      daoAddress={daoAddress}
                      abi={LAUNCH_DAO_ABI}
                      doWrite={doWrite}
                      onError={(msg) => setTxError(msg)}
                      currentAddress={address}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
                    <Inbox className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 mb-2">{t('dao.noActiveCandidates')}</p>
                  <p className="text-xs text-gray-500">{t('dao.submitToStartVoting')}</p>
                </div>
              )
            )}

            {activeTab === 'queue' && (
              loadingQueued ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 text-doge-cyan animate-spin" />
                </div>
              ) : queuedIds.length > 0 ? (
                <div className="space-y-3">
                  {queuedIds.map((id) => (
                    <CandidateDetailCard
                      key={id}
                      candidateId={id}
                      isSelected={selectedCandidate === id}
                      onSelect={() => setSelectedCandidate(id)}
                      rank={0}
                      variant="queued"
                      daoAddress={daoAddress}
                      abi={LAUNCH_DAO_ABI}
                      doWrite={doWrite}
                      onError={(msg) => setTxError(msg)}
                      currentAddress={address}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
                    <Rocket className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 mb-2">{t('dao.queueEmpty')}</p>
                  <p className="text-xs text-gray-500">{t('dao.queueEmptyDesc')}</p>
                </div>
              )
            )}

            {activeTab === 'grace' && (
              loadingGrace ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 text-neon-yellow animate-spin" />
                </div>
              ) : graceIds.length > 0 ? (
                <div className="space-y-3">
                  {graceIds.map((id) => (
                    <CandidateDetailCard
                      key={id}
                      candidateId={id}
                      isSelected={false}
                      onSelect={() => {}}
                      rank={0}
                      variant="grace"
                      daoAddress={daoAddress}
                      abi={LAUNCH_DAO_ABI}
                      doWrite={doWrite}
                      onError={(msg) => setTxError(msg)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
                    <ShieldAlert className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 mb-2">{t('dao.noGraceCandidates')}</p>
                </div>
              )
            )}

            {activeTab === 'recycle' && (
              loadingRecycle ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 text-neon-red animate-spin" />
                </div>
              ) : recycleIds.length > 0 ? (
                <div className="space-y-3">
                  {recycleIds.map((id) => (
                    <CandidateDetailCard
                      key={id}
                      candidateId={id}
                      isSelected={false}
                      onSelect={() => {}}
                      rank={0}
                      variant="recycle"
                      daoAddress={daoAddress}
                      abi={LAUNCH_DAO_ABI}
                      doWrite={doWrite}
                      onError={(msg) => setTxError(msg)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
                    <Recycle className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 mb-2">{t('dao.noRecyclableCandidates')}</p>
                </div>
              )
            )}
          </div>

          <div className="card-dark">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-lg">{t('dao.epochTimeline')}</h3>
              <span className="badge-cyan">
                <Clock className="w-3 h-3 mr-1" />
                {formatTime(epochTimeRemaining)}
              </span>
            </div>

            {selectedCandidate !== null && selectedCandidateInfo ? (() => {
              const isExpired = selectedCandidateInfo.expireTime > 0 && (selectedCandidateInfo.expireTime * 1000) <= Date.now()
              const canSettle = selectedCandidateInfo.status === 0 && isExpired && epochTimeRemaining === 0 && !settleDone
              const settleComplete = selectedCandidateInfo.status === 0 && settleDone
              const isQueued = selectedCandidateInfo.status === 1
              const isLaunched = selectedCandidateInfo.status === 5
              const isOnDex = isLaunched && selectedTokenIsListed.data === true
              const isOnBonding = isLaunched && !isOnDex
              const isVoting = selectedCandidateInfo.status === 0 && !isExpired

              let activeStep = -1
              if (isVoting || canSettle || settleComplete) activeStep = 0
              else if (isQueued) activeStep = 1
              else if (isOnBonding) activeStep = 2
              else if (isOnDex) activeStep = 3

              const steps = [
                { label: t('dao.step.subscribe'), icon: Vote },
                { label: t('dao.step.queue'), icon: Rocket },
                { label: t('dao.step.internal'), icon: TrendingUp },
                { label: t('dao.step.external'), icon: Sparkles },
              ]

              return (
                <>
                  <div className="flex items-center mb-1.5">
                    {steps.map((step, i) => {
                      const Icon = step.icon
                      const isActive = i === activeStep
                      const isCompleted = i < activeStep
                      return (
                        <div key={i} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300',
                            isActive ? 'border-doge-gold bg-doge-gold/15 text-doge-gold' :
                            isCompleted ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-400' :
                            'border-dark-500/50 bg-dark-700 text-gray-600'
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          {i < steps.length - 1 && (
                            <div className={cn(
                              'flex-1 h-0.5 mx-1.5 transition-all duration-300',
                              isCompleted ? 'bg-emerald-500/50' : 'bg-dark-500/30'
                            )} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex mb-5">
                    {steps.map((step, i) => {
                      const isActive = i === activeStep
                      const isCompleted = i < activeStep
                      return (
                        <div key={i} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
                          <span className={cn(
                            'text-[11px] whitespace-nowrap transition-colors',
                            isActive ? 'text-doge-gold font-bold' :
                            isCompleted ? 'text-emerald-400/80' :
                            'text-gray-600'
                          )}>
                            {step.label}
                          </span>
                          {i < steps.length - 1 && <div className="flex-1" />}
                        </div>
                      )
                    })}
                  </div>

                  {(isVoting || canSettle || settleComplete) && (
                    <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-xl p-5 text-center">
                      {isVoting ? (
                        <>
                          <Timer className="w-7 h-7 mx-auto mb-2 text-doge-gold" />
                          <div className="text-2xl font-display font-bold text-doge-gold tracking-wide">
                            {formatCountdown(selectedCandidateInfo.expireTime)}
                          </div>
                          <div className="text-xs text-gray-400 mt-1.5">{t('dao.step.subscribeDesc')}</div>
                        </>
                      ) : canSettle ? (
                        <>
                          <button
                            className="w-full text-center hover:bg-neon-green/10 transition-all cursor-pointer group"
                            onClick={handleSettleEpoch}
                            disabled={isWriting || isConfirming}
                          >
                            {isWriting || isConfirming ? (
                              <Loader2 className="w-7 h-7 mx-auto mb-2 text-neon-green animate-spin" />
                            ) : (
                              <TrendingUp className="w-7 h-7 mx-auto mb-2 text-neon-green group-hover:scale-110 transition-transform" />
                            )}
                            <div className="text-lg font-display font-bold text-neon-green">{t('dao.settleEpoch')}</div>
                            <div className="text-xs text-neon-green/70 mt-1">{t('dao.settleReward')}</div>
                          </button>
                        </>
                      ) : (
                        <>
                          <Check className="w-7 h-7 mx-auto mb-2 text-emerald-400" />
                          <div className="text-lg font-display font-bold text-emerald-400">{t('dao.settleDone')}</div>
                          <div className="text-xs text-gray-400 mt-1">{t('dao.utcReset')}</div>
                        </>
                      )}
                    </div>
                  )}

                  {isQueued && (
                    <div className="bg-doge-cyan/5 border border-doge-cyan/20 rounded-xl p-5 text-center">
                      <Rocket className="w-7 h-7 mx-auto mb-2 text-doge-cyan" />
                      <div className="text-lg font-display font-bold text-doge-cyan">{t('dao.queuedBadge')}</div>
                      <div className="text-xs text-gray-400 mt-1">{t('dao.step.queueDesc')}</div>
                    </div>
                  )}

                  {isOnBonding && (
                    <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-xl p-5 text-center">
                      <TrendingUp className="w-7 h-7 mx-auto mb-2 text-doge-gold" />
                      <div className="text-lg font-display font-bold text-doge-gold">{t('dao.step.internal')}</div>
                      <div className="text-xs text-gray-400 mt-1">{t('dao.step.internalDesc')}</div>
                    </div>
                  )}

                  {isOnDex && (
                    <div className="bg-neon-green/5 border border-neon-green/20 rounded-xl p-5 text-center">
                      <Sparkles className="w-7 h-7 mx-auto mb-2 text-neon-green" />
                      <div className="text-lg font-display font-bold text-neon-green">{t('dao.step.external')}</div>
                      <div className="text-xs text-gray-400 mt-1">{t('dao.step.externalDesc')}</div>
                    </div>
                  )}

                  {activeStep === -1 && (
                    <div className="bg-dark-700/50 border border-dark-500/30 rounded-xl p-5 text-center">
                      <Vote className="w-7 h-7 mx-auto mb-2 text-gray-500" />
                      <div className="text-sm font-bold text-gray-400">{formatTime(epochTimeRemaining)}</div>
                      <div className="text-xs text-gray-500 mt-1">{t('dao.phase.voting')}</div>
                    </div>
                  )}
                </>
              )
            })() : (
              <div className="bg-dark-700/50 border border-dark-500/20 rounded-xl p-6 text-center">
                <Inbox className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                <div className="text-sm font-bold text-gray-400">{t('dao.selectCandidateHint')}</div>
                <div className="text-xs text-gray-500 mt-1">{t('dao.selectCandidateHintDesc')}</div>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-dark-500/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-neon-green" />
                  <span className="text-sm font-display font-bold">{t('dao.launchToken')}</span>
                </div>
                <span className="text-xs text-gray-500">{todayLaunchCount}/{maxLaunchsPerDay} {t('dao.todayLaunched')}</span>
              </div>
              {queueLength > 0 && canLaunchToday && isLaunchWindowOpen ? (
                <button
                  className="w-full py-2.5 rounded-lg bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleLaunchToken}
                  disabled={isWriting || isConfirming}
                >
                  {isWriting || isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {t('dao.launchToken')}
                </button>
              ) : queueLength > 0 && canLaunchToday && !isLaunchWindowOpen ? (
                <div className="bg-dark-700 rounded-lg p-3 text-center">
                  <Clock className="w-4 h-4 mx-auto mb-1 text-gray-500" />
                  <div className="text-xs text-gray-400">{t('dao.launchWindowClosed')}</div>
                  <div className="text-[10px] text-gray-500">{t('dao.opensAt')} 04:00 UTC</div>
                </div>
              ) : !canLaunchToday && queueLength > 0 ? (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
                  <Check className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                  <div className="text-xs text-emerald-400">{maxLaunchsPerDay}/{maxLaunchsPerDay} {t('dao.todayLaunched')}</div>
                  <div className="text-[10px] text-gray-500">{t('dao.utcReset')}</div>
                </div>
              ) : (
                <div className="bg-dark-700 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">{queueLength} {t('dao.inQueue')}</div>
                  <div className="text-[10px] text-gray-500">{t('dao.launchQueue')}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-dark">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-doge-gold" />
                {t('dao.subscribe')}
              </h3>
            </div>

            {selectedCandidate !== null ? (
              <div className="space-y-4">
                <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-3">
                  <p className="text-xs text-doge-gold font-medium">{t('dao.selectedCandidate', { id: selectedCandidate + 1 })}</p>
                  {selectedCandidateInfo && (() => {
                    const selMeta = parseMetadata(String((selectedCandidateData as any)?.metadataURI ?? (selectedCandidateData as any)?.[3] ?? ''))
                    return selMeta.description ? (
                      <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">{selMeta.description}</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">{t('dao.subscribeHint')}</p>
                    )
                  })()}
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('dao.subscribeBnbLabel', { symbol: nativeSymbol })}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={subBnbAmount}
                      onChange={(e) => setSubBnbAmount(e.target.value)}
                      placeholder="1 - 20"
                      className="input-dark w-full pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">{nativeSymbol}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[1, 10, 100, 1000, 5000].map(v => (
                      <button
                        key={v}
                        onClick={() => setSubBnbAmount(String(v))}
                        className="flex-1 text-xs py-1 rounded bg-dark-600 text-gray-300 hover:text-doge-gold hover:bg-dark-500 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn-primary w-full mt-2"
                    disabled={!subBnbAmount || parseFloat(subBnbAmount) < 1 || isWriting || isConfirming}
                    onClick={handleSubscribeBnb}
                  >
                    {isWriting || isConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('dao.confirming')}
                      </span>
                    ) : t('dao.subscribeBnbBtn', { symbol: nativeSymbol })}
                  </button>
                </div>

                <div className="bg-dark-700 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                  <p>�?{t('dao.subscribeTriggerHint', { symbol: nativeSymbol })}</p>
                  <p>�?{t('dao.subscribeNoLimitHint')}</p>
                  <p>�?{t('dao.expiredRefundHint')}</p>
                  <p>�?{t('dao.subscribeWeightHint', { symbol: nativeSymbol })}</p>
                </div>
              </div>
            ) : (
              <div className="bg-dark-700 rounded-lg p-4 text-center">
                <Vote className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('dao.selectCandidateFromList')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('dao.selectThenSubscribe')}</p>
              </div>
            )}
          </div>

          <div className="card-dark">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold flex items-center gap-2">
                <Wallet className="w-5 h-5 text-doge-gold" />
                {t('dao.stakeTitle')}
              </h3>
            </div>

            <div className="flex mb-4 bg-dark-700 rounded-lg p-1">
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  stakeTokenTab === 'bnb' ? 'bg-doge-gold text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => { setStakeTokenTab('bnb'); setStakeAmount('') }}
              >
                <Coins className="w-4 h-4" /> {nativeSymbol}
              </button>
              <button
                className={cn(
                  'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-1.5',
                  stakeTokenTab === 'doge' ? 'bg-doge-cyan text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => { setStakeTokenTab('doge'); setStakeAmount('') }}
              >
                <Gem className="w-4 h-4" /> {dogeTokenReady ? dogeTokenName : t('dao.platformTokenLabel')}
              </button>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-2 block">{t('dao.durationSelect')}</label>
              <div className="grid grid-cols-4 gap-2">
                {STAKE_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    className={cn(
                      'py-2 rounded-lg text-xs font-display font-semibold transition-all border',
                      stakeDuration === d.value
                        ? 'bg-doge-gold/15 text-doge-gold border-doge-gold/40'
                        : 'bg-dark-700 text-gray-400 border-dark-500/30 hover:border-dark-500/60 hover:text-white'
                    )}
                    onClick={() => setStakeDuration(d.value)}
                  >
                    <div>{t(d.label)}</div>
                    <div className="text-[10px] opacity-70">{d.multiplier}{t('dao.rightsLabel')}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-xs text-gray-400">{t('dao.totalPoolStaked')}</p>
                <p className="font-display font-bold text-doge-gold">
                  {formatUsdc(currentTotalStaked)} {currentTokenLabel}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-xs text-gray-400">{t('dao.walletBalance')}</p>
                <p className="font-display font-bold">
                  {stakeTokenTab === 'bnb' ? '-' : formatUsdc(currentBalance)} {currentTokenLabel}
                </p>
              </div>
            </div>

            {stakeTokenTab === 'doge' && !dogeTokenReady ? (
              <div className="bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg p-3">
                <p className="text-xs text-neon-yellow font-medium">{t('dao.platformTokenNotSetUp')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('dao.firstLaunchBecomesPlatform')}</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('dao.stakeAmountLabel')}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder={stakeTokenTab === 'bnb' ? '0.1 - 300' : '0'}
                      className="input-dark w-full pr-20"
                    />
                    <span className={cn(
                      'absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold',
                      stakeTokenTab === 'bnb' ? 'text-gray-400' : stakeTokenTab === 'doge' ? 'text-doge-cyan' : 'text-neon-green'
                    )}>
                      {currentTokenLabel}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {stakeTokenTab === 'bnb' && [0.1, 1, 10, 50].map(v => (
                      <button
                        key={v}
                        onClick={() => setStakeAmount(String(v))}
                        className="flex-1 text-xs py-1 rounded bg-dark-600 text-gray-300 hover:text-doge-gold hover:bg-dark-500 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                    {stakeTokenTab === 'doge' && [100, 1000, 5000, 10000].map(v => (
                      <button
                        key={v}
                        onClick={() => setStakeAmount(String(v))}
                        className="flex-1 text-xs py-1 rounded bg-dark-600 text-gray-300 hover:text-doge-cyan hover:bg-dark-500 transition-colors"
                      >
                        {v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  {needsApprove ? (
                    <button
                      className={cn(
                        'flex-1 py-2.5 rounded-lg font-display font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                        stakeTokenTab === 'doge'
                          ? 'bg-doge-cyan/10 text-doge-cyan border border-doge-cyan/30 hover:bg-doge-cyan/20'
                          : 'bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20'
                      )}
                      disabled={isApproving || isWriting || isConfirming}
                      onClick={handleApproveDoge}
                    >
                      {isApproving ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('dao.approving')}</span> : t('dao.approveAndStake', { label: currentTokenLabel })}
                    </button>
                  ) : (
                    <button
                      className="btn-primary flex-1"
                      disabled={!stakeAmount || parseFloat(stakeAmount) <= 0 || isWriting || isConfirming}
                      onClick={handleStake}
                    >
                      {isWriting || isConfirming ? (
                        <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('dao.confirming')}</span>
                      ) : t('dao.stakeBtn', { label: currentTokenLabel })}
                    </button>
                  )}
                  <button
                    className={cn(
                      'py-2.5 px-4 rounded-lg font-display font-bold text-sm border transition-all',
                      showUnstakePanel
                        ? 'bg-neon-green/10 text-neon-green border-neon-green/40'
                        : 'bg-dark-700 text-gray-400 border-dark-500/30 hover:border-dark-500/60 hover:text-white'
                    )}
                    onClick={() => setShowUnstakePanel(!showUnstakePanel)}
                  >
                    <span className="flex items-center gap-1.5">
                      {t('dao.unstakeBtn')}
                      {showUnstakePanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                </div>
              </>
            )}

            {showUnstakePanel && (
              <div className="mt-4 border-t border-dark-500/30 pt-4">
                <h4 className="text-sm font-display font-bold mb-3 flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4 text-neon-green" />
                  {t('dao.myStakePositions')}
                </h4>
                {stakePositions.length === 0 ? (
                  <div className="bg-dark-700 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">{t('dao.noStakePositions')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {stakePositions.map((pos) => {
                      const status = getPositionStatus(pos)
                      const tk = getTokenLabel(pos.token)
                      const durationLabel = getDurationLabel(pos.duration)
                      return (
                        <div
                          key={pos.id}
                          className={cn(
                            'rounded-lg border p-3',
                            status === 'withdrawn'
                              ? 'border-dark-500/20 bg-dark-700/50 opacity-60'
                              : status === 'withdrawable'
                              ? 'border-neon-green/30 bg-neon-green/5'
                              : 'border-dark-500/30 bg-dark-700'
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold', tk.bg, tk.color)}>
                                {tk.symbol.charAt(0)}
                              </span>
                              <span className="font-display font-bold text-sm">
                                {formatUsdc(Number(formatEther(pos.amount)))} {tk.symbol}
                              </span>
                              <span className="text-xs bg-dark-600 px-1.5 py-0.5 rounded text-gray-400">{durationLabel}</span>
                            </div>
                            <span className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full font-medium',
                              status === 'withdrawn'
                                ? 'bg-gray-500/10 text-gray-500'
                                : status === 'withdrawable'
                                ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                                : 'bg-doge-gold/10 text-doge-gold border border-doge-gold/30'
                            )}>
                              {status === 'withdrawn' ? t('dao.stakeWithdrawn') : status === 'withdrawable' ? t('dao.stakeWithdrawable') : t('dao.stakeLocked')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center gap-3">
                              <span>{t('dao.startTime')}: {formatDate(Number(pos.startTime))}</span>
                              {Number(pos.duration) > 0 && (
                                <span>{t('dao.maturityTime')}: {formatDate(Number(pos.maturityTime))}</span>
                              )}
                            </div>
                            {status === 'withdrawable' && (
                              <button
                                className="px-3 py-1 rounded-md bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors font-display font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                disabled={isWriting || isConfirming}
                                onClick={() => handleUnstakePosition(pos.id)}
                              >
                                {isWriting || isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : t('dao.withdrawBtn')}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-3 mt-4">
              <p className="text-xs text-doge-gold font-medium">{t('dao.stakeRights')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dao.stakeRightsHint', { symbol: nativeSymbol })}</p>
            </div>
          </div>

          <div className="card-dark">
            <h3 className="font-display font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-doge-gold" />
              {t('dao.rightsTitle')}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">{t('dao.totalEffectiveRights')}</p>
                  <p className="font-display font-bold text-doge-gold">{totalEffectiveRights.toLocaleString()} {t('dao.pointsUnit')}</p>
                  <p className="text-[10px] text-gray-500">{t('dao.includesPendingVoteable')}</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">{t('dao.claimedAvailable')}</p>
                  <p className="font-display font-bold text-neon-green">{effectiveRights.toLocaleString()} {t('dao.pointsUnit')}</p>
                  <p className="text-[10px] text-gray-500">{t('dao.rawLabel')} {rawRights.toLocaleString()}</p>
                </div>
              </div>

              {pendingRights > 0 && (
                <button
                  className="btn-primary w-full"
                  disabled={isWriting || isConfirming}
                  onClick={handleClaimRights}
                >
                  {isWriting || isConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('dao.confirming')}</span> : t('dao.claimRightsBtn', { amount: pendingRights.toLocaleString() })}
                </button>
              )}

              {effectiveRights > 0 && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('dao.voteWithRightsLabel')}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={voteRightsAmount}
                      onChange={(e) => setVoteRightsAmount(e.target.value)}
                      placeholder="0"
                      className="input-dark w-full pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">{t('dao.pointsUnit')}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[0.25, 0.5, 0.75, 1].map(ratio => (
                      <button
                        key={ratio}
                        onClick={() => setVoteRightsAmount(String(Math.round(effectiveRights * ratio)))}
                        className="flex-1 text-xs py-1 rounded bg-dark-600 text-gray-300 hover:text-doge-gold hover:bg-dark-500 transition-colors"
                      >
                        {ratio * 100}%
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn-primary w-full mt-2"
                    disabled={selectedCandidate === null || !voteRightsAmount || parseFloat(voteRightsAmount) <= 0 || isWriting || isConfirming}
                    onClick={handleVoteWithRights}
                  >
                    {isWriting || isConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('dao.confirming')}</span> : selectedCandidate !== null ? t('dao.voteForCandidate', { id: selectedCandidate + 1 }) : t('dao.selectCandidateFirst')}
                  </button>
                </div>
              )}

              <div className="bg-dark-700 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <p>�?{t('dao.rightsCalcHint', { symbol: nativeSymbol })}</p>
                <p>�?{t('dao.durationMultiplierHint')}</p>
                <p>�?{t('dao.rightsCapHint')}</p>
                <p>�?{t('dao.subscribeWeightRefundHint', { symbol: nativeSymbol })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {renderConfigWarning()}
      {renderTxError()}
    </div>
  )
}
