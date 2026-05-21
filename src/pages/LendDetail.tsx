import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Info, SearchX, Loader2 } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { LONG_POOL_ABI, SHORT_POOL_ABI, BONDING_CURVE_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { calculateExponentialRate } from '@/data/poolData'
import { cn, formatUsdc, formatTokenAmount } from '@/lib/utils'
import { useT } from '@/i18n/useT'

type PoolMode = 'long' | 'short'

export default function LendDetail() {
  const t = useT()
  const params = useParams()
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const pathMode: PoolMode = params.mode === 'short' ? 'short' : 'long'
  const tokenAddr = params.tokenAddress as `0x${string}` | undefined
  const isShortMode = pathMode === 'short' && !!tokenAddr && !isZeroAddress(tokenAddr)
  const isLongMode = pathMode === 'long' && !!tokenAddr && !isZeroAddress(tokenAddr)

  const longPoolAddress = getContractAddress(chainId, 'longPool')
  const shortPoolAddress = getContractAddress(chainId, 'shortPool')
  const bondingCurveAddress = getContractAddress(chainId, 'bondingCurve')
  const longPoolReady = !isZeroAddress(longPoolAddress)
  const shortPoolReady = !isZeroAddress(shortPoolAddress)

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'borrow'>('deposit')
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [collateralAmount, setCollateralAmount] = useState('')
  const [shortTokenAmount, setShortTokenAmount] = useState('')
  const [txError, setTxError] = useState('')

  const { writeContractAsync, data: txHash, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: tokenDepositsData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'tokenDeposits',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr },
  })

  const { data: longUtilData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'getUtilization',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr },
  })

  const { data: longDailyRateData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'getDailyRate',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr },
  })

  const { data: depositData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'deposits',
    args: tokenAddr && userAddress ? [tokenAddr, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr && !!userAddress },
  })

  const { data: pendingYieldData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'pendingYield',
    args: tokenAddr && userAddress ? [tokenAddr, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr && !!userAddress },
  })

  const { data: longBorrowData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'borrows',
    args: tokenAddr && userAddress ? [tokenAddr, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr && !!userAddress },
  })

  const { data: longHealthData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'getHealthFactor',
    args: tokenAddr && userAddress ? [tokenAddr, userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!tokenAddr && !!userAddress },
  })

  const { data: shortAvailableData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'tokenAvailable',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!tokenAddr },
  })

  const { data: shortBorrowedData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'tokenBorrowed',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!tokenAddr },
  })

  const { data: shortUtilData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'getUtilization',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!tokenAddr },
  })

  const { data: shortDailyRateData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'getDailyRate',
    args: tokenAddr ? [tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!tokenAddr },
  })

  const { data: shortPositionData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'positions',
    args: userAddress && tokenAddr ? [userAddress, tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!userAddress && !!tokenAddr },
  })

  const { data: shortHealthData } = useReadContract({
    address: shortPoolAddress,
    abi: SHORT_POOL_ABI,
    functionName: 'getHealthFactor',
    args: userAddress && tokenAddr ? [userAddress, tokenAddr] : undefined,
    chainId,
    query: { enabled: shortPoolReady && !!userAddress && !!tokenAddr },
  })

  const { data: tokenPriceData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getBuyPrice',
    args: tokenAddr ? [tokenAddr, parseEther('1')] : undefined,
    chainId,
    query: { enabled: !isZeroAddress(bondingCurveAddress) && !!tokenAddr },
  })

  const tokensPerNative = tokenPriceData != null ? Number(formatEther(tokenPriceData as bigint)) : 0
  const pricePerTokenInNative = tokensPerNative > 0 ? 1 / tokensPerNative : 0

  const totalDeposits = tokenDepositsData != null ? Number(formatEther(tokenDepositsData as bigint)) : 0
  const longUtilization = longUtilData != null ? Number(longUtilData as bigint) / 1e16 : 0
  const longDailyRate = longDailyRateData != null ? Number(longDailyRateData as bigint) / 1e16 : 0
  const depositAPY = (Math.pow(1 + longDailyRate / 100, 365) - 1) * 100
  const borrowAPY = depositAPY

  const userDeposit = depositData ? Number(formatEther((depositData as [bigint, bigint, bigint])[0])) : 0
  const userPendingYield = pendingYieldData != null ? Number(formatEther(pendingYieldData as bigint)) : 0

  const longBorrow = longBorrowData as [bigint, bigint, bigint] | undefined
  const hasLongBorrow = longBorrow ? longBorrow[0] > 0n : false
  const longBorrowAmount = longBorrow ? Number(formatEther(longBorrow[1])) : 0
  const longHealth = longHealthData != null ? Number(formatEther(longHealthData as bigint)) : 0

  const shortAvailable = shortAvailableData != null ? Number(formatEther(shortAvailableData as bigint)) : 0
  const shortBorrowed = shortBorrowedData != null ? Number(formatEther(shortBorrowedData as bigint)) : 0
  const shortUtil = shortUtilData != null ? Number(shortUtilData as bigint) / 1e16 : 0
  const shortDailyRate = shortDailyRateData != null ? Number(shortDailyRateData as bigint) / 1e16 : 0

  const shortPosition = shortPositionData as [bigint, bigint, bigint, boolean] | undefined
  const hasShortPosition = shortPosition ? shortPosition[3] : false
  const shortCollateral = shortPosition ? Number(formatEther(shortPosition[0])) : 0
  const shortBorrowedTokens = shortPosition ? Number(formatEther(shortPosition[1])) : 0
  const shortHealth = shortHealthData != null ? Number(formatEther(shortHealthData as bigint)) : 0

  const healthFactor = useMemo(() => {
    if (!collateralAmount || !borrowAmount) return 0
    const collateralValue = parseFloat(collateralAmount) * 0.75
    const borrowValue = parseFloat(borrowAmount)
    if (borrowValue === 0) return Infinity
    return collateralValue / borrowValue
  }, [collateralAmount, borrowAmount])

  const healthColor = healthFactor >= 2 ? 'text-neon-green' : healthFactor >= 1.5 ? 'text-neon-yellow' : 'text-neon-red'
  const healthBg = healthFactor >= 2 ? 'bg-neon-green' : healthFactor >= 1.5 ? 'bg-neon-yellow' : 'bg-neon-red'

  const estimatedEarnings = depositAmount
    ? formatUsdc(parseFloat(depositAmount) * depositAPY / 100 / 365)
    : '0'

  const handleDeposit = () => {
    setTxError('')
    if (!depositAmount || Number(depositAmount) <= 0 || !longPoolReady || !tokenAddr) return
    writeContractAsync({
      address: longPoolAddress,
      abi: LONG_POOL_ABI,
      functionName: 'deposit',
      args: [tokenAddr],
      value: parseEther(depositAmount),
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleWithdraw = () => {
    setTxError('')
    if (!withdrawAmount || Number(withdrawAmount) <= 0 || !longPoolReady || !tokenAddr) return
    writeContractAsync({
      address: longPoolAddress,
      abi: LONG_POOL_ABI,
      functionName: 'withdraw',
      args: [tokenAddr, parseEther(withdrawAmount)],
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleClaimYield = () => {
    setTxError('')
    if (!longPoolReady || !tokenAddr) return
    writeContractAsync({
      address: longPoolAddress,
      abi: LONG_POOL_ABI,
      functionName: 'claimYield',
      args: [tokenAddr],
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleShortBorrow = () => {
    setTxError('')
    if (!shortTokenAmount || Number(shortTokenAmount) <= 0 || !shortPoolReady || !tokenAddr) return
    const tokenAmount = parseEther(shortTokenAmount)
    const price = pricePerTokenInNative > 0 ? pricePerTokenInNative : 1
    const requiredCollateral = Number(shortTokenAmount) * price * 1.5
    const collateral = parseEther(String(Math.ceil(requiredCollateral * 1.01)))
    writeContractAsync({
      address: shortPoolAddress,
      abi: SHORT_POOL_ABI,
      functionName: 'borrow',
      args: [tokenAddr, tokenAmount],
      value: collateral,
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  const handleShortRepay = () => {
    setTxError('')
    if (!shortPoolReady || !tokenAddr || !hasShortPosition) return
    writeContractAsync({
      address: shortPoolAddress,
      abi: SHORT_POOL_ABI,
      functionName: 'repay',
      args: [tokenAddr, shortPosition![1]],
      gas: 5_000_000n,
    } as any).catch((err: any) => {
      const msg = err?.shortMessage || err?.message || ''
      if (!msg.includes('User rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      }
    })
  }

  if (!isShortMode && !isLongMode) {
    return (
      <div className="animate-fade-in">
        <Link to="/lend" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t('common.back')}</span>
        </Link>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-20 h-20 rounded-2xl bg-dark-700 flex items-center justify-center mb-6">
            <SearchX className="w-10 h-10 text-gray-500" />
          </div>
          <h2 className="font-display font-bold text-2xl mb-2">{t('lendDetail.assetNotFound')}</h2>
          <p className="text-gray-400 mb-6">{t('lendDetail.assetNotFoundDesc')}</p>
          <Link to="/lend" className="btn-primary">{t('lendDetail.backToLend')}</Link>
        </div>
      </div>
    )
  }

  if (isShortMode) {
    return (
      <div className="animate-fade-in">
        <Link to="/lend" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t('common.back')}</span>
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-neon-red/10 border border-neon-red/30 flex items-center justify-center text-2xl font-display font-bold text-neon-red">
            S
          </div>
          <div>
            <h1 className="font-display font-bold text-3xl">{t('lendDetail.shortPoolTitle')}</h1>
            <p className="text-gray-400 font-mono text-sm">{tokenAddr?.slice(0, 6)}...{tokenAddr?.slice(-4)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card-dark text-center">
                <p className="text-xs text-gray-400 mb-1">{t('lend.table.available')}</p>
                <p className="text-lg font-display font-bold">{formatTokenAmount(shortAvailable)}</p>
              </div>
              <div className="card-dark text-center">
                <p className="text-xs text-gray-400 mb-1">{t('lend.table.borrowed')}</p>
                <p className="text-lg font-display font-bold text-neon-red">{formatTokenAmount(shortBorrowed)}</p>
              </div>
              <div className="card-dark text-center">
                <p className="text-xs text-gray-400 mb-1">{t('lend.table.utilization')}</p>
                <p className="text-lg font-display font-bold">{shortUtil.toFixed(1)}%</p>
              </div>
              <div className="card-dark text-center">
                <p className="text-xs text-gray-400 mb-1">{t('lend.table.dailyRate')}</p>
                <p className={cn('text-lg font-display font-bold', shortDailyRate > 10 ? 'text-neon-red' : shortDailyRate > 3 ? 'text-neon-yellow' : 'text-neon-green')}>
                  {shortDailyRate.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="card-dark">
              <h3 className="font-display font-semibold mb-3">{t('lendDetail.utilizationRate')}</h3>
              <div className="progress-bar h-4">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    shortUtil > 80 ? 'bg-neon-red' : shortUtil > 60 ? 'bg-neon-yellow' : 'bg-neon-green'
                  )}
                  style={{ width: `${Math.min(shortUtil, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span>0%</span>
                <span className="text-neon-yellow">{t('lendDetail.optimal')}</span>
                <span>100%</span>
              </div>
            </div>

            {isConnected && hasShortPosition && (
              <div className="card-dark">
                <h3 className="font-display font-semibold mb-3">{t('lendDetail.yourPosition')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400">{t('lendDetail.shortCollateral')}</p>
                    <p className="font-display font-bold text-neon-green">{formatUsdc(shortCollateral)} {nativeSymbol}</p>
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400">{t('lendDetail.shortBorrowedTokens')}</p>
                    <p className="font-display font-bold text-neon-red">{formatTokenAmount(shortBorrowedTokens)}</p>
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400">{t('lendDetail.healthFactor')}</p>
                    <p className={cn('font-display font-bold', shortHealth > 2e18 ? 'text-neon-green' : shortHealth > 1e18 ? 'text-neon-yellow' : 'text-neon-red')}>
                      {shortHealth > 1e18 ? (shortHealth / 1e18).toFixed(2) : shortHealth > 0 ? (shortHealth / 1e18).toFixed(4) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card-dark">
              <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-neon-red" />
                {t('lendDetail.shortRules')}
              </h3>
              <div className="space-y-2 text-sm text-gray-400 leading-relaxed">
                <p>{t('lendDetail.shortRule1')}</p>
                <p>{t('lendDetail.shortRule2')}</p>
                <p>{t('lendDetail.shortRule3')}</p>
                <p>{t('lendDetail.shortRule4')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-dark">
              <h3 className="font-display font-semibold mb-4">{t('lendDetail.openShort')}</h3>
              {!hasShortPosition ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">{t('lendDetail.borrowTokenAmount')}</label>
                    <input
                      type="number"
                      className="input-dark w-full"
                      placeholder="0.0"
                      value={shortTokenAmount}
                      onChange={(e) => setShortTokenAmount(e.target.value)}
                    />
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{t('lendDetail.requiredCollateral')}</p>
                    <p className="font-display font-bold text-lg">
                      {shortTokenAmount ? (parseFloat(shortTokenAmount) * (pricePerTokenInNative > 0 ? pricePerTokenInNative : 1) * 1.5).toFixed(4) : '0.00'} {nativeSymbol}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{t('lendDetail.collateralRatio150')}</p>
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{t('lend.table.dailyRate')}</p>
                    <p className={cn('font-display font-bold text-lg', shortDailyRate > 10 ? 'text-neon-red' : 'text-neon-yellow')}>
                      {shortDailyRate.toFixed(2)}% {t('common.perDay')}
                    </p>
                  </div>
                  {isConfirmed && (
                    <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3 text-xs text-neon-green">
                      {t('lendDetail.shortOpenSuccess')}
                    </div>
                  )}
                  <button
                    className="btn-primary w-full text-center flex items-center justify-center gap-2"
                    style={{ background: '#ef4444' }}
                    onClick={handleShortBorrow}
                    disabled={isWritePending || isConfirming || !shortTokenAmount || Number(shortTokenAmount) <= 0}
                  >
                    {isWritePending || isConfirming ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('lendDetail.confirming')}</>
                    ) : (
                      <><ArrowUpFromLine className="w-4 h-4" /> {t('lendDetail.openShort')}</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-dark-700 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">{t('lendDetail.shortBorrowedTokens')}</p>
                    <p className="font-display font-bold text-xl text-neon-red">{formatTokenAmount(shortBorrowedTokens)}</p>
                  </div>
                  <div className="bg-dark-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{t('lendDetail.shortCollateral')}</p>
                    <p className="font-display font-bold">{formatUsdc(shortCollateral)} {nativeSymbol}</p>
                  </div>
                  <button
                    className="btn-primary w-full text-center flex items-center justify-center gap-2"
                    onClick={handleShortRepay}
                    disabled={isWritePending || isConfirming}
                  >
                    {isWritePending || isConfirming ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('lendDetail.confirming')}</>
                    ) : (
                      <><ArrowDownToLine className="w-4 h-4" /> {t('lendDetail.closeShort')}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Link to="/lend" className="inline-flex items-center gap-2 text-gray-400 hover:text-neon-green mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">{t('common.back')}</span>
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-neon-green/10 border border-neon-green/30 flex items-center justify-center text-2xl font-display font-bold text-neon-green">
          L
        </div>
        <div>
          <h1 className="font-display font-bold text-3xl">{nativeSymbol} {t('lendDetail.lendingPool')}</h1>
          <p className="text-gray-400 font-mono text-sm">{tokenAddr?.slice(0, 6)}...{tokenAddr?.slice(-4)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-dark text-center">
              <p className="text-xs text-gray-400 mb-1">{t('lend.depositApy')}</p>
              <p className="text-2xl font-display font-bold text-neon-green">{depositAPY.toFixed(2)}%</p>
            </div>
            <div className="card-dark text-center">
              <p className="text-xs text-gray-400 mb-1">{t('lend.borrowApy')}</p>
              <p className="text-2xl font-display font-bold text-neon-purple">{borrowAPY.toFixed(2)}%</p>
            </div>
            <div className="card-dark text-center">
              <p className="text-xs text-gray-400 mb-1">{t('lend.totalDeposited')}</p>
              <p className="text-lg font-display font-bold">{formatUsdc(totalDeposits)} {nativeSymbol}</p>
            </div>
            <div className="card-dark text-center">
              <p className="text-xs text-gray-400 mb-1">{t('lend.utilization')}</p>
              <p className="text-lg font-display font-bold">{longUtilization.toFixed(1)}%</p>
            </div>
          </div>

          {isConnected && (userDeposit > 0 || hasLongBorrow) && (
            <div className="card-dark">
              <h3 className="font-display font-semibold mb-3">{t('lendDetail.yourPosition')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {userDeposit > 0 && (
                  <>
                    <div className="bg-dark-700 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{t('lendDetail.deposited')}</p>
                      <p className="font-display font-bold text-neon-green">{formatUsdc(userDeposit)} {nativeSymbol}</p>
                    </div>
                    <div className="bg-dark-700 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{t('lendDetail.pendingYield')}</p>
                      <p className="font-display font-bold text-neon-green">{formatUsdc(userPendingYield)} {nativeSymbol}</p>
                    </div>
                  </>
                )}
                {hasLongBorrow && (
                  <>
                    <div className="bg-dark-700 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{t('lendDetail.borrowed')}</p>
                      <p className="font-display font-bold text-neon-purple">{formatUsdc(longBorrowAmount)} {nativeSymbol}</p>
                    </div>
                    <div className="bg-dark-700 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{t('lendDetail.healthFactor')}</p>
                      <p className={cn('font-display font-bold', longHealth > 2 ? 'text-neon-green' : longHealth > 1.5 ? 'text-neon-yellow' : 'text-neon-red')}>
                        {longHealth > 0 ? longHealth.toFixed(2) : '—'}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {userPendingYield > 0 && (
                <button
                  className="mt-3 btn-primary w-full text-center flex items-center justify-center gap-2"
                  onClick={handleClaimYield}
                  disabled={isWritePending || isConfirming}
                >
                  {isWritePending || isConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('lendDetail.confirming')}</>
                  ) : (
                    <><ArrowDownToLine className="w-4 h-4" /> {t('lendDetail.claimYield')} ({formatUsdc(userPendingYield)} {nativeSymbol})</>
                  )}
                </button>
              )}
            </div>
          )}

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3">{t('lendDetail.utilizationRate')}</h3>
            <div className="progress-bar h-4">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  longUtilization > 80 ? 'bg-neon-red' : longUtilization > 60 ? 'bg-neon-yellow' : 'bg-neon-green'
                )}
                style={{ width: `${Math.min(longUtilization, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>0%</span>
              <span className="text-neon-yellow">{t('lendDetail.optimal')}</span>
              <span>100%</span>
            </div>
          </div>

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-neon-purple" />
              {t('lendDetail.rateModel')}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('lendDetail.rateModelDesc')}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">{t('lendDetail.baseRate')}</p>
                <p className="font-display font-semibold">{calculateExponentialRate(0).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">{t('lendDetail.optimalRate')}</p>
                <p className="font-display font-semibold">{calculateExponentialRate(80).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">{t('lendDetail.at50Util')}</p>
                <p className="font-display font-semibold">{calculateExponentialRate(50).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">{t('lendDetail.at95Util')}</p>
                <p className="font-display font-semibold text-neon-red">{calculateExponentialRate(95).toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-dark">
            <div className="flex mb-4 bg-dark-700 rounded-lg p-1">
              <button
                className={cn(
                  'flex-1 py-2.5 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-2',
                  activeTab === 'deposit' ? 'bg-neon-green text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('deposit')}
              >
                <ArrowDownToLine className="w-4 h-4" /> {t('lendDetail.deposit')}
              </button>
              <button
                className={cn(
                  'flex-1 py-2.5 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-2',
                  activeTab === 'withdraw' ? 'bg-neon-yellow text-dark-900' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('withdraw')}
              >
                <ArrowUpFromLine className="w-4 h-4" /> {t('lendDetail.withdraw')}
              </button>
              <button
                className={cn(
                  'flex-1 py-2.5 rounded-md text-sm font-display font-semibold transition-all flex items-center justify-center gap-2',
                  activeTab === 'borrow' ? 'bg-neon-purple text-white' : 'text-gray-400 hover:text-white'
                )}
                onClick={() => setActiveTab('borrow')}
              >
                <ArrowUpFromLine className="w-4 h-4" /> {t('lendDetail.borrow')}
              </button>
            </div>

            {activeTab === 'deposit' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('lendDetail.depositAmount')} ({nativeSymbol})</label>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t('lendDetail.dailyEarnings')}</p>
                  <p className="font-display font-bold text-lg text-neon-green">{estimatedEarnings} {nativeSymbol}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('lendDetail.apyLabel', { value: depositAPY.toFixed(2) })}</p>
                </div>
                {isConfirmed && (
                  <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3 text-xs text-neon-green">
                    {t('lendDetail.depositSuccess')}
                  </div>
                )}
                <button
                  className="btn-primary w-full text-center flex items-center justify-center gap-2"
                  onClick={handleDeposit}
                  disabled={isWritePending || isConfirming || !depositAmount || Number(depositAmount) <= 0}
                >
                  {isWritePending || isConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('lendDetail.confirming')}</>
                  ) : (
                    <><ArrowDownToLine className="w-4 h-4" /> {t('lendDetail.deposit')} {nativeSymbol}</>
                  )}
                </button>
              </div>
            ) : activeTab === 'withdraw' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('lendDetail.withdrawAmount')} ({nativeSymbol})</label>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t('lendDetail.deposited')}</p>
                  <p className="font-display font-bold text-lg">{formatUsdc(userDeposit)} {nativeSymbol}</p>
                </div>
                {isConfirmed && (
                  <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3 text-xs text-neon-green">
                    {t('lendDetail.withdrawSuccess')}
                  </div>
                )}
                <button
                  className="btn-primary w-full text-center flex items-center justify-center gap-2"
                  style={{ background: '#eab308' }}
                  onClick={handleWithdraw}
                  disabled={isWritePending || isConfirming || !withdrawAmount || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > userDeposit}
                >
                  {isWritePending || isConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('lendDetail.confirming')}</>
                  ) : (
                    <><ArrowUpFromLine className="w-4 h-4" /> {t('lendDetail.withdraw')} {nativeSymbol}</>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-dark-700 rounded-lg p-6 text-center">
                  <ArrowUpFromLine className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                  <p className="font-display font-semibold text-gray-400 mb-1">{t('lendDetail.comingSoon')}</p>
                  <p className="text-xs text-gray-500">{t('lendDetail.comingSoonDesc')}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('lendDetail.collateralAmount')}</label>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    disabled
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">{t('lendDetail.borrowAmount')} ({nativeSymbol})</label>
                  <input
                    type="number"
                    className="input-dark w-full"
                    placeholder="0.0"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    disabled
                  />
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400">{t('lendDetail.healthFactor')}</p>
                    <p className={cn('font-display font-bold text-lg', healthColor)}>
                      {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
                    </p>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', healthBg)}
                      style={{ width: `${healthFactor === Infinity ? 100 : Math.min(healthFactor / 3 * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{t('lendDetail.liquidation')}</span>
                    <span>{t('lendDetail.safe')}</span>
                  </div>
                </div>
                {healthFactor > 0 && healthFactor < 1.5 && (
                  <div className="flex items-start gap-2 bg-neon-red/10 border border-neon-red/30 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-neon-red shrink-0 mt-0.5" />
                    <p className="text-xs text-neon-red">
                      {healthFactor < 1
                        ? t('lendDetail.healthDanger')
                        : t('lendDetail.healthWarning')}
                    </p>
                  </div>
                )}
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{t('lend.borrowApy')}</p>
                  <p className="font-display font-bold text-lg text-neon-purple">{borrowAPY.toFixed(2)}%</p>
                  <p className="text-xs text-gray-400 mt-1">{t('lendDetail.maxLtv')}</p>
                </div>
                <button className="btn-primary w-full text-center flex items-center justify-center gap-2 opacity-50 cursor-not-allowed" style={{ background: '#8b5cf6' }} disabled>
                  <ArrowUpFromLine className="w-4 h-4" /> {t('lendDetail.borrow')} {nativeSymbol}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
