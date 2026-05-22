import { useState, useMemo, useEffect } from 'react'
import { Wallet, ArrowRight, Landmark, Coins, Sparkles, Loader2, HandCoins, RotateCcw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { LAUNCH_DAO_ABI, LONG_POOL_ABI, FEE_DISTRIBUTOR_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { cn, parseMetadata, sanitizeHref, formatUsdc, formatTokenAmount } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import CopyableAddress from '@/components/CopyableAddress'

const STATUS_MAP: Record<number, { labelKey: string; color: string }> = {
  0: { labelKey: 'dao.activeTab', color: 'text-neon-green' },
  1: { labelKey: 'dao.queuedBadge', color: 'text-doge-cyan' },
  2: { labelKey: 'dao.statusExpired', color: 'text-gray-400' },
  3: { labelKey: 'dao.graceTab', color: 'text-neon-yellow' },
  4: { labelKey: 'dao.statusRecyclable', color: 'text-neon-red' },
  5: { labelKey: 'dao.launched', color: 'text-doge-gold' },
}

export default function Portfolio() {
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const daoAddress = getContractAddress(chainId, 'launchDAO')
  const longPoolAddress = getContractAddress(chainId, 'longPool')
  const feeDistributorAddress = getContractAddress(chainId, 'feeDistributor')
  const daoReady = !isZeroAddress(daoAddress)
  const longPoolReady = !isZeroAddress(longPoolAddress)
  const feeReady = !isZeroAddress(feeDistributorAddress)

  const { writeContractAsync, data: txHash, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: dogeTokenData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'dogeToken',
    chainId,
    query: { enabled: daoReady },
  })

  const { data: stakePositionsData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getStakePositions',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: daoReady && !!userAddress },
  })

  const { data: pendingRightsData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getPendingRights',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: daoReady && !!userAddress },
  })

  const { data: totalEffectiveRightsData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getUserTotalEffectiveRights',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: daoReady && !!userAddress },
  })

  const { data: candidateCountData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getCandidateCount',
    chainId,
    query: { enabled: daoReady },
  })

  const candidateCount = candidateCountData ? Number(candidateCountData as bigint) : 0

  const candidateQueries = useMemo(() => {
    if (!candidateCount || !daoReady) return []
    return Array.from({ length: candidateCount }, (_, i) => ({
      address: daoAddress as `0x${string}`,
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

  const subscriptionQueries = useMemo(() => {
    if (!candidateCount || !daoReady || !userAddress) return []
    return Array.from({ length: candidateCount }, (_, i) => ({
      address: daoAddress as `0x${string}`,
      abi: LAUNCH_DAO_ABI,
      functionName: 'getSubscription' as const,
      args: [userAddress, BigInt(i)],
      chainId,
    }))
  }, [candidateCount, daoAddress, userAddress, chainId])

  const { data: subscriptionsData } = useReadContracts({
    contracts: subscriptionQueries,
    query: { enabled: subscriptionQueries.length > 0 },
  })

  const parsedCandidates = useMemo(() => {
    if (!candidatesData) return []
    return candidatesData.map((result, i) => {
      if (result.status !== 'success' || !result.result) return null
      const raw = result.result as any
      return {
        id: i,
        proposer: String(raw.proposer ?? raw[0] ?? ''),
        name: String(raw.name ?? raw[1] ?? ''),
        symbol: String(raw.symbol ?? raw[2] ?? ''),
        metadataURI: String(raw.metadataURI ?? raw[3] ?? ''),
        totalWeight: BigInt(raw.totalWeight ?? raw[4] ?? 0n),
        totalSubBnb: BigInt(raw.totalSubBnb ?? raw[5] ?? 0n),
        totalSubDoge: BigInt(raw.totalSubDoge ?? raw[6] ?? 0n),
        totalRightsVotes: BigInt(raw.totalRightsVotes ?? raw[7] ?? 0n),
        submitTime: Number(raw.submitTime ?? raw[8] ?? 0),
        durationTier: Number(raw.durationTier ?? raw[9] ?? 0),
        expireTime: Number(raw.expireTime ?? raw[10] ?? 0),
        gracePeriodEnd: Number(raw.gracePeriodEnd ?? raw[11] ?? 0),
        status: Number(raw.status ?? raw[12] ?? 0),
        wasLaunched: Boolean(raw.wasLaunched ?? raw[13] ?? false),
        launchedToken: String(raw.launchedToken ?? raw[14] ?? ''),
        launchedTokenSupply: BigInt(raw.launchedTokenSupply ?? raw[15] ?? 0n),
        queueTime: Number(raw.queueTime ?? raw[16] ?? 0),
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }, [candidatesData])

  const myCandidates = useMemo(() => {
    if (!userAddress) return []
    return parsedCandidates.filter(c => c.proposer && c.proposer.toLowerCase() === userAddress.toLowerCase())
  }, [parsedCandidates, userAddress])

  const mySubscriptions = useMemo(() => {
    if (!subscriptionsData || !parsedCandidates.length) return []
    const subs: Array<{
      candidateId: number
      candidateName: string
      candidateSymbol: string
      candidateStatus: number
      wasLaunched: boolean
      launchedToken: string
      bnbAmount: number
      dogeAmount: number
      subscribeTime: number
      isActive: boolean
      hasClaimed: boolean
      hasRefunded: boolean
    }> = []

    subscriptionsData.forEach((result, i) => {
      if (result.status !== 'success' || !result.result) return
      const raw = result.result as any
      const bnbAmount = Number(formatEther(BigInt(raw.bnbAmount ?? raw[0] ?? 0n)))
      const dogeAmount = Number(formatEther(BigInt(raw.dogeAmount ?? raw[1] ?? 0n)))
      if (bnbAmount === 0 && dogeAmount === 0) return

      const candidate = parsedCandidates.find(c => c.id === i)
      if (!candidate) return

      subs.push({
        candidateId: i,
        candidateName: candidate.name,
        candidateSymbol: candidate.symbol,
        candidateStatus: candidate.status,
        wasLaunched: candidate.wasLaunched,
        launchedToken: candidate.launchedToken,
        bnbAmount,
        dogeAmount,
        subscribeTime: Number(raw.subscribeTime ?? raw[2] ?? 0),
        isActive: Boolean(raw.isActive ?? raw[3] ?? false),
        hasClaimed: Boolean(raw.hasClaimed ?? raw[4] ?? false),
        hasRefunded: Boolean(raw.hasRefunded ?? raw[5] ?? false),
      })
    })

    return subs
  }, [subscriptionsData, parsedCandidates])

  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [txError, setTxError] = useState('')
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const parsedStakePositions = useMemo(() => {
    if (!stakePositionsData || !dogeTokenData) return []
    const d = stakePositionsData as any
    const tokens = d[0] as `0x${string}`[]
    const amounts = d[1] as bigint[]
    const startTimes = d[2] as bigint[]
    const durations = d[3] as bigint[]
    const maturityTimes = d[4] as bigint[]
    const withdrawns = d[5] as boolean[]

    const dogeTokenAddr = (dogeTokenData as `0x${string}`).toLowerCase()
    const zeroAddr = '0x0000000000000000000000000000000000000000'

    return tokens.map((token, i) => {
      const tokenAddr = token.toLowerCase()
      let tokenType: string, tokenSymbol: string, tokenColor: string, tokenBg: string, tokenLetter: string

      if (tokenAddr === zeroAddr) {
        tokenType = nativeSymbol; tokenSymbol = nativeSymbol; tokenColor = 'text-neon-green'; tokenBg = 'bg-neon-green/20'; tokenLetter = nativeSymbol[0]
      } else if (tokenAddr === dogeTokenAddr) {
        tokenType = t('dao.platformTokenLabel'); tokenSymbol = 'DOGE'; tokenColor = 'text-doge-cyan'; tokenBg = 'bg-doge-cyan/20'; tokenLetter = 'D'
      } else {
        tokenType = t('portfolio.unknown'); tokenSymbol = '?'; tokenColor = 'text-gray-400'; tokenBg = 'bg-gray-400/20'; tokenLetter = '?'
      }

      const durationNum = Number(durations[i])
      const durationLabel = [t('dao.stakeDurationFlexible'), t('dao.stakeDuration30d'), t('dao.stakeDuration90d'), t('dao.stakeDuration180d')][durationNum] || t('portfolio.unknown')
      const maturityTime = Number(maturityTimes[i])
      const isDemand = maturityTime === 0

      return {
        id: i,
        tokenType,
        tokenSymbol,
        tokenColor,
        tokenBg,
        tokenLetter,
        amount: Number(formatEther(amounts[i])),
        startTime: Number(startTimes[i]),
        duration: durationNum,
        durationLabel,
        maturityTime,
        isDemand,
        isWithdrawn: withdrawns[i],
      }
    })
  }, [stakePositionsData, dogeTokenData, nativeSymbol, t])

  const pendingRights = pendingRightsData ? Number(pendingRightsData as bigint) : 0
  const totalEffectiveRights = totalEffectiveRightsData ? Number(totalEffectiveRightsData as bigint) : 0

  const NATIVE_TOKEN_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`

  const { data: userDepositData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'deposits',
    args: userAddress ? [NATIVE_TOKEN_ADDR, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { data: userYieldData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'pendingYield',
    args: userAddress ? [NATIVE_TOKEN_ADDR, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { data: feeStakedDogeData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'getStakedDoge',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: feeReady && !!userAddress },
  })

  const { data: feePendingDivData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'pendingDividend',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: feeReady && !!userAddress },
  })

  const lendingDeposit = userDepositData ? Number(formatEther((userDepositData as [bigint, bigint, bigint])[0])) : 0
  const pendingYield = userYieldData ? Number(formatEther(userYieldData as bigint)) : 0
  const lendingYieldEarned = 0
  const lendingYieldClaimed = 0
  const feeStakedDoge = feeStakedDogeData ? Number(formatEther(feeStakedDogeData as bigint)) : 0
  const feePendingDividend = feePendingDivData ? Number(formatEther(feePendingDivData as bigint)) : 0

  const totalStakingBnb = parsedStakePositions.filter(p => p.tokenSymbol === nativeSymbol && !p.isWithdrawn).reduce((sum, p) => sum + p.amount, 0)
  const totalSubBnbValue = mySubscriptions.reduce((sum, s) => sum + s.bnbAmount, 0)
  const totalValue = totalStakingBnb + totalSubBnbValue + lendingDeposit
  const totalEarnings = pendingYield + (lendingYieldEarned - lendingYieldClaimed)
  const hasPositions = totalValue > 0 || parsedStakePositions.length > 0 || myCandidates.length > 0 || mySubscriptions.length > 0

  const handleClaimSubscription = (candidateId: number) => {
    setTxError('')
    writeContractAsync({
      address: daoAddress,
      abi: LAUNCH_DAO_ABI,
      functionName: 'claimSubscription',
      args: [BigInt(candidateId)],
      chainId,
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleRefundSubscription = (candidateId: number) => {
    setTxError('')
    writeContractAsync({
      address: daoAddress,
      abi: LAUNCH_DAO_ABI,
      functionName: 'refundSubscription',
      args: [BigInt(candidateId)],
      chainId,
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleUnstakePosition = (positionId: number) => {
    setTxError('')
    writeContractAsync({
      address: daoAddress,
      abi: LAUNCH_DAO_ABI,
      functionName: 'unstakePosition',
      args: [BigInt(positionId)],
      chainId,
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  if (!isConnected) {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display font-bold text-3xl mb-2">
            <Wallet className="w-8 h-8 inline-block mr-2 text-neon-green" />
            {t('portfolio.title')}
          </h1>
          <p className="text-gray-400">{t('portfolio.subtitle')}</p>
        </div>
        <div className="card-dark text-center py-16">
          <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-display mb-2">{t('portfolio.noHoldingsYet')}</p>
          <p className="text-gray-500 text-sm mb-6">{t('portfolio.connectWalletTrade')}</p>
          <Link to="/" className="btn-primary inline-block">{t('common.trade')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl mb-2">
          <Wallet className="w-8 h-8 inline-block mr-2 text-neon-green" />
          {t('portfolio.title')}
        </h1>
        <p className="text-gray-400">{t('portfolio.subtitle')}</p>
      </div>

      {txError && (
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
          <p className="text-xs text-neon-red">{txError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark">
          <p className="text-xs text-gray-400 mb-1">{t('portfolio.totalValue')}</p>
          <p className="text-3xl font-display font-bold neon-text">{formatUsdc(totalValue)} {nativeSymbol}</p>
        </div>
        <div className="card-dark">
          <p className="text-xs text-gray-400 mb-1">{t('portfolio.totalPnl')}</p>
          <p className={cn('text-3xl font-display font-bold', totalEarnings >= 0 ? 'text-neon-green' : 'text-neon-red')}>
            {totalEarnings >= 0 ? '+' : ''}{formatUsdc(totalEarnings)} {nativeSymbol}
          </p>
          <span className={cn('text-sm font-medium', totalEarnings >= 0 ? 'text-neon-green' : 'text-neon-red')}>{t('portfolio.earningsLabel')}</span>
        </div>
        <div className="card-dark">
          <p className="text-xs text-gray-400 mb-1">{t('portfolio.activePositions')}</p>
          <p className="text-3xl font-display font-bold text-white">
            {parsedStakePositions.filter(p => !p.isWithdrawn).length + (lendingDeposit > 0 ? 1 : 0) + (feeStakedDoge > 0 ? 1 : 0) + myCandidates.length + mySubscriptions.filter(s => s.isActive && !s.hasClaimed && !s.hasRefunded).length}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('portfolio.tokensHeld')}</p>
        </div>
      </div>

      {mySubscriptions.length > 0 && (
        <div className="card-dark">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-4">
            <HandCoins className="w-5 h-5 text-doge-gold" />
            {t('portfolio.mySubscriptions')}
          </h2>
          <div className="space-y-3">
            {mySubscriptions.map(s => {
              const statusInfo = STATUS_MAP[s.candidateStatus] || { labelKey: 'portfolio.unknown', color: 'text-gray-400' }
              const canClaim = s.wasLaunched && s.isActive && !s.hasClaimed && !s.hasRefunded
              const canRefund = !s.wasLaunched && s.isActive && !s.hasClaimed && !s.hasRefunded && (s.candidateStatus === 2 || s.candidateStatus === 3 || s.candidateStatus === 4)
              return (
                <div key={s.candidateId} className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-doge-gold/20 flex items-center justify-center shrink-0">
                        <HandCoins className="w-5 h-5 text-doge-gold" />
                      </div>
                      <div>
                        <p className="font-display font-semibold">
                          {s.candidateName} <span className="text-gray-400 text-sm">{s.candidateSymbol}</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn('font-medium', statusInfo.color)}>{t(statusInfo.labelKey)}</span>
                          {s.hasClaimed && <span className="text-neon-green">{t('portfolio.claimed')}</span>}
                          {s.hasRefunded && <span className="text-neon-yellow">{t('portfolio.refunded')}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-display font-bold">{formatUsdc(s.bnbAmount)} {nativeSymbol}</p>
                      {s.dogeAmount > 0 && (
                        <p className="text-xs text-doge-cyan">{s.dogeAmount.toFixed(2)} DOGE</p>
                      )}
                    </div>
                  </div>
                  {(canClaim || canRefund) && (
                    <div className="mt-3 pt-3 border-t border-dark-500/30 flex gap-2">
                      {canClaim && (
                        <button
                          className="flex-1 py-2 text-xs rounded-lg bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors font-bold flex items-center justify-center gap-1"
                          onClick={() => handleClaimSubscription(s.candidateId)}
                          disabled={isWritePending || isConfirming}
                        >
                          {isWritePending || isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          {t('portfolio.claimToken')}
                        </button>
                      )}
                      {canRefund && (
                        <button
                          className="flex-1 py-2 text-xs rounded-lg bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30 hover:bg-neon-yellow/20 transition-colors font-bold flex items-center justify-center gap-1"
                          onClick={() => handleRefundSubscription(s.candidateId)}
                          disabled={isWritePending || isConfirming}
                        >
                          {isWritePending || isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          {t('portfolio.refundSubscription')}
                        </button>
                      )}
                    </div>
                  )}
                  {s.wasLaunched && !isZeroAddress(s.launchedToken as `0x${string}`) && (
                    <div className="mt-2 pt-2 border-t border-dark-500/30">
                      <p className="text-[10px] text-gray-500 mb-1">{t('dao.tokenContract')}</p>
                      <CopyableAddress address={s.launchedToken} chainId={chainId} type="token" />
                      <Link
                        to={`/token/${s.launchedToken}`}
                        className="inline-flex items-center gap-1 text-neon-green text-xs hover:underline mt-1"
                      >
                        {t('portfolio.viewToken')} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {myCandidates.length > 0 && (
        <div className="card-dark">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-doge-gold" />
            {t('portfolio.mySubmittedTokens')}
          </h2>
          <div className="space-y-3">
            {myCandidates.map(c => {
              const meta = parseMetadata(c.metadataURI)
              const statusInfo = STATUS_MAP[c.status] || { labelKey: 'portfolio.unknown', color: 'text-gray-400' }
              const remaining = c.expireTime - Math.floor(Date.now() / 1000)
              return (
                <div key={c.id} className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden shrink-0">
                        {meta.image ? (
                          <img src={sanitizeHref(meta.image)} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-display font-bold text-sm text-doge-gold">{c.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-display font-semibold">{c.name} <span className="text-gray-400 text-sm">{c.symbol}</span></p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn('font-medium', statusInfo.color)}>{t(statusInfo.labelKey)}</span>
                          {c.status === 0 && remaining > 0 && (
                            <span className="text-gray-500">
                              {t('portfolio.daysHoursUntilExpiry', { days: Math.floor(remaining / 86400), hours: Math.floor((remaining % 86400) / 3600) })}
                            </span>
                          )}
                          {c.status === 1 && (
                            <span className="text-doge-cyan">{t('portfolio.pendingLaunch')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-display font-bold">{formatUsdc(Number(formatEther(c.totalSubBnb)))} {nativeSymbol}</p>
                      <p className="text-xs text-gray-400">{t('dao.subscribe')}</p>
                    </div>
                  </div>
                  {c.wasLaunched && !isZeroAddress(c.launchedToken as `0x${string}`) && (
                    <div className="mt-2 pt-2 border-t border-dark-500/30">
                      <p className="text-[10px] text-gray-500 mb-1">{t('dao.tokenContract')}</p>
                      <CopyableAddress address={c.launchedToken} chainId={chainId} type="token" />
                      <Link
                        to={`/token/${c.launchedToken}`}
                        className="inline-flex items-center gap-1 text-neon-green text-xs hover:underline mt-1"
                      >
                        {t('portfolio.viewToken')} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card-dark">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-4">
          <Coins className="w-5 h-5 text-neon-green" />
          {t('portfolio.stakingPositions')}
        </h2>
        <div className="space-y-3">
          {parsedStakePositions.length > 0 ? parsedStakePositions.map(pos => {
            const canWithdraw = !pos.isWithdrawn && (pos.isDemand || now >= pos.maturityTime)
            const remaining = pos.maturityTime > 0 ? pos.maturityTime - now : 0
            return (
              <div key={pos.id} className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', pos.tokenBg, pos.tokenColor)}>
                      {pos.tokenLetter}
                    </div>
                    <div>
                      <p className="font-display font-semibold">{t('portfolio.tokenStaking', { type: pos.tokenType })}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{pos.durationLabel}</span>
                        {pos.isWithdrawn ? (
                          <span className="text-gray-500">{t('dao.stakeWithdrawn')}</span>
                        ) : pos.isDemand ? (
                          <span className="text-neon-green">{t('portfolio.withdrawableAnytime')}</span>
                        ) : remaining > 0 ? (
                          <span className="text-neon-yellow">
                            {t('portfolio.daysHoursMinutes', { days: Math.floor(remaining / 86400), hours: Math.floor((remaining % 86400) / 3600), minutes: Math.floor((remaining % 3600) / 60) })}
                          </span>
                        ) : (
                          <span className="text-neon-green">{t('portfolio.matured')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <p className={cn('font-display font-bold', pos.tokenColor)}>
                      {formatUsdc(pos.amount)} {pos.tokenSymbol}
                    </p>
                    {pos.isWithdrawn ? (
                      <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400">{t('dao.stakeWithdrawn')}</span>
                    ) : canWithdraw ? (
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors font-bold flex items-center gap-1"
                        onClick={() => handleUnstakePosition(pos.id)}
                        disabled={isWritePending || isConfirming}
                      >
                        {isWritePending || isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {t('dao.withdrawBtn')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="bg-dark-700 rounded-lg p-8 text-center">
              <Coins className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">{t('portfolio.noStaking')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('portfolio.stakeForRights', { symbol: nativeSymbol })}</p>
              <Link to="/dao" className="btn-primary inline-block">{t('portfolio.goStake')}</Link>
            </div>
          )}
          {(pendingRights > 0 || totalEffectiveRights > 0) && (
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-doge-gold/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-doge-gold" />
                  </div>
                  <div>
                    <p className="font-display font-semibold">{t('portfolio.votingRights')}</p>
                    <p className="text-xs text-gray-400">{t('portfolio.pendingRightsInfo', { pending: pendingRights.toLocaleString(), effective: totalEffectiveRights.toLocaleString() })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-doge-gold">{totalEffectiveRights.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{t('portfolio.effectiveRightsPts')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card-dark">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-4">
          <Landmark className="w-5 h-5 text-neon-purple" />
          {t('portfolio.lendingPositions')}
        </h2>
        {lendingDeposit > 0 || feeStakedDoge > 0 ? (
          <div className="space-y-3">
            {lendingDeposit > 0 && (
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neon-purple/20 flex items-center justify-center text-sm font-bold text-neon-purple">B</div>
                    <div>
                      <p className="font-display font-semibold">{nativeSymbol} {t('portfolio.depositLabel')}</p>
                      <p className="text-xs text-gray-400">{t('portfolio.longPoolLabel')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold">{formatUsdc(lendingDeposit)} {nativeSymbol}</p>
                    <p className="text-xs text-neon-green">+{formatUsdc(pendingYield)} {nativeSymbol} {t('portfolio.pendingLabel')}</p>
                  </div>
                </div>
              </div>
            )}
            {feeStakedDoge > 0 && (
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-doge-cyan/20 flex items-center justify-center text-sm font-bold text-doge-cyan">D</div>
                    <div>
                      <p className="font-display font-semibold">DOGE {t('fee.stakedDoge')}</p>
                      <p className="text-xs text-gray-400">{t('fee.dividendPool')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-doge-cyan">{formatTokenAmount(feeStakedDoge)} DOGE</p>
                    {feePendingDividend > 0 && (
                      <p className="text-xs text-neon-green">+{formatUsdc(feePendingDividend)} {nativeSymbol} {t('fee.pendingDividend')}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <Link to="/lend" className="inline-flex items-center gap-1 text-neon-green text-sm hover:underline">
              {t('common.detail')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="bg-dark-700 rounded-lg p-8 text-center">
            <Landmark className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">{t('portfolio.noLending')}</p>
            <p className="text-sm text-gray-500 mb-4">{t('portfolio.noLendingDesc')}</p>
            <Link to="/lend" className="btn-primary inline-block">{t('portfolio.goLend')}</Link>
          </div>
        )}
      </div>

      <div className="card-dark">
        <h2 className="font-display font-semibold text-lg mb-4">{t('portfolio.earnings')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-dark-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">{t('portfolio.stakingPositions')}</p>
            <p className="text-xl font-display font-bold text-neon-green">{formatUsdc(totalStakingBnb)} {nativeSymbol}</p>
            {parsedStakePositions.filter(p => p.tokenSymbol !== nativeSymbol && !p.isWithdrawn).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {parsedStakePositions.filter(p => p.tokenSymbol !== nativeSymbol && !p.isWithdrawn).map(p => (
                  <p key={p.id} className={cn('text-sm', p.tokenColor)}>{formatUsdc(p.amount)} {p.tokenSymbol}</p>
                ))}
              </div>
            )}
          </div>
          <div className="bg-dark-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">{t('portfolio.lendingInterest')}</p>
            <p className="text-xl font-display font-bold text-neon-purple">{formatUsdc(pendingYield)} {nativeSymbol}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">{t('portfolio.subscriptionsLabel')}</p>
            <p className="text-xl font-display font-bold text-doge-gold">{formatUsdc(totalSubBnbValue)} {nativeSymbol}</p>
            <p className="text-xs text-gray-400 mt-1">{mySubscriptions.filter(s => s.isActive).length} {t('portfolio.activeCount')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
