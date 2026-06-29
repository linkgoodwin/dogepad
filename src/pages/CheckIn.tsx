import { useState, useEffect } from 'react'
import { CalendarCheck, Gift, Users, Copy, Check, Loader2, Flame, TrendingUp, AlertTriangle } from 'lucide-react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther } from 'viem'
import { DAILY_CHECKIN_ABI, getContractAddress, isZeroAddress } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

function fmtToken(val: bigint): string {
  const num = Number(formatEther(val))
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function CheckIn() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useTargetChainId()

  const checkinAddress = getContractAddress(chainId, 'dailyCheckin')
  const ready = !isZeroAddress(checkinAddress)

  const { writeContractAsync, data: txHash, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: userInfoData, refetch: refetchUserInfo } = useReadContract({
    address: checkinAddress,
    abi: DAILY_CHECKIN_ABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: ready && !!address },
  })

  const { data: rewardTokenData } = useReadContract({
    address: checkinAddress,
    abi: DAILY_CHECKIN_ABI,
    functionName: 'rewardToken',
    chainId,
    query: { enabled: ready },
  })

  const { data: contractBalanceData } = useReadContract({
    address: checkinAddress,
    abi: DAILY_CHECKIN_ABI,
    functionName: 'contractBalance',
    chainId,
    query: { enabled: ready },
  })

  const { data: paramsData } = useReadContracts({
    contracts: [
      { address: checkinAddress, abi: DAILY_CHECKIN_ABI, functionName: 'baseReward', chainId },
      { address: checkinAddress, abi: DAILY_CHECKIN_ABI, functionName: 'dailyIncrement', chainId },
      { address: checkinAddress, abi: DAILY_CHECKIN_ABI, functionName: 'maxStreak', chainId },
    ],
    query: { enabled: ready },
  })

  // Parse user info tuple: (lastCheckinDay, streak, totalClaimed, referrer, refEarnings, refCount, canCheckinToday, todayReward)
  const ui = userInfoData as any
  const streak = ui ? Number(ui[1] ?? ui.streak ?? 0n) : 0
  const totalClaimed = ui ? BigInt((ui[2] ?? ui.totalClaimed ?? 0n) as bigint) : 0n
  const referrer = ui ? String(ui[3] ?? ui.referrer ?? ZERO_ADDRESS) : ZERO_ADDRESS
  const refEarnings = ui ? BigInt((ui[4] ?? ui.refEarnings ?? 0n) as bigint) : 0n
  const refCount = ui ? Number(ui[5] ?? ui.refCount ?? 0n) : 0
  const canCheckinToday = ui ? Boolean(ui[6] ?? ui.canCheckinToday ?? false) : false
  const todayReward = ui ? BigInt((ui[7] ?? ui.todayReward ?? 0n) as bigint) : 0n

  const baseReward = paramsData?.[0]?.status === 'success' ? BigInt(paramsData[0].result as bigint) : 0n
  const dailyIncrement = paramsData?.[1]?.status === 'success' ? BigInt(paramsData[1].result as bigint) : 0n
  const maxStreak = paramsData?.[2]?.status === 'success' ? Number(paramsData[2].result as bigint) : 30

  const rewardToken = rewardTokenData as `0x${string}` | undefined
  const tokenConfigured = !!rewardToken && !isZeroAddress(rewardToken)
  const contractBalance = contractBalanceData ? BigInt(contractBalanceData as bigint) : 0n

  const [txError, setTxError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isConfirmed) {
      refetchUserInfo()
    }
  }, [isConfirmed, refetchUserInfo])

  const handleCheckin = () => {
    setTxError('')
    writeContractAsync({
      address: checkinAddress,
      abi: DAILY_CHECKIN_ABI,
      functionName: 'checkin',
      args: [],
      chainId,
      gas: 500_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const referralLink = address ? `https://dogepad.pro/?ref=${address}` : ''

  const handleCopy = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isBusy = isWritePending || isConfirming

  if (!isConnected) {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display font-bold text-3xl mb-2">
            <CalendarCheck className="w-8 h-8 inline-block mr-2 text-doge-gold" />
            {t('checkin.title')}
          </h1>
          <p className="text-gray-400">{t('checkin.subtitle')}</p>
        </div>
        <div className="card-dark text-center py-16">
          <CalendarCheck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-display mb-2">{t('checkin.connectWallet')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-3xl mb-2">
          <CalendarCheck className="w-8 h-8 inline-block mr-2 text-doge-gold" />
          {t('checkin.title')}
        </h1>
        <p className="text-gray-400">{t('checkin.subtitle')}</p>
      </div>

      {/* Error */}
      {txError && (
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
          <p className="text-xs text-neon-red">{txError}</p>
        </div>
      )}

      {/* Token not configured warning */}
      {!tokenConfigured && ready && (
        <div className="bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-neon-yellow shrink-0 mt-0.5" />
          <p className="text-xs text-neon-yellow">{t('checkin.tokenNotSet')}</p>
        </div>
      )}

      {/* Check-in Card */}
      <div className="card-dark">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Streak display */}
          <div className="flex flex-col items-center justify-center w-full md:w-48 shrink-0">
            <div className="w-24 h-24 rounded-full bg-doge-gold/10 border-2 border-doge-gold/30 flex flex-col items-center justify-center">
              <Flame className="w-7 h-7 text-doge-gold mb-0.5" />
              <span className="text-3xl font-display font-extrabold text-doge-gold leading-none">{streak}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {t('checkin.streak')} · {streak} {t('checkin.days')}
            </p>
          </div>

          {/* Today reward + button */}
          <div className="flex-1 w-full text-center md:text-left">
            <p className="text-xs text-gray-400 mb-1">{t('checkin.todayReward')}</p>
            <p className="text-4xl font-display font-extrabold neon-text mb-4">
              {fmtToken(todayReward)}
            </p>
            <button
              onClick={handleCheckin}
              disabled={!canCheckinToday || isBusy}
              className={cn(
                'w-full md:w-auto px-12 py-3 rounded-lg font-display font-bold text-base transition-all duration-200',
                canCheckinToday && !isBusy
                  ? 'btn-primary'
                  : 'bg-dark-700 text-gray-500 border border-dark-500/30 cursor-not-allowed'
              )}
            >
              {isBusy ? (
                <><Loader2 className="w-5 h-5 inline-block mr-2 animate-spin" />{t('common.confirmInWallet')}</>
              ) : canCheckinToday ? (
                <><CalendarCheck className="w-5 h-5 inline-block mr-2" />{t('checkin.checkinNow')}</>
              ) : (
                <><Check className="w-5 h-5 inline-block mr-2" />{t('checkin.alreadyCheckedIn')}</>
              )}
            </button>
          </div>
        </div>

        {/* Pool balance */}
        <div className="mt-4 pt-4 border-t border-dark-500/30 flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-doge-cyan" />
            {t('checkin.poolBalance')}
          </span>
          <span className="font-display font-semibold text-white">{fmtToken(contractBalance)}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-doge-gold" />
            <p className="text-xs text-gray-400">{t('checkin.totalClaimed')}</p>
          </div>
          <p className="text-2xl font-display font-bold text-white">{fmtToken(totalClaimed)}</p>
        </div>
        <div className="card-dark">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-doge-cyan" />
            <p className="text-xs text-gray-400">{t('checkin.referralCount')}</p>
          </div>
          <p className="text-2xl font-display font-bold text-white">{refCount}</p>
        </div>
        <div className="card-dark">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-neon-green" />
            <p className="text-xs text-gray-400">{t('checkin.referralEarnings')}</p>
          </div>
          <p className="text-2xl font-display font-bold text-neon-green">{fmtToken(refEarnings)}</p>
        </div>
      </div>

      {/* Referral Link */}
      <div className="card-dark">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-doge-gold" />
            {t('checkin.referralLink')}
          </h2>
          <span className="text-xs font-medium text-doge-gold bg-doge-gold/10 border border-doge-gold/30 rounded-full px-3 py-1">
            10% {t('checkin.referralBonus')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={referralLink}
            className="flex-1 bg-dark-700 border border-dark-500/30 rounded-lg px-4 py-2.5 text-sm text-gray-300 font-mono outline-none"
          />
          <button
            onClick={handleCopy}
            className={cn(
              'px-4 py-2.5 rounded-lg font-display font-medium text-sm transition-all duration-200 flex items-center gap-1.5 shrink-0',
              copied
                ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                : 'btn-primary'
            )}
          >
            {copied ? <><Check className="w-4 h-4" />{t('checkin.copied')}</> : <><Copy className="w-4 h-4" />{t('checkin.copyLink')}</>}
          </button>
        </div>
        {referrer !== ZERO_ADDRESS && (
          <p className="text-xs text-gray-500 mt-3">
            {t('checkin.refBound')}: {referrer.slice(0, 6)}...{referrer.slice(-4)}
          </p>
        )}
      </div>

      {/* How It Works */}
      <div className="card-dark">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-4">
          <CalendarCheck className="w-5 h-5 text-doge-gold" />
          {t('checkin.howItWorks')}
        </h2>
        <div className="space-y-3">
          {[
            t('checkin.rule1'),
            t('checkin.rule2'),
            t('checkin.rule3'),
            t('checkin.rule4'),
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-doge-gold">{i + 1}</span>
              </div>
              <p className="text-sm text-gray-300">{rule}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
