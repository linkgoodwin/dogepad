import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { formatEther, parseEther } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { getContractAddress, getBscScanUrl, isZeroAddress } from '@/config/contracts'
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

type BuyStep = 'idle' | 'depositing' | 'approving-wusdc' | 'swapping'
type SellStep = 'idle' | 'approving-token' | 'swapping' | 'withdrawing'

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
  chainId,
  onTxConfirmed,
}: ExternalTradePanelProps) {
  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txError, setTxError] = useState('')
  const [buyStep, setBuyStep] = useState<BuyStep>('idle')
  const [sellStep, setSellStep] = useState<SellStep>('idle')
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState<bigint>(BigInt(0))
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()
  const autoRunRef = useRef(false)

  const { writeContractAsync, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  // Use known addresses from config instead of reading from BondingCurve
  const dexRouter = getContractAddress(chainId, 'simpleRouter') as `0x${string}` | undefined
  const baseAsset = getContractAddress(chainId, 'simpleFactory') ? (() => {
    // For Arc testnet, baseAsset is WUSDC. Read from BondingCurve or use known address.
    // We know for Arc testnet the baseAsset is WUSDC at 0x911b4000D3422F482F4062a913885f7b035382Df
    // But let's try to read it from the config or derive it
    return undefined as `0x${string}` | undefined
  })() : undefined

  // Read baseAsset from BondingCurve (single call, not the whole chain)
  const bondingCurveAddress = getContractAddress(chainId, 'bondingCurve') as `0x${string}` | undefined
  const BC_ABI_FRAGMENT = [
    { inputs: [], name: 'baseAsset', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'isXyloRouter', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  ] as const

  const { data: baseAssetData } = useReadContract({
    address: bondingCurveAddress,
    abi: BC_ABI_FRAGMENT,
    functionName: 'baseAsset',
    chainId,
    query: { enabled: !!bondingCurveAddress && !isZeroAddress(bondingCurveAddress) },
  })

  const { data: isXyloRouterData } = useReadContract({
    address: bondingCurveAddress,
    abi: BC_ABI_FRAGMENT,
    functionName: 'isXyloRouter',
    chainId,
    query: { enabled: !!bondingCurveAddress && !isZeroAddress(bondingCurveAddress) },
  })

  const wusdcAddress = (baseAssetData ?? baseAsset) as `0x${string}` | undefined
  const isXyloRouter = Boolean(isXyloRouterData)

  const dexBuyPath = useMemo(() => {
    if (!wusdcAddress || !tokenAddress) return undefined
    return [wusdcAddress, tokenAddress] as `0x${string}`[]
  }, [wusdcAddress, tokenAddress])

  const dexSellPath = useMemo(() => {
    if (!wusdcAddress || !tokenAddress) return undefined
    return [tokenAddress, wusdcAddress] as `0x${string}`[]
  }, [wusdcAddress, tokenAddress])

  const dexBuyAmountIn = useMemo(() => {
    if (!buyAmount || Number(buyAmount) <= 0) return BigInt(0)
    try { return parseEther(buyAmount) } catch { return BigInt(0) }
  }, [buyAmount])

  const dexSellAmountIn = useMemo(() => {
    if (!sellAmount || Number(sellAmount) <= 0) return BigInt(0)
    try { return parseEther(sellAmount) } catch { return BigInt(0) }
  }, [sellAmount])

  // Use getAmountsOut from Router for accurate quotes (handles tax internally)
  const { data: buyAmountsOut } = useReadContract({
    address: dexRouter,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: dexBuyAmountIn > BigInt(0) && dexBuyPath ? [dexBuyAmountIn, dexBuyPath] : undefined,
    chainId,
    query: { enabled: !!dexRouter && dexBuyAmountIn > BigInt(0) && !!dexBuyPath },
  })

  const { data: sellAmountsOut } = useReadContract({
    address: dexRouter,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: dexSellAmountIn > BigInt(0) && dexSellPath ? [dexSellAmountIn, dexSellPath] : undefined,
    chainId,
    query: { enabled: !!dexRouter && dexSellAmountIn > BigInt(0) && !!dexSellPath },
  })

  const dexEstimatedTokens = useMemo(() => {
    if (!buyAmountsOut) return BigInt(0)
    const amounts = buyAmountsOut as bigint[]
    return amounts.length >= 2 ? amounts[amounts.length - 1] : BigInt(0)
  }, [buyAmountsOut])

  const dexEstimatedUsdc = useMemo(() => {
    if (!sellAmountsOut) return BigInt(0)
    const amounts = sellAmountsOut as bigint[]
    return amounts.length >= 2 ? amounts[amounts.length - 1] : BigInt(0)
  }, [sellAmountsOut])

  const { data: userTokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: !!userAddress },
  })

  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress && dexRouter ? [userAddress, dexRouter] : undefined,
    chainId,
    query: { enabled: !!userAddress && !!dexRouter && activeTab === 'sell' },
  })

  const { data: wusdcBalance, refetch: refetchWusdcBalance } = useReadContract({
    address: wusdcAddress,
    abi: WUSDC_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: { enabled: isXyloRouter && !!wusdcAddress && !!userAddress && activeTab === 'buy' },
  })

  const { data: wusdcAllowance, refetch: refetchWusdcAllowance } = useReadContract({
    address: wusdcAddress,
    abi: WUSDC_ABI,
    functionName: 'allowance',
    args: userAddress && dexRouter ? [userAddress, dexRouter] : undefined,
    chainId,
    query: { enabled: isXyloRouter && !!wusdcAddress && !!dexRouter && !!userAddress && activeTab === 'buy' },
  })

  useEffect(() => {
    if (isConfirmed) {
      refetchBalance()
      refetchTokenAllowance()
      refetchWusdcBalance()
      refetchWusdcAllowance()
      onTxConfirmed?.()
    }
  }, [isConfirmed, refetchBalance, refetchTokenAllowance, refetchWusdcBalance, refetchWusdcAllowance, onTxConfirmed])

  useEffect(() => {
    if (!isConfirmed || !isXyloRouter || !wusdcAddress) return
    if (sellStep === 'swapping' && pendingWithdrawAmount > BigInt(0)) {
      const amount = pendingWithdrawAmount
      setPendingWithdrawAmount(BigInt(0))
      setSellStep('withdrawing')
      writeContractAsync({
        address: wusdcAddress,
        abi: WUSDC_ABI,
        functionName: 'withdraw',
        args: [amount],
        chainId,
        gas: 1_000_000n,
      } as any).catch(() => {
        setTxError('WUSDC unwrap failed, please withdraw manually')
      }).finally(() => {
        setSellStep('idle')
      })
    }
  }, [isConfirmed, sellStep, pendingWithdrawAmount, isXyloRouter, wusdcAddress, writeContractAsync, chainId])

  useEffect(() => {
    if (!isConfirmed || !autoRunRef.current) return
    autoRunRef.current = false

    if (buyStep === 'depositing') {
      refetchWusdcBalance().then(() => {
        setBuyStep('approving-wusdc')
      })
    } else if (buyStep === 'approving-wusdc') {
      refetchWusdcAllowance().then(() => {
        setBuyStep('swapping')
      })
    } else if (buyStep === 'swapping') {
      setBuyStep('idle')
    } else if (sellStep === 'approving-token') {
      refetchTokenAllowance().then(() => {
        setSellStep('swapping')
      })
    } else if (sellStep === 'swapping') {
      if (isXyloRouter && dexEstimatedUsdc > BigInt(0)) {
        setPendingWithdrawAmount(dexEstimatedUsdc)
      } else {
        setSellStep('idle')
      }
    }
  }, [isConfirmed, buyStep, sellStep, isXyloRouter, dexEstimatedUsdc, refetchWusdcBalance, refetchWusdcAllowance, refetchTokenAllowance])

  useEffect(() => {
    if (buyStep === 'idle' || isWritePending || isConfirming) return

    const run = async () => {
      try {
        const amountIn = parseEther(buyAmount!)
        const slippageBps = BigInt(Math.round((100 - slippage) * 100))
        const minOut = (dexEstimatedTokens * slippageBps) / BigInt(10000)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

        if (buyStep === 'depositing' && isXyloRouter && wusdcAddress) {
          const currentWusdc = (wusdcBalance as bigint) ?? BigInt(0)
          const depositAmt = amountIn > currentWusdc ? amountIn - currentWusdc : BigInt(0)
          if (depositAmt > BigInt(0)) {
            autoRunRef.current = true
            await writeContractAsync({
              address: wusdcAddress,
              abi: WUSDC_ABI,
              functionName: 'deposit',
              args: [],
              value: depositAmt,
              chainId,
              gas: 1_000_000n,
            } as any)
          } else {
            setBuyStep('approving-wusdc')
          }
        } else if (buyStep === 'approving-wusdc' && isXyloRouter && wusdcAddress) {
          const currentAllowance = (wusdcAllowance as bigint) ?? BigInt(0)
          if (currentAllowance < amountIn) {
            autoRunRef.current = true
            await writeContractAsync({
              address: wusdcAddress,
              abi: WUSDC_ABI,
              functionName: 'approve',
              args: [dexRouter!, amountIn],
              chainId,
              gas: 1_000_000n,
            } as any)
          } else {
            setBuyStep('swapping')
          }
        } else if (buyStep === 'swapping') {
          autoRunRef.current = true
          if (isXyloRouter) {
            await writeContractAsync({
              address: dexRouter!,
              abi: ROUTER_ABI,
              functionName: 'swapExactTokensForTokens',
              args: [amountIn, minOut, dexBuyPath!, userAddress!, deadline],
              chainId,
              gas: 5_000_000n,
            } as any)
          } else {
            await writeContractAsync({
              address: dexRouter!,
              abi: ROUTER_ABI,
              functionName: 'swapExactETHForTokens',
              args: [minOut, dexBuyPath!, userAddress!, deadline],
              value: amountIn,
              chainId,
              gas: 5_000_000n,
            } as any)
          }
        }
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
        setBuyStep('idle')
        autoRunRef.current = false
      }
    }

    run()
  }, [buyStep, isXyloRouter, isWritePending, isConfirming])

  useEffect(() => {
    if (sellStep === 'idle' || isWritePending || isConfirming) return

    const run = async () => {
      try {
        const amountIn = parseEther(sellAmount!)
        const slippageBps = BigInt(Math.round((100 - slippage) * 100))
        const minOut = (dexEstimatedUsdc * slippageBps) / BigInt(10000)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

        if (sellStep === 'approving-token') {
          autoRunRef.current = true
          await writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [dexRouter!, amountIn],
            chainId,
            gas: 1_000_000n,
          } as any)
        } else if (sellStep === 'swapping') {
          autoRunRef.current = true
          if (isXyloRouter) {
            await writeContractAsync({
              address: dexRouter!,
              abi: ROUTER_ABI,
              functionName: 'swapExactTokensForTokens',
              args: [amountIn, minOut, dexSellPath!, userAddress!, deadline],
              chainId,
              gas: 5_000_000n,
            } as any)
          } else {
            await writeContractAsync({
              address: dexRouter!,
              abi: ROUTER_ABI,
              functionName: 'swapExactTokensForETH',
              args: [amountIn, minOut, dexSellPath!, userAddress!, deadline],
              chainId,
              gas: 5_000_000n,
            } as any)
          }
        }
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || ''
        if (!msg.includes('User rejected') && !msg.includes('denied')) {
          setTxError(msg.length > 150 ? msg.slice(0, 150) + '...' : msg)
        }
        setSellStep('idle')
        autoRunRef.current = false
      }
    }

    run()
  }, [sellStep, isXyloRouter, isWritePending, isConfirming])

  const handleBuy = useCallback(() => {
    setTxError('')
    resetWrite()
    if (!buyAmount || !tokenAddress || !dexRouter || !dexBuyPath || dexEstimatedTokens === BigInt(0)) return

    if (isXyloRouter) {
      const amountIn = parseEther(buyAmount)
      const currentWusdc = (wusdcBalance as bigint) ?? BigInt(0)
      if (currentWusdc < amountIn) {
        setBuyStep('depositing')
      } else {
        const currentAllowance = (wusdcAllowance as bigint) ?? BigInt(0)
        if (currentAllowance < amountIn) {
          setBuyStep('approving-wusdc')
        } else {
          setBuyStep('swapping')
        }
      }
    } else {
      setBuyStep('swapping')
    }
  }, [buyAmount, tokenAddress, dexRouter, dexBuyPath, dexEstimatedTokens, isXyloRouter, wusdcBalance, wusdcAllowance, resetWrite])

  const handleSell = useCallback(() => {
    setTxError('')
    resetWrite()
    if (!sellAmount || !tokenAddress || !dexRouter || !dexSellPath || dexEstimatedUsdc === BigInt(0)) return

    const amountIn = parseEther(sellAmount)
    const currentAllowance = (tokenAllowance as bigint) ?? BigInt(0)
    if (currentAllowance < amountIn) {
      setSellStep('approving-token')
    } else {
      setSellStep('swapping')
    }
  }, [sellAmount, tokenAddress, dexRouter, dexSellPath, dexEstimatedUsdc, tokenAllowance, resetWrite])

  const isBusy = isWritePending || isConfirming || buyStep !== 'idle' || sellStep !== 'idle'

  const getStepLabel = () => {
    if (buyStep === 'depositing') return t('tokenDetail.buyStep1')
    if (buyStep === 'approving-wusdc') return t('tokenDetail.buyStep2')
    if (sellStep === 'approving-token') return t('tokenDetail.sellStep1')
    if (sellStep === 'withdrawing') return t('tokenDetail.sellStep2')
    return undefined
  }

  const formatTokenAmount = (val: bigint) => {
    const num = Number(formatEther(val))
    if (num === 0) return '0'
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (num >= 0.001) return num.toFixed(4)
    return num.toExponential(2)
  }

  const configReady = !!dexRouter && !!wusdcAddress && !isZeroAddress(dexRouter) && !isZeroAddress(wusdcAddress)

  return (
    <div className="card-dark">
      <div className="flex mb-4 bg-dark-700 rounded-lg p-1">
        <button
          className={cn(
            'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all',
            activeTab === 'buy' ? 'bg-neon-green text-dark-900' : 'text-gray-400 hover:text-white'
          )}
          onClick={() => { setActiveTab('buy'); setBuyStep('idle'); setSellStep('idle') }}
        >
          {t('tokenDetail.buy')}
        </button>
        <button
          className={cn(
            'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all',
            activeTab === 'sell' ? 'bg-neon-red text-white' : 'text-gray-400 hover:text-white'
          )}
          onClick={() => { setActiveTab('sell'); setBuyStep('idle'); setSellStep('idle') }}
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

      {!configReady ? (
        <div className="bg-dark-700 rounded-lg p-4 text-center">
          <p className="text-xs text-neon-red">DEX config not available for this chain. Please check network connection.</p>
        </div>
      ) : activeTab === 'buy' ? (
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
            <p className="font-display font-bold text-lg">
              {dexEstimatedTokens > BigInt(0) ? `${formatTokenAmount(dexEstimatedTokens)} ${tokenSymbol}` : `0 ${tokenSymbol}`}
            </p>
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
              disabled={isBusy || !buyAmount || Number(buyAmount) <= 0}
            >
              {isBusy
                ? (isWritePending ? t('common.confirmInWallet') : getStepLabel() || t('create.confirming'))
                : `${t('tokenDetail.buy')} ${tokenSymbol}`}
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
            <p className="font-display font-bold text-lg">
              {dexEstimatedUsdc > BigInt(0) ? `${formatUsdc(Number(formatEther(dexEstimatedUsdc)))} ${nativeSymbol}` : `0 ${nativeSymbol}`}
            </p>
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
          ) : (
            <button
              className="btn-danger w-full text-center"
              onClick={handleSell}
              disabled={isBusy || !sellAmount || Number(sellAmount) <= 0}
            >
              {isBusy
                ? (isWritePending ? t('common.confirmInWallet') : getStepLabel() || t('create.confirming'))
                : `${t('tokenDetail.sell')} ${tokenSymbol}`}
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
      {isConfirmed && buyStep === 'idle' && sellStep === 'idle' && (
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
