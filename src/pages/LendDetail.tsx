import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Info, SearchX, Loader2 } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { LONG_POOL_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { calculateExponentialRate } from '@/data/poolData'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'

export default function LendDetail() {
  const t = useT()
  const { address: tokenAddress } = useParams()
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const longPoolAddress = getContractAddress(chainId, 'longPool')
  const longPoolReady = !isZeroAddress(longPoolAddress)

  const [activeTab, setActiveTab] = useState<'deposit' | 'borrow'>('deposit')
  const [depositAmount, setDepositAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [collateralAmount, setCollateralAmount] = useState('')

  const { data: totalDepositsData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'totalDeposits',
    chainId,
    query: { enabled: longPoolReady },
  })

  const { data: totalBorrowsData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'totalBorrows',
    chainId,
    query: { enabled: longPoolReady },
  })

  const { data: depositData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'deposits',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { data: borrowData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'borrows',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { data: ltvData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'getLTV',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { data: pendingYieldData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'pendingYield',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: longPoolReady && !!userAddress },
  })

  const { writeContractAsync, data: txHash, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const totalDeposits = totalDepositsData != null ? Number(formatEther(totalDepositsData as bigint)) : 0
  const totalBorrows = totalBorrowsData != null ? Number(formatEther(totalBorrowsData as bigint)) : 0
  const utilization = totalDeposits > 0 ? (totalBorrows / totalDeposits) * 100 : 0
  const depositAPY = totalDeposits > 0 ? (Math.pow(1 + calculateExponentialRate(utilization) / 100, 365) - 1) * 100 : 0
  const borrowAPY = totalDeposits > 0 ? (Math.pow(1 + calculateExponentialRate(utilization) / 100, 365) - 1) * 100 : 0

  const userDeposit = depositData ? Number(formatEther((depositData as [bigint, bigint, bigint])[0])) : 0
  const userYieldEarned = depositData ? Number(formatEther((depositData as [bigint, bigint, bigint])[1])) : 0
  const userYieldClaimed = depositData ? Number(formatEther((depositData as [bigint, bigint, bigint])[2])) : 0
  const userBorrowPrincipal = borrowData ? Number(formatEther((borrowData as [bigint, bigint, bigint])[0])) : 0
  const userBorrowInterest = borrowData ? Number(formatEther((borrowData as [bigint, bigint, bigint])[1])) : 0
  const userLTV = ltvData != null ? Number(formatEther(ltvData as bigint)) * 100 : 0
  const userPendingYield = pendingYieldData != null ? Number(formatEther(pendingYieldData as bigint)) : 0

  const healthFactor = useMemo(() => {
    if (!collateralAmount || !borrowAmount) return 0
    const collateralValue = parseFloat(collateralAmount) * 0.75
    const borrowValue = parseFloat(borrowAmount)
    if (borrowValue === 0) return Infinity
    return collateralValue / borrowValue
  }, [collateralAmount, borrowAmount])

  const healthColor = healthFactor >= 2 ? 'text-neon-green' : healthFactor >= 1.5 ? 'text-neon-yellow' : healthFactor >= 1 ? 'text-neon-red' : 'text-neon-red'
  const healthBg = healthFactor >= 2 ? 'bg-neon-green' : healthFactor >= 1.5 ? 'bg-neon-yellow' : 'bg-neon-red'

  const estimatedEarnings = depositAmount
    ? formatUsdc(parseFloat(depositAmount) * depositAPY / 100 / 365)
    : '0'

  const handleDeposit = () => {
    if (!depositAmount || Number(depositAmount) <= 0 || !longPoolReady) return
    writeContractAsync({
      address: longPoolAddress,
      abi: LONG_POOL_ABI,
      functionName: 'deposit',
      value: parseEther(depositAmount),
      gas: 5_000_000n,
    } as any).catch(() => {})
  }

  if (!tokenAddress) {
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
          <h2 className="font-display font-bold text-2xl mb-2">Asset Not Found</h2>
          <p className="text-gray-400 mb-6">This lending asset does not exist or has not been created yet.</p>
          <Link to="/lend" className="btn-primary">Back to Lend Market</Link>
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
        <div className="w-14 h-14 rounded-full bg-dark-600 flex items-center justify-center text-2xl font-display font-bold text-neon-purple">
          B
        </div>
        <div>
          <h1 className="font-display font-bold text-3xl">{nativeSymbol} Lending Pool</h1>
          <p className="text-gray-400 font-mono text-sm">LongPool</p>
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
              <p className="text-lg font-display font-bold">{utilization.toFixed(1)}%</p>
            </div>
          </div>

          {isConnected && (userDeposit > 0 || userBorrowPrincipal > 0) && (
            <div className="card-dark">
              <h3 className="font-display font-semibold mb-3">Your Position</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Deposited</p>
                  <p className="font-display font-bold text-neon-green">{formatUsdc(userDeposit)} {nativeSymbol}</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Pending Yield</p>
                  <p className="font-display font-bold text-neon-green">{formatUsdc(userPendingYield)} {nativeSymbol}</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Borrowed</p>
                  <p className="font-display font-bold text-neon-red">{formatUsdc(userBorrowPrincipal)} {nativeSymbol}</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400">LTV</p>
                  <p className={cn('font-display font-bold', userLTV > 75 ? 'text-neon-red' : 'text-white')}>{userLTV.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          )}

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3">{t('lendDetail.utilizationRate')}</h3>
            <div className="progress-bar h-4">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  utilization > 80 ? 'bg-neon-red' : utilization > 60 ? 'bg-neon-yellow' : 'bg-neon-green'
                )}
                style={{ width: `${Math.min(utilization, 100)}%` }}
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
                <p className="text-gray-400 text-xs">Base Rate</p>
                <p className="font-display font-semibold">{calculateExponentialRate(0).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Optimal Rate</p>
                <p className="font-display font-semibold">{calculateExponentialRate(80).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">At 50% Util</p>
                <p className="font-display font-semibold">{calculateExponentialRate(50).toFixed(2)}%</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">At 95% Util</p>
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
                  <p className="text-xs text-gray-400 mt-1">APY: {depositAPY.toFixed(2)}%</p>
                </div>
                {isConfirmed && (
                  <div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3 text-xs text-neon-green">
                    Deposit successful!
                  </div>
                )}
                <button
                  className="btn-primary w-full text-center flex items-center justify-center gap-2"
                  onClick={handleDeposit}
                  disabled={isWritePending || isConfirming || !depositAmount || Number(depositAmount) <= 0}
                >
                  {isWritePending || isConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Confirming...</>
                  ) : (
                    <><ArrowDownToLine className="w-4 h-4" /> {t('lendDetail.deposit')} {nativeSymbol}</>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-dark-700 rounded-lg p-6 text-center">
                  <ArrowUpFromLine className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                  <p className="font-display font-semibold text-gray-400 mb-1">Coming soon</p>
                  <p className="text-xs text-gray-500">Borrowing requires ShortPool integration</p>
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
                      style={{ width: `${Math.min(healthFactor / 3 * 100, 100)}%` }}
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
