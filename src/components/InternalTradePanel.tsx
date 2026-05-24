import { useState, useMemo, useCallback, useEffect } from 'react'
import { formatEther, parseEther, zeroAddress } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { BONDING_CURVE_ABI } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { AlertCircle, TrendingUp } from 'lucide-react'
import { getBscScanUrl } from '@/config/contracts'

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
] as const

interface InternalTradePanelProps {
  tokenAddress: `0x${string}`
  tokenSymbol: string
  nativeSymbol: string
  bondingCurveAddress: `0x${string}`
  chainId: number
  onTxConfirmed?: () => void
}

export default function InternalTradePanel({
  tokenAddress,
  tokenSymbol,
  nativeSymbol,
  bondingCurveAddress,
  chainId,
  onTxConfirmed,
}: InternalTradePanelProps) {
  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txError, setTxError] = useState('')
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()

  const { writeContractAsync, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const buyBnbAmount = useMemo(() => {
    if (!buyAmount || Number(buyAmount) <= 0) return parseEther('1')
    try {
      return parseEther(buyAmount)
    } catch {
      return parseEther('1')
    }
  }, [buyAmount])

  const buyBnbAmountAfterFee = useMemo(() => {
    const feeBps = BigInt(100)
    return (buyBnbAmount * (BigInt(10000) - feeBps)) / BigInt(10000)
  }, [buyBnbAmount])

  const { data: buyPriceData, refetch: refetchBuyPrice } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'getBuyPrice',
    args: [tokenAddress, buyBnbAmountAfterFee],
    chainId,
    query: { enabled: true },
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
    query: { enabled: sellTokenAmount > BigInt(0) },
  })

  const { data: userTokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: !!userAddress },
  })

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, bondingCurveAddress] : undefined,
    chainId,
    query: { enabled: !!userAddress && activeTab === 'sell' },
  })

  const estimatedTokens = useMemo(() => {
    if (!buyPriceData) return BigInt(0)
    return buyPriceData
  }, [buyPriceData])

  const estimatedBnb = useMemo(() => {
    if (!sellPriceData) return BigInt(0)
    return sellPriceData
  }, [sellPriceData])

  const needsApproval = useMemo(() => {
    if (!sellAmount || !allowanceData) return true
    try {
      const tokenWei = parseEther(sellAmount)
      return allowanceData < tokenWei
    } catch {
      return true
    }
  }, [sellAmount, allowanceData])

  useEffect(() => {
    if (isConfirmed) {
      refetchBuyPrice()
      refetchSellPrice()
      refetchBalance()
      refetchAllowance()
      onTxConfirmed?.()
    }
  }, [isConfirmed, refetchBuyPrice, refetchSellPrice, refetchBalance, refetchAllowance, onTxConfirmed])

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

  const formatTokenAmount = (val: bigint) => {
    const num = Number(formatEther(val))
    if (num === 0) return '0'
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (num >= 0.001) return num.toFixed(4)
    return num.toExponential(2)
  }

  return (
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

      <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border"
        style={{ backgroundColor: 'rgba(249,115,22,0.05)', borderColor: 'rgba(249,115,22,0.2)' }}
      >
        <TrendingUp className="w-4 h-4 text-doge-gold" />
        <span className="text-xs text-doge-gold font-medium">{t('tokenDetail.internalMarket')}</span>
      </div>

      {activeTab === 'buy' ? (
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
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3 mt-4">
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
  )
}
