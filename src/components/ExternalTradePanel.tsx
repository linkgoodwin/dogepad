import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { getContractAddress, getBscScanUrl, isZeroAddress } from '@/config/contracts'
import { useTradeStore } from '@/stores/tradeStore'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { ArrowRightLeft, AlertCircle, CheckCircle } from 'lucide-react'

const ERC20_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const ROUTER_ABI = [
  { name: 'getAmountsOut', type: 'function', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { name: 'swapExactTokensForTokens', type: 'function', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
] as const

const USDC_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
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
  const { address: userAddress, isConnected, chain } = useAccount()
  const { writeContract, data: writeTxHash, isPending: isWritePending, reset: resetWrite } = useWriteContract()
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: writeTxHash })

  const { buyAmount, sellAmount, slippage, setBuyAmount, setSellAmount, setSlippage } = useTradeStore()
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy')
  const [txError, setTxError] = useState('')
  const [configError, setConfigError] = useState('')

  // State
  const [estimatedBuy, setEstimatedBuy] = useState<string>('0')
  const [estimatedSell, setEstimatedSell] = useState<string>('0')
  const [userTokenBal, setUserTokenBal] = useState<string>('0')
  const [userUsdcBal, setUserUsdcBal] = useState<string>('0')
  const [tokenAllowance, setTokenAllowance] = useState<string>('0')
  const [usdcAllowance, setUsdcAllowance] = useState<string>('0')

  // Get contract addresses
  const routerAddress = getContractAddress(chainId, 'simpleRouter')
  const factoryAddress = getContractAddress(chainId, 'simpleFactory')
  const wusdcAddress = getContractAddress(chainId, 'wusdc')
  const baseAssetAddress = getContractAddress(chainId, 'baseAsset')
  const usdcAddress = isZeroAddress(wusdcAddress as `0x${string}`) ? baseAssetAddress : wusdcAddress

  // Check config
  useEffect(() => {
    if (isZeroAddress(routerAddress as `0x${string}`) || isZeroAddress(factoryAddress as `0x${string}`)) {
      setConfigError(t('externalTrade.configError') || 'DEX not configured for this network')
    } else {
      setConfigError('')
    }
  }, [routerAddress, factoryAddress, t])

  // Read hooks for USDC balance
  const { data: usdcBal } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress && isConnected },
  })

  // Token balance
  const { data: tokenBal } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userAddress as `0x${string}`],
    query: { enabled: !!userAddress && isConnected },
  })

  // USDC allowance
  const { data: usdcAllow } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, routerAddress as `0x${string}`],
    query: { enabled: !!userAddress && isConnected },
  })

  // Token allowance
  const { data: tokenAllow } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, routerAddress as `0x${string}`],
    query: { enabled: !!userAddress && isConnected },
  })

  // Update state from hooks
  useEffect(() => {
    if (usdcBal !== undefined) setUserUsdcBal(formatEther(usdcBal as bigint))
  }, [usdcBal])

  useEffect(() => {
    if (tokenBal !== undefined) setUserTokenBal(formatEther(tokenBal as bigint))
  }, [tokenBal])

  useEffect(() => {
    if (usdcAllow !== undefined) setUsdcAllowance(formatEther(usdcAllow as bigint))
  }, [usdcAllow])

  useEffect(() => {
    if (tokenAllow !== undefined) setTokenAllowance(formatEther(tokenAllow as bigint))
  }, [tokenAllow])

  // Buy estimate
  const { data: buyEstimate, refetch: refetchBuyEstimate } = useReadContract({
    address: routerAddress as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [parseEther(buyAmount || '0'), [usdcAddress, tokenAddress] as `0x${string}`[]],
    query: { enabled: !!buyAmount && parseFloat(buyAmount) > 0 },
  })

  // Sell estimate
  const { data: sellEstimate, refetch: refetchSellEstimate } = useReadContract({
    address: routerAddress as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [parseEther(sellAmount || '0'), [tokenAddress, usdcAddress] as `0x${string}`[]],
    query: { enabled: !!sellAmount && parseFloat(sellAmount) > 0 },
  })

  useEffect(() => {
    if (buyEstimate && Array.isArray(buyEstimate)) {
      setEstimatedBuy(formatEther(buyEstimate[1] as bigint))
    }
  }, [buyEstimate])

  useEffect(() => {
    if (sellEstimate && Array.isArray(sellEstimate)) {
      setEstimatedSell(formatEther(sellEstimate[1] as bigint))
    }
  }, [sellEstimate])

  // Handle transaction success
  useEffect(() => {
    if (isTxSuccess && writeTxHash) {
      setTimeout(() => {
        if (activeTab === 'buy') {
          setBuyAmount('')
          setEstimatedBuy('0')
        } else {
          setSellAmount('')
          setEstimatedSell('0')
        }
        onTxConfirmed?.()
        resetWrite()
      }, 1000)
    }
  }, [isTxSuccess, writeTxHash, activeTab, setBuyAmount, setSellAmount, onTxConfirmed, resetWrite])

  // Refetch estimates when amounts change
  useEffect(() => {
    if (activeTab === 'buy' && buyAmount) {
      refetchBuyEstimate()
    } else if (activeTab === 'sell' && sellAmount) {
      refetchSellEstimate()
    }
  }, [activeTab, buyAmount, sellAmount, refetchBuyEstimate, refetchSellEstimate])

  // Approve USDC
  const handleApproveUsdc = useCallback(() => {
    if (!userAddress || !chain) return
    setTxError('')
    try {
      writeContract({
        address: usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [routerAddress as `0x${string}`, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
        chain,
        account: userAddress,
      })
    } catch (err: any) {
      setTxError(err.message || 'Approval failed')
    }
  }, [userAddress, chain, usdcAddress, routerAddress, writeContract])

  // Approve Token
  const handleApproveToken = useCallback(() => {
    if (!userAddress || !chain) return
    setTxError('')
    try {
      writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress as `0x${string}`, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
        chain,
        account: userAddress,
      })
    } catch (err: any) {
      setTxError(err.message || 'Approval failed')
    }
  }, [userAddress, chain, tokenAddress, routerAddress, writeContract])

  // Buy tokens
  const handleBuy = useCallback(() => {
    if (!userAddress || !chain || !buyAmount || parseFloat(buyAmount) === 0) return
    setTxError('')

    try {
      const amountIn = parseEther(buyAmount)
      const minOut = parseEther((parseFloat(estimatedBuy) * (1 - slippage / 100)).toFixed(18))
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)

      writeContract({
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, minOut, [usdcAddress, tokenAddress] as `0x${string}`[], userAddress, deadline],
        chain,
        account: userAddress,
      })
    } catch (err: any) {
      setTxError(err.message || 'Swap failed')
    }
  }, [userAddress, chain, buyAmount, estimatedBuy, slippage, routerAddress, usdcAddress, tokenAddress, writeContract])

  // Sell tokens
  const handleSell = useCallback(() => {
    if (!userAddress || !chain || !sellAmount || parseFloat(sellAmount) === 0) return
    setTxError('')

    try {
      const amountIn = parseEther(sellAmount)
      const minOut = parseEther((parseFloat(estimatedSell) * (1 - slippage / 100)).toFixed(18))
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)

      writeContract({
        address: routerAddress as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, minOut, [tokenAddress, usdcAddress] as `0x${string}`[], userAddress, deadline],
        chain,
        account: userAddress,
      })
    } catch (err: any) {
      setTxError(err.message || 'Swap failed')
    }
  }, [userAddress, chain, sellAmount, estimatedSell, slippage, routerAddress, tokenAddress, usdcAddress, writeContract])

  const needsUsdcApproval = parseFloat(usdcAllowance) < parseFloat(buyAmount || '0')
  const needsTokenApproval = parseFloat(tokenAllowance) < parseFloat(sellAmount || '0')
  const isLoading = isWritePending || isTxPending

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
              disabled={isLoading || !buyAmount || parseFloat(buyAmount) === 0}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {isLoading ? (t('externalTrade.swapping') || '交易中...') : t('externalTrade.buyToken', { token: tokenSymbol })}
            </button>
          ) : (
            <button
              onClick={handleApproveUsdc}
              disabled={isLoading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {isLoading ? (t('externalTrade.approving') || '授权中...') : t('externalTrade.approveUsdc') || '授权 USDC'}
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
              disabled={isLoading || !sellAmount || parseFloat(sellAmount) === 0}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {isLoading ? (t('externalTrade.swapping') || '交易中...') : t('externalTrade.sellToken', { token: tokenSymbol })}
            </button>
          ) : (
            <button
              onClick={handleApproveToken}
              disabled={isLoading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
            >
              {isLoading ? (t('externalTrade.approving') || '授权中...') : t('externalTrade.approveToken') || '授权代币'}
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
      {isTxSuccess && (
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
