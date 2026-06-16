import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { getContractAddress, getBscScanUrl, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { ArrowRightLeft, AlertCircle, CheckCircle } from 'lucide-react'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
] as const

const ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
] as const

const USDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
] as const

const BC_ABI = [
  'function baseAsset() view returns (address)',
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
  const t = useT()
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txStatus, setTxStatus] = useState<string>('')
  const [txError, setTxError] = useState('')
  const [txSuccess, setTxSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  // State from wagmi
  const [estimatedBuy, setEstimatedBuy] = useState<string>('0')
  const [estimatedSell, setEstimatedSell] = useState<string>('0')
  const [userTokenBal, setUserTokenBal] = useState<string>('0')
  const [userUsdcBal, setUserUsdcBal] = useState<string>('0')
  const [tokenAllowance, setTokenAllowance] = useState<string>('0')
  const [usdcAllowance, setUsdcAllowance] = useState<string>('0')
  const [configError, setConfigError] = useState('')

  // Get contract addresses from config
  const routerAddress = getContractAddress(chainId, 'simpleRouter')
  const factoryAddress = getContractAddress(chainId, 'simpleFactory')
  const usdcAddress = getContractAddress(chainId, 'wusdc') || getContractAddress(chainId, 'baseAsset')

  // Check if addresses are configured
  useEffect(() => {
    if (isZeroAddress(routerAddress as `0x${string}`) || isZeroAddress(factoryAddress as `0x${string}`)) {
      setConfigError(t('externalTrade.configError') || 'DEX not configured for this network')
    } else {
      setConfigError('')
    }
  }, [routerAddress, factoryAddress, t])

  // Fetch user balances
  useEffect(() => {
    if (!publicClient || !userAddress || !isConnected) return

    const fetchBalances = async () => {
      try {
        // Get USDC balance
        const usdcBal = await publicClient.readContract({
          address: usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        })
        setUserUsdcBal(formatEther(usdcBal as bigint))

        // Get token balance
        const tokenBal = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        })
        setUserTokenBal(formatEther(tokenBal as bigint))

        // Get USDC allowance for router
        const usdcAllow = await publicClient.readContract({
          address: usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'allowance',
          args: [userAddress, routerAddress as `0x${string}`],
        })
        setUsdcAllowance(formatEther(usdcAllow as bigint))

        // Get token allowance for router
        const tokenAllow = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [userAddress, routerAddress as `0x${string}`],
        })
        setTokenAllowance(formatEther(tokenAllow as bigint))
      } catch (err) {
        console.error('Error fetching balances:', err)
      }
    }

    fetchBalances()
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [publicClient, userAddress, isConnected, tokenAddress, usdcAddress, routerAddress])

  // Fetch price estimates
  const fetchEstimate = useCallback(async () => {
    if (!publicClient || !buyAmount || parseFloat(buyAmount) === 0) {
      setEstimatedBuy('0')
      return
    }

    try {
      const amountIn = parseEther(buyAmount)
      const amounts = await publicClient.readContract({
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, [usdcAddress, tokenAddress] as any],
      })
      const amountOut = (amounts as bigint[])[1]
      setEstimatedBuy(formatEther(amountOut))
    } catch (err) {
      console.error('Error fetching buy estimate:', err)
      setEstimatedBuy('0')
    }
  }, [publicClient, buyAmount, routerAddress, usdcAddress, tokenAddress])

  const fetchSellEstimate = useCallback(async () => {
    if (!publicClient || !sellAmount || parseFloat(sellAmount) === 0) {
      setEstimatedSell('0')
      return
    }

    try {
      const amountIn = parseEther(sellAmount)
      const amounts = await publicClient.readContract({
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, [tokenAddress, usdcAddress] as any],
      })
      const amountOut = (amounts as bigint[])[1]
      setEstimatedSell(formatEther(amountOut))
    } catch (err) {
      console.error('Error fetching sell estimate:', err)
      setEstimatedSell('0')
    }
  }, [publicClient, sellAmount, routerAddress, tokenAddress, usdcAddress])

  useEffect(() => {
    if (activeTab === 'buy') fetchEstimate()
    else fetchSellEstimate()
  }, [activeTab, fetchEstimate, fetchSellEstimate])

  // Approve USDC
  const handleApproveUsdc = async () => {
    if (!publicClient || !userAddress) return
    setLoading(true)
    setTxError('')
    try {
      const hash = await publicClient.writeContract({
        account: userAddress,
        address: usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [routerAddress as `0x${string}`, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
      })
      setTxStatus(t('externalTrade.approving') || 'Approving...')
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStatus('')
      // Refresh allowance
      const allow = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [userAddress, routerAddress as `0x${string}`],
      })
      setUsdcAllowance(formatEther(allow as bigint))
    } catch (err: any) {
      setTxError(err.message || 'Approval failed')
    }
    setLoading(false)
  }

  // Approve Token
  const handleApproveToken = async () => {
    if (!publicClient || !userAddress) return
    setLoading(true)
    setTxError('')
    try {
      const hash = await publicClient.writeContract({
        account: userAddress,
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress as `0x${string}`, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
      })
      setTxStatus(t('externalTrade.approving') || 'Approving...')
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStatus('')
      // Refresh allowance
      const allow = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [userAddress, routerAddress as `0x${string}`],
      })
      setTokenAllowance(formatEther(allow as bigint))
    } catch (err: any) {
      setTxError(err.message || 'Approval failed')
    }
    setLoading(false)
  }

  // Buy tokens with USDC
  const handleBuy = async () => {
    if (!publicClient || !userAddress || !buyAmount || parseFloat(buyAmount) === 0) return
    setLoading(true)
    setTxError('')
    setTxSuccess(false)

    try {
      const amountIn = parseEther(buyAmount)
      const minOut = parseEther((parseFloat(estimatedBuy) * (1 - slippage / 100)).toFixed(18))
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200) // 20 min

      const hash = await publicClient.writeContract({
        account: userAddress,
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, minOut, [usdcAddress, tokenAddress] as any, userAddress, deadline],
      })
      setTxStatus(t('externalTrade.swapping') || 'Swapping...')
      await publicClient.waitForTransactionReceipt({ hash })
      setTxSuccess(true)
      setTxStatus('')
      setBuyAmount('')
      setEstimatedBuy('0')
      onTxConfirmed?.()
    } catch (err: any) {
      setTxError(err.message || 'Swap failed')
    }
    setLoading(false)
  }

  // Sell tokens for USDC
  const handleSell = async () => {
    if (!publicClient || !userAddress || !sellAmount || parseFloat(sellAmount) === 0) return
    setLoading(true)
    setTxError('')
    setTxSuccess(false)

    try {
      const amountIn = parseEther(sellAmount)
      const minOut = parseEther((parseFloat(estimatedSell) * (1 - slippage / 100)).toFixed(18))
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)

      const hash = await publicClient.writeContract({
        account: userAddress,
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, minOut, [tokenAddress, usdcAddress] as any, userAddress, deadline],
      })
      setTxStatus(t('externalTrade.swapping') || 'Swapping...')
      await publicClient.waitForTransactionReceipt({ hash })
      setTxSuccess(true)
      setTxStatus('')
      setSellAmount('')
      setEstimatedSell('0')
      onTxConfirmed?.()
    } catch (err: any) {
      setTxError(err.message || 'Swap failed')
    }
    setLoading(false)
  }

  const needsUsdcApproval = parseFloat(usdcAllowance) < parseFloat(buyAmount || '0')
  const needsTokenApproval = parseFloat(tokenAllowance) < parseFloat(sellAmount || '0')

  if (configError) {
    return (
      <div className="card p-6">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{configError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5" />
          {t('externalTrade.title') || '外盘交易 (DEX)'}
        </h3>
        <div className="text-xs text-gray-500">
          {t('externalTrade.router') || '路由'}: {routerAddress?.slice(0, 8)}...
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-dark rounded-lg p-1">
        <button
          onClick={() => setActiveTab('buy')}
          className={cn('flex-1 py-2 rounded-md text-sm font-medium transition-colors', activeTab === 'buy' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white')}
        >
          {t('externalTrade.buy') || '买入'}
        </button>
        <button
          onClick={() => setActiveTab('sell')}
          className={cn('flex-1 py-2 rounded-md text-sm font-medium transition-colors', activeTab === 'sell' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white')}
        >
          {t('externalTrade.sell') || '卖出'}
        </button>
      </div>

      {/* Slippage */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{t('externalTrade.slippage') || '滑点容忍'}:</span>
        <div className="flex gap-1">
          {[0.5, 1, 3].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={cn('px-2 py-1 text-xs rounded', slippage === s ? 'bg-blue-500 text-white' : 'bg-dark text-gray-400')}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'buy' ? (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('externalTrade.pay') || '支付'} (USDC)</label>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <div className="text-xs text-gray-500 mt-1">
              {t('externalTrade.balance') || '余额'}: {parseFloat(userUsdcBal).toFixed(4)} USDC
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('externalTrade.receive') || '收到'} ({tokenSymbol})</label>
            <div className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white">
              {parseFloat(estimatedBuy).toFixed(6)}
            </div>
          </div>

          {!needsUsdcApproval ? (
            <button
              onClick={handleBuy}
              disabled={loading || !buyAmount || parseFloat(buyAmount) === 0}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {loading ? txStatus || t('externalTrade.swapping') : t('externalTrade.buyToken', { token: tokenSymbol })}
            </button>
          ) : (
            <button
              onClick={handleApproveUsdc}
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {loading ? txStatus : t('externalTrade.approveUsdc') || '授权 USDC'}
            </button>
          )}
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('externalTrade.sell') || '卖出'} ({tokenSymbol})</label>
            <input
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <div className="text-xs text-gray-500 mt-1">
              {t('externalTrade.balance') || '余额'}: {parseFloat(userTokenBal).toFixed(4)} {tokenSymbol}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('externalTrade.receive') || '收到'} (USDC)</label>
            <div className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white">
              {parseFloat(estimatedSell).toFixed(6)}
            </div>
          </div>

          {!needsTokenApproval ? (
            <button
              onClick={handleSell}
              disabled={loading || !sellAmount || parseFloat(sellAmount) === 0}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {loading ? txStatus || t('externalTrade.swapping') : t('externalTrade.sellToken', { token: tokenSymbol })}
            </button>
          ) : (
            <button
              onClick={handleApproveToken}
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {loading ? txStatus : t('externalTrade.approveToken') || '授权代币'}
            </button>
          )}
        </>
      )}

      {/* Status messages */}
      {txError && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {txError}
        </div>
      )}
      {txSuccess && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          {t('externalTrade.success') || '交易成功！'}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-700">
        <p>{t('externalTrade.warning') || '外盘交易通过 DEX 路由器执行，可能产生滑点和手续费。'}</p>
        <p>{t('externalTrade.routerInfo') || '路由合约'}: <a href={getBscScanUrl(chainId, 'address', routerAddress)} target="_blank" rel="noopener" className="text-blue-400 hover:underline">{routerAddress}</a></p>
      </div>
    </div>
  )
}
