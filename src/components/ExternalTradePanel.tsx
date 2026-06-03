import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { ethers } from 'ethers'
import { getContractAddress, getBscScanUrl, isZeroAddress } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { AlertCircle, ArrowRightLeft } from 'lucide-react'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]

const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]

const WUSDC_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

const BC_ABI = [
  'function baseAsset() view returns (address)',
  'function isXyloRouter() view returns (bool)',
]

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
  const [txStatus, setTxStatus] = useState<string>('')
  const [txError, setTxError] = useState('')
  const [txSuccess, setTxSuccess] = useState(false)
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()

  // All state from ethers direct RPC
  const [wusdcAddress, setWusdcAddress] = useState<string>('')
  const [isXyloRouter, setIsXyloRouter] = useState(false)
  const [estimatedBuy, setEstimatedBuy] = useState<string>('0')
  const [estimatedSell, setEstimatedSell] = useState<string>('0')
  const [userTokenBal, setUserTokenBal] = useState<string>('0')
  const [userWusdcBal, setUserWusdcBal] = useState<string>('0')
  const [tokenAllow, setTokenAllow] = useState<string>('0')
  const [wusdcAllow, setWusdcAllow] = useState<string>('0')
  const [configError, setConfigError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const dexRouter = getContractAddress(chainId, 'simpleRouter')
  const bondingCurveAddr = getContractAddress(chainId, 'bondingCurve')

  const getProvider = useCallback(() => {
    return new ethers.providers.JsonRpcProvider('https://rpc.testnet.arc.network')
  }, [])

  const getSigner = useCallback(async () => {
    if (typeof (window as any).ethereum === 'undefined') return null
    const browserProvider = new ethers.providers.Web3Provider((window as any).ethereum)
    await browserProvider.send('eth_requestAccounts', [])
    return browserProvider.getSigner()
  }, [])

  // Load DEX config
  useEffect(() => {
    if (!bondingCurveAddr || isZeroAddress(bondingCurveAddr)) {
      setConfigError('BondingCurve address not configured')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const provider = getProvider()
        const bc = new ethers.Contract(bondingCurveAddr, BC_ABI, provider)
        const [baseAsset, isXylo] = await Promise.all([bc.baseAsset(), bc.isXyloRouter()])
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
        const router = new ethers.Contract(dexRouter, ROUTER_ABI, provider)
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
        const router = new ethers.Contract(dexRouter, ROUTER_ABI, provider)
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
  const refreshBalances = useCallback(async () => {
    if (!userAddress || !wusdcAddress) return
    try {
      const provider = getProvider()
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
      const wusdcContract = new ethers.Contract(wusdcAddress, WUSDC_ABI, provider)

      const balPromises: Promise<any>[] = [tokenContract.balanceOf(userAddress)]
      if (dexRouter && !isZeroAddress(dexRouter)) {
        balPromises.push(tokenContract.allowance(userAddress, dexRouter))
        if (isXyloRouter) {
          balPromises.push(wusdcContract.balanceOf(userAddress))
          balPromises.push(wusdcContract.allowance(userAddress, dexRouter))
        }
      }

      const results = await Promise.all(balPromises)
      setUserTokenBal(results[0]?.toString() || '0')
      let idx = 1
      if (dexRouter && !isZeroAddress(dexRouter)) {
        setTokenAllow(results[idx]?.toString() || '0')
        idx++
        if (isXyloRouter) {
          setUserWusdcBal(results[idx]?.toString() || '0')
          setWusdcAllow(results[idx + 1]?.toString() || '0')
        }
      }
    } catch {
      // silent
    }
  }, [userAddress, wusdcAddress, tokenAddress, dexRouter, isXyloRouter, getProvider])

  useEffect(() => {
    refreshBalances()
    const interval = setInterval(refreshBalances, 15000)
    return () => clearInterval(interval)
  }, [refreshBalances])

  // Buy handler — all via ethers.js signer (same as PerpetualPage)
  const handleBuy = useCallback(async () => {
    if (!buyAmount || !dexRouter || !wusdcAddress || estimatedBuy === '0' || !userAddress) return
    setIsBusy(true)
    setTxError('')
    setTxSuccess(false)

    try {
      const signer = await getSigner()
      if (!signer) { setIsBusy(false); return }

      const amountIn = ethers.utils.parseUnits(buyAmount, 18)
      const estBuy = ethers.BigNumber.from(estimatedBuy)
      const slippageBps = Math.round((100 - slippage) * 100)
      const minOut = estBuy.mul(slippageBps).div(10000)
      const deadline = Math.floor(Date.now() / 1000) + 300

      // Step 1: Deposit ARC to WUSDC if needed
      if (isXyloRouter) {
        const wusdcContract = new ethers.Contract(wusdcAddress, WUSDC_ABI, signer)
        const currentWusdc = await wusdcContract.balanceOf(userAddress)
        if (currentWusdc.lt(amountIn)) {
          const depositAmt = amountIn.sub(currentWusdc)
          setTxStatus('Depositing ' + nativeSymbol + ' to WUSDC...')
          const depositTx = await wusdcContract.deposit({ value: depositAmt, gasLimit: 500_000 })
          await depositTx.wait()
        }

        // Step 2: Approve WUSDC if needed
        const currentAllowance = await wusdcContract.allowance(userAddress, dexRouter)
        if (currentAllowance.lt(amountIn)) {
          setTxStatus('Approving WUSDC...')
          const approveTx = await wusdcContract.approve(dexRouter, amountIn, { gasLimit: 500_000 })
          await approveTx.wait()
        }
      }

      // Step 3: Swap
      setTxStatus('Swapping...')
      const routerContract = new ethers.Contract(dexRouter, ROUTER_ABI, signer)
      const swapTx = await routerContract.swapExactTokensForTokens(
        amountIn, minOut, [wusdcAddress, tokenAddress], userAddress, deadline,
        { gasLimit: 5_000_000 }
      )
      await swapTx.wait()

      setTxSuccess(true)
      setTxStatus('')
      refreshBalances()
      onTxConfirmed?.()
    } catch (err: any) {
      const msg = err.reason || err.data?.message || err.message || ''
      if (!msg.includes('User denied') && !msg.includes('user rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 200 ? msg.slice(0, 200) + '...' : msg)
      }
      setTxStatus('')
    } finally {
      setIsBusy(false)
    }
  }, [buyAmount, dexRouter, wusdcAddress, estimatedBuy, userAddress, isXyloRouter, slippage, nativeSymbol, getSigner, refreshBalances, onTxConfirmed])

  // Sell handler — all via ethers.js signer
  const handleSell = useCallback(async () => {
    if (!sellAmount || !dexRouter || !wusdcAddress || estimatedSell === '0' || !userAddress) return
    setIsBusy(true)
    setTxError('')
    setTxSuccess(false)

    try {
      const signer = await getSigner()
      if (!signer) { setIsBusy(false); return }

      const amountIn = ethers.utils.parseUnits(sellAmount, 18)
      const estSell = ethers.BigNumber.from(estimatedSell)
      const slippageBps = Math.round((100 - slippage) * 100)
      const minOut = estSell.mul(slippageBps).div(10000)
      const deadline = Math.floor(Date.now() / 1000) + 300

      // Step 1: Approve token if needed
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer)
      const currentAllowance = await tokenContract.allowance(userAddress, dexRouter)
      if (currentAllowance.lt(amountIn)) {
        setTxStatus('Approving ' + tokenSymbol + '...')
        const approveTx = await tokenContract.approve(dexRouter, amountIn, { gasLimit: 500_000 })
        await approveTx.wait()
      }

      // Step 2: Swap
      setTxStatus('Swapping...')
      const routerContract = new ethers.Contract(dexRouter, ROUTER_ABI, signer)
      const swapTx = await routerContract.swapExactTokensForTokens(
        amountIn, minOut, [tokenAddress, wusdcAddress], userAddress, deadline,
        { gasLimit: 5_000_000 }
      )
      await swapTx.wait()

      // Step 3: Withdraw WUSDC to ARC if needed
      if (isXyloRouter) {
        try {
          const wusdcContract = new ethers.Contract(wusdcAddress, WUSDC_ABI, signer)
          const wusdcBal = await wusdcContract.balanceOf(userAddress)
          if (wusdcBal.gt(0)) {
            setTxStatus('Withdrawing WUSDC to ' + nativeSymbol + '...')
            const withdrawTx = await wusdcContract.withdraw(wusdcBal, { gasLimit: 500_000 })
            await withdrawTx.wait()
          }
        } catch {
          // Withdrawal failure is not critical
        }
      }

      setTxSuccess(true)
      setTxStatus('')
      refreshBalances()
      onTxConfirmed?.()
    } catch (err: any) {
      const msg = err.reason || err.data?.message || err.message || ''
      if (!msg.includes('User denied') && !msg.includes('user rejected') && !msg.includes('denied')) {
        setTxError(msg.length > 200 ? msg.slice(0, 200) + '...' : msg)
      }
      setTxStatus('')
    } finally {
      setIsBusy(false)
    }
  }, [sellAmount, dexRouter, wusdcAddress, estimatedSell, userAddress, isXyloRouter, slippage, tokenSymbol, nativeSymbol, getSigner, refreshBalances, onTxConfirmed])

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
          onClick={() => { setActiveTab('buy'); setTxError(''); setTxSuccess(false) }}
        >
          {t('tokenDetail.buy')}
        </button>
        <button
          className={cn(
            'flex-1 py-2 rounded-md text-sm font-display font-semibold transition-all',
            activeTab === 'sell' ? 'bg-neon-red text-white' : 'text-gray-400 hover:text-white'
          )}
          onClick={() => { setActiveTab('sell'); setTxError(''); setTxSuccess(false) }}
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
              {isBusy ? (txStatus || 'Processing...') : `${t('tokenDetail.buy')} ${tokenSymbol}`}
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
              {isBusy ? (txStatus || 'Processing...') : `${t('tokenDetail.sell')} ${tokenSymbol}`}
            </button>
          )}
        </div>
      )}

      {txError && (
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3 mt-4">
          <p className="text-xs text-neon-red">{txError}</p>
        </div>
      )}

      {txSuccess && (
        <div className="mt-3 flex items-start gap-2 text-neon-green text-xs bg-neon-green/10 rounded-lg p-2">
          <span>{t('common.transactionConfirmed')}</span>
        </div>
      )}
    </div>
  )
}
