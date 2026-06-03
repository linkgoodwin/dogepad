import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { ethers } from 'ethers'
import { getContractAddress, getBscScanUrl, isZeroAddress } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { AlertCircle, ArrowRightLeft } from 'lucide-react'

const ERC20_ABI_FRAG = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]

const ROUTER_ABI_FRAG = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]

const WUSDC_ABI_FRAG = [
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

const BC_ABI_FRAG = [
  'function baseAsset() view returns (address)',
  'function isXyloRouter() view returns (bool)',
]

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
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState<string>('0')
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()
  const autoRunRef = useRef(false)

  const { writeContractAsync, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  // DEX config from ethers direct RPC (same pattern as PerpetualPage)
  const [wusdcAddress, setWusdcAddress] = useState<string>('')
  const [isXyloRouter, setIsXyloRouter] = useState(false)
  const [estimatedBuy, setEstimatedBuy] = useState<string>('0')
  const [estimatedSell, setEstimatedSell] = useState<string>('0')
  const [userTokenBal, setUserTokenBal] = useState<string>('0')
  const [userWusdcBal, setUserWusdcBal] = useState<string>('0')
  const [tokenAllow, setTokenAllow] = useState<string>('0')
  const [wusdcAllow, setWusdcAllow] = useState<string>('0')
  const [configError, setConfigError] = useState('')

  const dexRouter = getContractAddress(chainId, 'simpleRouter')
  const bondingCurveAddr = getContractAddress(chainId, 'bondingCurve')

  const getProvider = useCallback(() => {
    return new ethers.providers.JsonRpcProvider('https://rpc.testnet.arc.network')
  }, [])

  // Load DEX config once
  useEffect(() => {
    if (!bondingCurveAddr || isZeroAddress(bondingCurveAddr)) {
      setConfigError('BondingCurve address not configured')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const provider = getProvider()
        const bc = new ethers.Contract(bondingCurveAddr, BC_ABI_FRAG, provider)
        const [baseAsset, isXylo] = await Promise.all([
          bc.baseAsset(),
          bc.isXyloRouter(),
        ])
        if (!cancelled) {
          setWusdcAddress(baseAsset)
          setIsXyloRouter(isXylo)
          setConfigError('')
        }
      } catch (e: any) {
        if (!cancelled) setConfigError('Failed to load DEX config: ' + (e.message?.slice(0, 80) || 'unknown'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [bondingCurveAddr, getProvider])

  // Fetch buy quote
  useEffect(() => {
    if (!buyAmount || Number(buyAmount) <= 0 || !dexRouter || !wusdcAddress || isZeroAddress(dexRouter)) {
      setEstimatedBuy('0')
      return
    }
    let cancelled = false
    const fetch = async () => {
      try {
        const provider = getProvider()
        const router = new ethers.Contract(dexRouter, ROUTER_ABI_FRAG, provider)
        const amountIn = ethers.utils.parseUnits(buyAmount, 18)
        const amounts = await router.getAmountsOut(amountIn, [wusdcAddress, tokenAddress])
        if (!cancelled && amounts && amounts.length >= 2) {
          setEstimatedBuy(amounts[amounts.length - 1].toString())
        }
      } catch {
        if (!cancelled) setEstimatedBuy('0')
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [buyAmount, dexRouter, wusdcAddress, tokenAddress, getProvider])

  // Fetch sell quote
  useEffect(() => {
    if (!sellAmount || Number(sellAmount) <= 0 || !dexRouter || !wusdcAddress || isZeroAddress(dexRouter)) {
      setEstimatedSell('0')
      return
    }
    let cancelled = false
    const fetch = async () => {
      try {
        const provider = getProvider()
        const router = new ethers.Contract(dexRouter, ROUTER_ABI_FRAG, provider)
        const amountIn = ethers.utils.parseUnits(sellAmount, 18)
        const amounts = await router.getAmountsOut(amountIn, [tokenAddress, wusdcAddress])
        if (!cancelled && amounts && amounts.length >= 2) {
          setEstimatedSell(amounts[amounts.length - 1].toString())
        }
      } catch {
        if (!cancelled) setEstimatedSell('0')
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [sellAmount, dexRouter, wusdcAddress, tokenAddress, getProvider])

  // Fetch user balances and allowances
  useEffect(() => {
    if (!userAddress || !wusdcAddress) return
    let cancelled = false
    const fetch = async () => {
      try {
        const provider = getProvider()
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI_FRAG, provider)
        const wusdcContract = new ethers.Contract(wusdcAddress, WUSDC_ABI_FRAG, provider)

        const promises: Promise<any>[] = [
          tokenContract.balanceOf(userAddress),
        ]
        if (activeTab === 'sell' && dexRouter && !isZeroAddress(dexRouter)) {
          promises.push(tokenContract.allowance(userAddress, dexRouter))
        }
        if (activeTab === 'buy' && isXyloRouter && dexRouter && !isZeroAddress(dexRouter)) {
          promises.push(wusdcContract.balanceOf(userAddress))
          promises.push(wusdcContract.allowance(userAddress, dexRouter))
        }

        const results = await Promise.all(promises)
        if (!cancelled) {
          setUserTokenBal(results[0]?.toString() || '0')
          let idx = 1
          if (activeTab === 'sell' && dexRouter && !isZeroAddress(dexRouter)) {
            setTokenAllow(results[idx]?.toString() || '0')
            idx++
          }
          if (activeTab === 'buy' && isXyloRouter && dexRouter && !isZeroAddress(dexRouter)) {
            setUserWusdcBal(results[idx]?.toString() || '0')
            setWusdcAllow(results[idx + 1]?.toString() || '0')
          }
        }
      } catch {
        // silent
      }
    }
    fetch()
    const interval = setInterval(fetch, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [userAddress, wusdcAddress, tokenAddress, dexRouter, isXyloRouter, activeTab, getProvider])

  // Wagmi write helpers for contract writes (needs wallet)
  const ERC20_ABI = [
    { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  ] as const

  const WUSDC_ABI = [
    { inputs: [], name: 'deposit', outputs: [], stateMutability: 'payable', type: 'function' },
    { inputs: [{ internalType: 'uint256', name: 'wad', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  ] as const

  const ROUTER_ABI = [
    { inputs: [{ internalType: 'uint256', name: 'amountIn', type: 'uint256' }, { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' }, { internalType: 'address[]', name: 'path', type: 'address[]' }, { internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'deadline', type: 'uint256' }], name: 'swapExactTokensForTokens', outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }], stateMutability: 'nonpayable', type: 'function' },
  ] as const

  // Auto-run buy steps after tx confirmation
  useEffect(() => {
    if (!isConfirmed || !autoRunRef.current) return
    autoRunRef.current = false

    if (buyStep === 'depositing') {
      setBuyStep('approving-wusdc')
    } else if (buyStep === 'approving-wusdc') {
      setBuyStep('swapping')
    } else if (buyStep === 'swapping') {
      setBuyStep('idle')
    } else if (sellStep === 'approving-token') {
      setSellStep('swapping')
    } else if (sellStep === 'swapping') {
      if (isXyloRouter && estimatedSell !== '0') {
        setPendingWithdrawAmount(estimatedSell)
        setSellStep('withdrawing')
      } else {
        setSellStep('idle')
      }
    }
  }, [isConfirmed, buyStep, sellStep, isXyloRouter, estimatedSell])

  // WUSDC withdraw after sell
  useEffect(() => {
    if (!isConfirmed || sellStep !== 'withdrawing' || !wusdcAddress) return
    const amount = pendingWithdrawAmount
    setPendingWithdrawAmount('0')
    setSellStep('idle')
    writeContractAsync({
      address: wusdcAddress as `0x${string}`,
      abi: WUSDC_ABI,
      functionName: 'withdraw',
      args: [BigInt(amount)],
      chainId,
      gas: 1_000_000n,
    } as any).catch(() => {
      setTxError('WUSDC unwrap failed, please withdraw manually')
    })
  }, [isConfirmed, sellStep, pendingWithdrawAmount, wusdcAddress, writeContractAsync, chainId])

  // Execute buy steps
  useEffect(() => {
    if (buyStep === 'idle' || isWritePending || isConfirming) return
    const run = async () => {
      try {
        const amountIn = parseEther(buyAmount!)
        const estBuy = BigInt(estimatedBuy)
        const slippageBps = BigInt(Math.round((100 - slippage) * 100))
        const minOut = (estBuy * slippageBps) / BigInt(10000)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

        if (buyStep === 'depositing' && isXyloRouter && wusdcAddress) {
          const currentWusdc = BigInt(userWusdcBal)
          const depositAmt = amountIn > currentWusdc ? amountIn - currentWusdc : BigInt(0)
          if (depositAmt > BigInt(0)) {
            autoRunRef.current = true
            await writeContractAsync({
              address: wusdcAddress as `0x${string}`,
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
          const currentAllowance = BigInt(wusdcAllow)
          if (currentAllowance < amountIn) {
            autoRunRef.current = true
            await writeContractAsync({
              address: wusdcAddress as `0x${string}`,
              abi: WUSDC_ABI,
              functionName: 'approve',
              args: [dexRouter! as `0x${string}`, amountIn],
              chainId,
              gas: 1_000_000n,
            } as any)
          } else {
            setBuyStep('swapping')
          }
        } else if (buyStep === 'swapping' && dexRouter) {
          autoRunRef.current = true
          await writeContractAsync({
            address: dexRouter! as `0x${string}`,
            abi: ROUTER_ABI,
            functionName: 'swapExactTokensForTokens',
            args: [amountIn, minOut, [wusdcAddress as `0x${string}`, tokenAddress], userAddress!, deadline],
            chainId,
            gas: 5_000_000n,
          } as any)
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
  }, [buyStep, isWritePending, isConfirming])

  // Execute sell steps
  useEffect(() => {
    if (sellStep === 'idle' || isWritePending || isConfirming) return
    const run = async () => {
      try {
        const amountIn = parseEther(sellAmount!)
        const estSell = BigInt(estimatedSell)
        const slippageBps = BigInt(Math.round((100 - slippage) * 100))
        const minOut = (estSell * slippageBps) / BigInt(10000)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

        if (sellStep === 'approving-token') {
          autoRunRef.current = true
          await writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [dexRouter! as `0x${string}`, amountIn],
            chainId,
            gas: 1_000_000n,
          } as any)
        } else if (sellStep === 'swapping' && dexRouter) {
          autoRunRef.current = true
          await writeContractAsync({
            address: dexRouter! as `0x${string}`,
            abi: ROUTER_ABI,
            functionName: 'swapExactTokensForTokens',
            args: [amountIn, minOut, [tokenAddress, wusdcAddress as `0x${string}`], userAddress!, deadline],
            chainId,
            gas: 5_000_000n,
          } as any)
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
  }, [sellStep, isWritePending, isConfirming])

  const handleBuy = useCallback(() => {
    setTxError('')
    resetWrite()
    if (!buyAmount || !dexRouter || !wusdcAddress || estimatedBuy === '0') return

    const amountIn = parseEther(buyAmount)
    if (isXyloRouter) {
      const currentWusdc = BigInt(userWusdcBal)
      if (currentWusdc < amountIn) {
        setBuyStep('depositing')
      } else {
        const currentAllowance = BigInt(wusdcAllow)
        if (currentAllowance < amountIn) {
          setBuyStep('approving-wusdc')
        } else {
          setBuyStep('swapping')
        }
      }
    } else {
      setBuyStep('swapping')
    }
  }, [buyAmount, dexRouter, wusdcAddress, estimatedBuy, isXyloRouter, userWusdcBal, wusdcAllow, resetWrite])

  const handleSell = useCallback(() => {
    setTxError('')
    resetWrite()
    if (!sellAmount || !dexRouter || !wusdcAddress || estimatedSell === '0') return

    const amountIn = parseEther(sellAmount)
    const currentAllowance = BigInt(tokenAllow)
    if (currentAllowance < amountIn) {
      setSellStep('approving-token')
    } else {
      setSellStep('swapping')
    }
  }, [sellAmount, dexRouter, wusdcAddress, estimatedSell, tokenAllow, resetWrite])

  const isBusy = isWritePending || isConfirming || buyStep !== 'idle' || sellStep !== 'idle'

  const getStepLabel = () => {
    if (buyStep === 'depositing') return t('tokenDetail.buyStep1')
    if (buyStep === 'approving-wusdc') return t('tokenDetail.buyStep2')
    if (sellStep === 'approving-token') return t('tokenDetail.sellStep1')
    if (sellStep === 'withdrawing') return t('tokenDetail.sellStep2')
    return undefined
  }

  const formatTokenAmount = (val: string) => {
    const num = Number(ethers.utils.formatEther(val))
    if (num === 0) return '0'
    if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (num >= 0.001) return num.toFixed(4)
    return num.toExponential(2)
  }

  const configReady = !!dexRouter && !!wusdcAddress && !isZeroAddress(dexRouter) && wusdcAddress !== '' && wusdcAddress !== ethers.constants.AddressZero

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

      {configError ? (
        <div className="bg-dark-700 rounded-lg p-4 text-center">
          <p className="text-xs text-neon-red">{configError}</p>
        </div>
      ) : !configReady ? (
        <div className="bg-dark-700 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-400">Loading DEX config...</p>
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
              {estimatedBuy !== '0' ? `${formatTokenAmount(estimatedBuy)} ${tokenSymbol}` : `0 ${tokenSymbol}`}
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
              {userTokenBal !== '0' && (
                <button
                  className="text-xs text-neon-green hover:underline"
                  onClick={() => setSellAmount(formatEther(BigInt(userTokenBal)))}
                >
                  Max: {formatTokenAmount(userTokenBal)}
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
              {estimatedSell !== '0' ? `${formatUsdc(Number(ethers.utils.formatEther(estimatedSell)))} ${nativeSymbol}` : `0 ${nativeSymbol}`}
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
