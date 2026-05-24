import { useState, useMemo, useCallback, useEffect } from 'react'
import { formatEther, parseEther } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { BONDING_CURVE_ABI, getBscScanUrl } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { AlertCircle, ArrowRightLeft } from 'lucide-react'

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

const ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETH',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const WUSDC_ABI = [
  {
    inputs: [],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'wad', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
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
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

interface ExternalTradePanelProps {
  tokenAddress: `0x${string}`
  tokenSymbol: string
  nativeSymbol: string
  bondingCurveAddress: `0x${string}`
  chainId: number
  onTxConfirmed?: () => void
}

export default function ExternalTradePanel({
  tokenAddress,
  tokenSymbol,
  nativeSymbol,
  bondingCurveAddress,
  chainId,
  onTxConfirmed,
}: ExternalTradePanelProps) {
  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txError, setTxError] = useState('')
  const [pendingWithdraw, setPendingWithdraw] = useState<bigint>(BigInt(0))
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()

  const { writeContractAsync, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: dexRouterData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'dexRouter',
    chainId,
  })

  const { data: baseAssetData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'baseAsset',
    chainId,
  })

  const { data: isXyloRouterData } = useReadContract({
    address: bondingCurveAddress,
    abi: BONDING_CURVE_ABI,
    functionName: 'isXyloRouter',
    chainId,
  })

  const dexRouter = dexRouterData as `0x${string}` | undefined
  const baseAsset = baseAssetData as `0x${string}` | undefined
  const isXyloRouter = Boolean(isXyloRouterData)

  const dexBuyPath = useMemo(() => {
    if (!baseAsset || !tokenAddress) return undefined
    return [baseAsset, tokenAddress] as `0x${string}`[]
  }, [baseAsset, tokenAddress])

  const dexSellPath = useMemo(() => {
    if (!baseAsset || !tokenAddress) return undefined
    return [tokenAddress, baseAsset] as `0x${string}`[]
  }, [baseAsset, tokenAddress])

  const dexBuyAmountIn = useMemo(() => {
    if (!buyAmount || Number(buyAmount) <= 0) return BigInt(0)
    try { return parseEther(buyAmount) } catch { return BigInt(0) }
  }, [buyAmount])

  const { data: dexBuyAmountsOut } = useReadContract({
    address: dexRouter,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: dexBuyAmountIn > BigInt(0) && dexBuyPath ? [dexBuyAmountIn, dexBuyPath] : undefined,
    chainId,
    query: { enabled: dexBuyAmountIn > BigInt(0) && !!dexRouter && !!dexBuyPath },
  })

  const dexSellAmountIn = useMemo(() => {
    if (!sellAmount || Number(sellAmount) <= 0) return BigInt(0)
    try { return parseEther(sellAmount) } catch { return BigInt(0) }
  }, [sellAmount])

  const { data: dexSellAmountsOut } = useReadContract({
    address: dexRouter,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: dexSellAmountIn > BigInt(0) && dexSellPath ? [dexSellAmountIn, dexSellPath] : undefined,
    chainId,
    query: { enabled: dexSellAmountIn > BigInt(0) && !!dexRouter && !!dexSellPath },
  })

  const dexEstimatedTokens = useMemo(() => {
    if (!dexBuyAmountsOut || !Array.isArray(dexBuyAmountsOut)) return BigInt(0)
    return BigInt(dexBuyAmountsOut[dexBuyAmountsOut.length - 1] ?? 0n)
  }, [dexBuyAmountsOut])

  const dexEstimatedBnb = useMemo(() => {
    if (!dexSellAmountsOut || !Array.isArray(dexSellAmountsOut)) return BigInt(0)
    return BigInt(dexSellAmountsOut[dexSellAmountsOut.length - 1] ?? 0n)
  }, [dexSellAmountsOut])

  const { data: userTokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: !!userAddress },
  })

  const { data: dexAllowanceData, refetch: refetchDexAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress && dexRouter ? [userAddress, dexRouter] : undefined,
    chainId,
    query: { enabled: !!userAddress && !!dexRouter && activeTab === 'sell' },
  })

  const { data: wusdcBalanceData, refetch: refetchWusdcBalance } = useReadContract({
    address: baseAsset,
    abi: WUSDC_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: isXyloRouter && !!baseAsset && !!userAddress && activeTab === 'buy' },
  })

  const { data: wusdcAllowanceData, refetch: refetchWusdcAllowance } = useReadContract({
    address: baseAsset,
    abi: WUSDC_ABI,
    functionName: 'allowance',
    args: userAddress && dexRouter ? [userAddress, dexRouter] : undefined,
    chainId,
    query: { enabled: isXyloRouter && !!baseAsset && !!dexRouter && !!userAddress && activeTab === 'buy' },
  })

  const wusdcBalance = wusdcBalanceData ?? BigInt(0)
  const wusdcAllowance = wusdcAllowanceData ?? BigInt(0)

  const needsDeposit = useMemo(() => {
    if (!isXyloRouter || !buyAmount) return false
    try {
      const amount = parseEther(buyAmount)
      return wusdcBalance < amount
    } catch {
      return true
    }
  }, [isXyloRouter, buyAmount, wusdcBalance])

  const needsWusdcApprove = useMemo(() => {
    if (!isXyloRouter || !buyAmount) return false
    try {
      const amount = parseEther(buyAmount)
      return wusdcAllowance < amount
    } catch {
      return true
    }
  }, [isXyloRouter, buyAmount, wusdcAllowance])

  const dexNeedsTokenApprove = useMemo(() => {
    if (!sellAmount || !dexAllowanceData) return true
    try { return dexAllowanceData < parseEther(sellAmount) } catch { return true }
  }, [sellAmount, dexAllowanceData])

  useEffect(() => {
    if (isConfirmed) {
      refetchBalance()
      refetchDexAllowance()
      refetchWusdcBalance()
      refetchWusdcAllowance()
      onTxConfirmed?.()
    }
  }, [isConfirmed, refetchBalance, refetchDexAllowance, refetchWusdcBalance, refetchWusdcAllowance, onTxConfirmed])

  useEffect(() => {
    if (isConfirmed && pendingWithdraw > BigInt(0) && baseAsset) {
      const amount = pendingWithdraw
      setPendingWithdraw(BigInt(0))
      writeContractAsync({
        address: baseAsset,
        abi: WUSDC_ABI,
        functionName: 'withdraw',
        args: [amount],
        chainId,
        gas: 1_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
      })
    }
  }, [isConfirmed, pendingWithdraw, baseAsset, writeContractAsync, chainId])

  const handleDexBuy = useCallback(() => {
    setTxError('')
    if (!buyAmount || !tokenAddress || !dexRouter || !dexBuyPath || dexEstimatedTokens === BigInt(0)) return
    try {
      const amountIn = parseEther(buyAmount)
      const slippageBps = BigInt(Math.round((100 - slippage) * 100))
      const minOut = (dexEstimatedTokens * slippageBps) / BigInt(10000)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

      if (isXyloRouter) {
        writeContractAsync({
          address: dexRouter,
          abi: ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [amountIn, minOut, dexBuyPath, userAddress!, deadline],
          chainId,
          gas: 5_000_000n,
        } as any).catch((err: any) => {
          const msg = err?.shortMessage || err?.message || ''
          if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        })
      } else {
        writeContractAsync({
          address: dexRouter,
          abi: ROUTER_ABI,
          functionName: 'swapExactETHForTokens',
          args: [minOut, dexBuyPath, userAddress!, deadline],
          value: amountIn,
          chainId,
          gas: 5_000_000n,
        } as any).catch((err: any) => {
          const msg = err?.shortMessage || err?.message || ''
          if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        })
      }
    } catch (e) { console.error('DEX Buy failed', e) }
  }, [buyAmount, tokenAddress, dexRouter, dexBuyPath, dexEstimatedTokens, slippage, userAddress, writeContractAsync, chainId, isXyloRouter])

  const handleDeposit = useCallback(() => {
    setTxError('')
    if (!buyAmount || !baseAsset) return
    try {
      const amount = parseEther(buyAmount)
      const depositAmount = amount > wusdcBalance ? amount - wusdcBalance : BigInt(0)
      if (depositAmount === BigInt(0)) return
      writeContractAsync({
        address: baseAsset,
        abi: WUSDC_ABI,
        functionName: 'deposit',
        args: [],
        value: depositAmount,
        chainId,
        gas: 1_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      })
    } catch (e) { console.error('Deposit failed', e) }
  }, [buyAmount, baseAsset, wusdcBalance, writeContractAsync, chainId])

  const handleWusdcApprove = useCallback(() => {
    setTxError('')
    if (!buyAmount || !baseAsset || !dexRouter) return
    try {
      const amount = parseEther(buyAmount)
      writeContractAsync({
        address: baseAsset,
        abi: WUSDC_ABI,
        functionName: 'approve',
        args: [dexRouter, amount],
        chainId,
        gas: 1_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      })
    } catch (e) { console.error('WUSDC Approve failed', e) }
  }, [buyAmount, baseAsset, dexRouter, writeContractAsync, chainId])

  const handleDexApprove = useCallback(() => {
    setTxError('')
    if (!tokenAddress || !dexRouter || !sellAmount) return
    try {
      const amount = parseEther(sellAmount)
      writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [dexRouter, amount],
        chainId,
        gas: 1_000_000n,
      } as any).catch((err: any) => {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
      })
    } catch (e) { console.error('DEX Approve failed', e) }
  }, [tokenAddress, dexRouter, sellAmount, writeContractAsync, chainId])

  const handleDexSell = useCallback(() => {
    setTxError('')
    if (!sellAmount || !tokenAddress || !dexRouter || !dexSellPath || dexEstimatedBnb === BigInt(0)) return
    try {
      const amountIn = parseEther(sellAmount)
      const slippageBps = BigInt(Math.round((100 - slippage) * 100))
      const minOut = (dexEstimatedBnb * slippageBps) / BigInt(10000)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

      if (isXyloRouter) {
        writeContractAsync({
          address: dexRouter,
          abi: ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [amountIn, minOut, dexSellPath, userAddress!, deadline],
          chainId,
          gas: 5_000_000n,
        } as any).catch((err: any) => {
          const msg = err?.shortMessage || err?.message || ''
          if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        })
        setPendingWithdraw(dexEstimatedBnb)
      } else {
        writeContractAsync({
          address: dexRouter,
          abi: ROUTER_ABI,
          functionName: 'swapExactTokensForETH',
          args: [amountIn, minOut, dexSellPath, userAddress!, deadline],
          chainId,
          gas: 5_000_000n,
        } as any).catch((err: any) => {
          const msg = err?.shortMessage || err?.message || ''
          if (!msg.includes('User rejected') && !msg.includes('denied')) setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        })
      }
    } catch (e) { console.error('DEX Sell failed', e) }
  }, [sellAmount, tokenAddress, dexRouter, dexSellPath, dexEstimatedBnb, slippage, userAddress, writeContractAsync, chainId, isXyloRouter])

  const formatTokenAmount = (val: bigint) => {
    const num = Number(formatEther(val))
    if (num === 0) return '0'
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (num >= 0.001) return num.toFixed(4)
    return num.toExponential(2)
  }

  const getBuyButton = () => {
    if (!isConnected) {
      return (
        <button className="btn-primary w-full text-center opacity-50 cursor-not-allowed" disabled>
          {t('common.connect')}
        </button>
      )
    }

    if (isXyloRouter) {
      if (needsDeposit) {
        return (
          <button
            className="btn-primary w-full text-center"
            onClick={handleDeposit}
            disabled={isWritePending || isConfirming || !buyAmount || Number(buyAmount) <= 0}
          >
            {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : t('tokenDetail.wrapUsdc')}
          </button>
        )
      }
      if (needsWusdcApprove) {
        return (
          <button
            className="btn-primary w-full text-center"
            onClick={handleWusdcApprove}
            disabled={isWritePending || isConfirming || !buyAmount || Number(buyAmount) <= 0}
          >
            {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : t('tokenDetail.approveWusdc')}
          </button>
        )
      }
    }

    return (
      <button
        className="btn-primary w-full text-center"
        onClick={handleDexBuy}
        disabled={isWritePending || isConfirming || !buyAmount || Number(buyAmount) <= 0}
      >
        {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : `${t('tokenDetail.buy')} ${tokenSymbol}`}
      </button>
    )
  }

  const getSellButton = () => {
    if (!isConnected) {
      return (
        <button className="btn-danger w-full text-center opacity-50 cursor-not-allowed" disabled>
          {t('common.connect')}
        </button>
      )
    }

    if (dexNeedsTokenApprove) {
      return (
        <button
          className="btn-primary w-full text-center"
          onClick={handleDexApprove}
          disabled={isWritePending || isConfirming || !sellAmount || Number(sellAmount) <= 0}
        >
          {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : t('common.approve', { symbol: tokenSymbol })}
        </button>
      )
    }

    return (
      <button
        className="btn-danger w-full text-center"
        onClick={handleDexSell}
        disabled={isWritePending || isConfirming || !sellAmount || Number(sellAmount) <= 0}
      >
        {isWritePending ? t('common.confirmInWallet') : isConfirming ? t('create.confirming') : `${t('tokenDetail.sell')} ${tokenSymbol}`}
      </button>
    )
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
        style={{ backgroundColor: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}
      >
        <ArrowRightLeft className="w-4 h-4 text-neon-green" />
        <span className="text-xs text-neon-green font-medium">{t('tokenDetail.externalMarket')}</span>
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
            <p className="font-display font-bold text-lg">{formatTokenAmount(dexEstimatedTokens)} {tokenSymbol}</p>
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
          {isXyloRouter && needsDeposit && (
            <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-2">
              <p className="text-xs text-doge-gold">{t('tokenDetail.wrapHint')}</p>
            </div>
          )}
          {getBuyButton()}
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
            <p className="font-display font-bold text-lg">{dexEstimatedBnb > BigInt(0) ? formatUsdc(Number(formatEther(dexEstimatedBnb))) : '0'} {nativeSymbol}</p>
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
          {getSellButton()}
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
      {isConfirmed && !pendingWithdraw && (
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
