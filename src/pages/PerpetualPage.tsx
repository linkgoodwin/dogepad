import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, useChainId, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { PERPETUAL_POOL_ABI, getContractAddress } from '../config/contracts'
import { useTokenStore } from '../stores/tokenStore'
import { getNativeSymbol } from '../config/contracts'
import KLineChart from '../components/KLineChart'
import { Loader2, TrendingUp, TrendingDown, Shield, Crosshair, ChevronDown, Plus, Minus, X } from 'lucide-react'
import { useT } from '../i18n/useT'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWriteContract = (params: any) => void

interface Position {
  token: string
  tokenSymbol: string
  margin: bigint
  size: bigint
  entryPrice: bigint
  lastFundingTime: bigint
  isLong: boolean
  isActive: boolean
  tpPrice: bigint
  slPrice: bigint
  hasTpsl: boolean
}

interface LimitOrder {
  orderId: bigint
  token: string
  isLong: boolean
  margin: bigint
  leverage: bigint
  triggerPrice: bigint
  isTriggerAbove: boolean
  isActive: boolean
}

export default function PerpetualPage() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { tokens } = useTokenStore()

  const poolAddress = getContractAddress(chainId, 'perpetualPool')
  const nativeSymbol = getNativeSymbol(chainId)

  // Trading state
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [orderSide, setOrderSide] = useState<'long' | 'short'>('long')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [margin, setMargin] = useState('')
  const [leverage, setLeverage] = useState(2)
  const [limitPrice, setLimitPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history'>('positions')
  const [closePercent, setClosePercent] = useState(100)
  const [showMarginModal, setShowMarginModal] = useState(false)
  const [marginAction, setMarginAction] = useState<'add' | 'remove'>('add')
  const [marginAmount, setMarginAmount] = useState('')
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  // Contract writes
  const { writeContract: _openPositionWrite, data: openHash, isPending: isOpening } = useWriteContract()
  const { writeContract: _closePositionWrite, data: closeHash, isPending: isClosing } = useWriteContract()
  const { writeContract: _partialCloseWrite, data: partialCloseHash, isPending: isPartialClosing } = useWriteContract()
  const { writeContract: _placeLimitOrderWrite, data: limitHash, isPending: isPlacingLimit } = useWriteContract()
  const { writeContract: _cancelLimitOrderWrite, data: cancelLimitHash, isPending: isCancellingLimit } = useWriteContract()
  const { writeContract: _setTpslWrite, data: tpslHash, isPending: isSettingTpsl } = useWriteContract()
  const { writeContract: _addMarginWrite, data: addMarginHash, isPending: isAddingMargin } = useWriteContract()
  const { writeContract: _removeMarginWrite, data: removeMarginHash, isPending: isRemovingMargin } = useWriteContract()

  const openPositionWrite = _openPositionWrite as AnyWriteContract
  const closePositionWrite = _closePositionWrite as AnyWriteContract
  const partialCloseWrite = _partialCloseWrite as AnyWriteContract
  const placeLimitOrderWrite = _placeLimitOrderWrite as AnyWriteContract
  const cancelLimitOrderWrite = _cancelLimitOrderWrite as AnyWriteContract
  const setTpslWrite = _setTpslWrite as AnyWriteContract
  const addMarginWrite = _addMarginWrite as AnyWriteContract
  const removeMarginWrite = _removeMarginWrite as AnyWriteContract

  // Wait for transactions
  const { isLoading: isOpenConfirming } = useWaitForTransactionReceipt({ hash: openHash })
  const { isLoading: isCloseConfirming } = useWaitForTransactionReceipt({ hash: closeHash })
  const { isLoading: isPartialCloseConfirming } = useWaitForTransactionReceipt({ hash: partialCloseHash })
  const { isLoading: isLimitConfirming } = useWaitForTransactionReceipt({ hash: limitHash })
  const { isLoading: isCancelLimitConfirming } = useWaitForTransactionReceipt({ hash: cancelLimitHash })
  const { isLoading: isTpslConfirming } = useWaitForTransactionReceipt({ hash: tpslHash })
  const { isLoading: isAddMarginConfirming } = useWaitForTransactionReceipt({ hash: addMarginHash })
  const { isLoading: isRemoveMarginConfirming } = useWaitForTransactionReceipt({ hash: removeMarginHash })

  // Read position data
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getPosition',
    args: address && selectedToken ? [address, selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!address && !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read mark price
  const { data: markPrice } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getMarkPrice',
    args: selectedToken ? [selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read liquidation price
  const { data: liqPrice } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getLiquidationPrice',
    args: address && selectedToken ? [address, selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!address && !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read margin health
  const { data: marginHealth } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getMarginHealth',
    args: address && selectedToken ? [address, selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!address && !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read PnL
  const { data: pnlData } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getPnl',
    args: address && selectedToken ? [address, selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!address && !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read funding rate
  const { data: fundingRate } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getCurrentFundingRate',
    args: selectedToken ? [selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read open interest
  const { data: openInterest } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getOpenInterest',
    args: selectedToken ? [selectedToken as `0x${string}`] : undefined,
    query: { enabled: !!selectedToken && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read listed tokens
  const { data: listedTokens } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getListedTokens',
    query: { enabled: poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Read limit orders
  const { data: limitOrdersData, refetch: refetchLimitOrders } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: PERPETUAL_POOL_ABI,
    functionName: 'getUserLimitOrders',
    args: address ? [address] : undefined,
    query: { enabled: !!address && poolAddress !== '0x0000000000000000000000000000000000000000' },
  })

  // Parse position
  const position: Position | null = useMemo(() => {
    if (!positionData || !selectedToken) return null
    const tokenInfo = tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase())
    return {
      token: selectedToken,
      tokenSymbol: tokenInfo?.symbol || 'Unknown',
      margin: positionData[0],
      size: positionData[1],
      entryPrice: positionData[2],
      lastFundingTime: positionData[3],
      isLong: positionData[4],
      isActive: positionData[5],
      tpPrice: positionData[6],
      slPrice: positionData[7],
      hasTpsl: positionData[8],
    }
  }, [positionData, selectedToken, tokens])

  // Parse limit orders
  const limitOrders: LimitOrder[] = useMemo(() => {
    if (!limitOrdersData) return []
    const orders: LimitOrder[] = []
    for (let i = 0; i < limitOrdersData[0].length; i++) {
      orders.push({
        orderId: limitOrdersData[0][i],
        token: limitOrdersData[1][i],
        isLong: limitOrdersData[2][i],
        margin: limitOrdersData[3][i],
        leverage: limitOrdersData[4][i],
        triggerPrice: limitOrdersData[5][i],
        isTriggerAbove: limitOrdersData[6][i],
        isActive: limitOrdersData[7][i],
      })
    }
    return orders.filter(o => o.isActive)
  }, [limitOrdersData])

  // Auto-select first token
  useEffect(() => {
    if (listedTokens && listedTokens.length > 0 && !selectedToken) {
      setSelectedToken(listedTokens[0])
    }
  }, [listedTokens, selectedToken])

  // Refresh data after transactions
  useEffect(() => {
    if (!isOpenConfirming && openHash) {
      refetchPosition()
      setMargin('')
      setTpPrice('')
      setSlPrice('')
    }
  }, [isOpenConfirming, openHash, refetchPosition])

  useEffect(() => {
    if (!isCloseConfirming && closeHash) {
      refetchPosition()
    }
  }, [isCloseConfirming, closeHash, refetchPosition])

  useEffect(() => {
    if (!isPartialCloseConfirming && partialCloseHash) {
      refetchPosition()
    }
  }, [isPartialCloseConfirming, partialCloseHash, refetchPosition])

  useEffect(() => {
    if (!isTpslConfirming && tpslHash) {
      refetchPosition()
      setTpPrice('')
      setSlPrice('')
    }
  }, [isTpslConfirming, tpslHash, refetchPosition])

  useEffect(() => {
    if (!isLimitConfirming && limitHash) {
      refetchLimitOrders()
      setMargin('')
      setLimitPrice('')
    }
  }, [isLimitConfirming, limitHash, refetchLimitOrders])

  useEffect(() => {
    if (!isCancelLimitConfirming && cancelLimitHash) {
      refetchLimitOrders()
    }
  }, [isCancelLimitConfirming, cancelLimitHash, refetchLimitOrders])

  // Handlers
  const handleOpenPosition = useCallback(() => {
    if (!selectedToken || !margin || !isConnected) return
    const marginValue = parseEther(margin)
    const leverageValue = BigInt(leverage) * BigInt(1e18)

    if (orderType === 'market') {
      openPositionWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'openPosition',
        args: [selectedToken as `0x${string}`, orderSide === 'long', marginValue, leverageValue],
        value: marginValue,
      })
    } else {
      if (!limitPrice) return
      const triggerPrice = parseEther(limitPrice)
      const isTriggerAbove = orderSide === 'short'
      placeLimitOrderWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'placeLimitOrder',
        args: [selectedToken as `0x${string}`, orderSide === 'long', marginValue, leverageValue, triggerPrice, isTriggerAbove],
        value: marginValue,
      })
    }
  }, [selectedToken, margin, leverage, orderSide, orderType, limitPrice, isConnected, poolAddress, openPositionWrite, placeLimitOrderWrite])

  const handleClosePosition = useCallback(() => {
    if (!selectedToken || !position?.isActive) return
    if (closePercent === 100) {
      closePositionWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'closePosition',
        args: [selectedToken as `0x${string}`],
      })
    } else {
      const closeSize = (position.size * BigInt(closePercent)) / BigInt(100)
      partialCloseWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'closePositionPartial',
        args: [selectedToken as `0x${string}`, closeSize],
      })
    }
  }, [selectedToken, position, closePercent, poolAddress, closePositionWrite, partialCloseWrite])

  const handleSetTpsl = useCallback(() => {
    if (!selectedToken || !position?.isActive) return
    const tp = tpPrice ? parseEther(tpPrice) : BigInt(0)
    const sl = slPrice ? parseEther(slPrice) : BigInt(0)
    setTpslWrite({
      address: poolAddress as `0x${string}`,
      abi: PERPETUAL_POOL_ABI,
      functionName: 'setTpsl',
      args: [selectedToken as `0x${string}`, tp, sl],
    })
  }, [selectedToken, position, tpPrice, slPrice, poolAddress, setTpslWrite])

  const handleCancelTpsl = useCallback(() => {
    if (!selectedToken || !position?.isActive) return
    setTpslWrite({
      address: poolAddress as `0x${string}`,
      abi: PERPETUAL_POOL_ABI,
      functionName: 'cancelTpsl',
      args: [selectedToken as `0x${string}`],
    })
  }, [selectedToken, position, poolAddress, setTpslWrite])

  const handleCancelLimitOrder = useCallback((orderId: bigint) => {
    cancelLimitOrderWrite({
      address: poolAddress as `0x${string}`,
      abi: PERPETUAL_POOL_ABI,
      functionName: 'cancelLimitOrder',
      args: [orderId],
    })
  }, [poolAddress, cancelLimitOrderWrite])

  const handleMarginAction = useCallback(() => {
    if (!selectedToken || !position?.isActive || !marginAmount) return
    const amount = parseEther(marginAmount)
    if (marginAction === 'add') {
      addMarginWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'addMargin',
        args: [selectedToken as `0x${string}`],
        value: amount,
      })
    } else {
      removeMarginWrite({
        address: poolAddress as `0x${string}`,
        abi: PERPETUAL_POOL_ABI,
        functionName: 'removeMargin',
        args: [selectedToken as `0x${string}`, amount],
      })
    }
    setShowMarginModal(false)
    setMarginAmount('')
  }, [selectedToken, position, marginAmount, marginAction, poolAddress, addMarginWrite, removeMarginWrite])

  // Format helpers
  const formatPrice = (price: bigint | undefined) => {
    if (!price) return '-'
    return Number(formatEther(price)).toFixed(6)
  }

  const formatPnl = (pnl: bigint | undefined) => {
    if (!pnl) return '-'
    const value = Number(formatEther(pnl))
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(4)} ${nativeSymbol}`
  }

  const formatFundingRate = (rate: bigint | undefined) => {
    if (!rate) return '0%'
    const value = Number(rate) / 1e18
    const sign = value >= 0 ? '+' : ''
    return `${sign}${(value * 100).toFixed(4)}%`
  }

  const getHealthColor = (health: bigint | undefined) => {
    if (!health) return 'text-gray-400'
    const h = Number(health)
    if (h >= 70) return 'text-green-400'
    if (h >= 30) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getHealthBg = (health: bigint | undefined) => {
    if (!health) return 'bg-gray-700'
    const h = Number(health)
    if (h >= 70) return 'bg-green-500'
    if (h >= 30) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const isLoading = isOpening || isOpenConfirming || isClosing || isCloseConfirming || isPartialClosing || isPartialCloseConfirming || isPlacingLimit || isLimitConfirming || isCancellingLimit || isCancelLimitConfirming || isSettingTpsl || isTpslConfirming || isAddingMargin || isAddMarginConfirming || isRemovingMargin || isRemoveMarginConfirming

  const selectedTokenInfo = tokens.find(t => t.address.toLowerCase() === selectedToken.toLowerCase())

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-[1600px] mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('perpetualTrading')}</h1>
            <p className="text-gray-400 text-sm">{t('tradePerpetualFutures')}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Token Selector */}
            <div className="relative">
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-2 text-white appearance-none cursor-pointer min-w-[180px]"
              >
                <option value="">{t('selectToken')}</option>
                {listedTokens?.map((token) => {
                  const info = tokens.find(t => t.address.toLowerCase() === token.toLowerCase())
                  return (
                    <option key={token} value={token}>
                      {info?.symbol || token.slice(0, 8)}...{token.slice(-4)}
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {/* Funding Rate Display */}
            {fundingRate !== undefined && (
              <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-2">
                <span className="text-gray-400 text-xs">{t('fundingRate')}</span>
                <div className={`text-sm font-mono ${Number(fundingRate) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatFundingRate(fundingRate)}
                </div>
              </div>
            )}
            {/* OI Display */}
            {openInterest && (
              <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-2">
                <span className="text-gray-400 text-xs">{t('openInterest')}</span>
                <div className="text-sm font-mono">
                  <span className="text-green-400">L: {formatPrice(openInterest[0])}</span>
                  <span className="text-gray-500 mx-1">/</span>
                  <span className="text-red-400">S: {formatPrice(openInterest[1])}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Area */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedTokenInfo?.symbol || t('selectToken')}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-2xl font-mono">{formatPrice(markPrice)}</span>
                    {pnlData !== undefined && position?.isActive && (
                      <span className={`text-sm font-mono ${Number(pnlData) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPnl(pnlData)}
                      </span>
                    )}
                  </div>
                </div>
                {position?.isActive && (
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{t('marginHealth')}</div>
                    <div className={`text-lg font-mono ${getHealthColor(marginHealth)}`}>
                      {marginHealth ? `${marginHealth.toString()}%` : '-'}
                    </div>
                    <div className="w-32 h-2 bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getHealthBg(marginHealth)}`}
                        style={{ width: `${Math.min(Number(marginHealth || 0), 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <KLineChart data={[]} />
            </div>

            {/* Position / Orders Tabs */}
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl">
              <div className="flex border-b border-gray-800">
                {(['positions', 'orders', 'history'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'text-white border-b-2 border-blue-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t(tab)}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {activeTab === 'positions' && (
                  <div>
                    {position?.isActive ? (
                      <div className="space-y-4">
                        {/* Active Position Card */}
                        <div className="bg-[#0f1419] border border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                position.isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {position.isLong ? t('long') : t('short')}
                              </span>
                              <span className="font-mono text-sm">{position.tokenSymbol}</span>
                              <span className="text-gray-400 text-sm">
                                {leverage}x
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setMarginAction('add'); setSelectedPosition(position); setShowMarginModal(true) }}
                                className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                                title={t('addMargin')}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => { setMarginAction('remove'); setSelectedPosition(position); setShowMarginModal(true) }}
                                className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                                title={t('removeMargin')}
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-gray-400">{t('size')}</div>
                              <div className="font-mono text-sm">{formatPrice(position.size)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">{t('margin')}</div>
                              <div className="font-mono text-sm">{formatPrice(position.margin)} {nativeSymbol}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">{t('entryPrice')}</div>
                              <div className="font-mono text-sm">{formatPrice(position.entryPrice)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">{t('markPrice')}</div>
                              <div className="font-mono text-sm">{formatPrice(markPrice)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">{t('liquidationPrice')}</div>
                              <div className="font-mono text-sm text-red-400">{formatPrice(liqPrice)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">{t('pnl')}</div>
                              <div className={`font-mono text-sm ${Number(pnlData || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatPnl(pnlData)}
                              </div>
                            </div>
                            {position.hasTpsl && (
                              <>
                                <div>
                                  <div className="text-xs text-gray-400">{t('takeProfit')}</div>
                                  <div className="font-mono text-sm text-green-400">{formatPrice(position.tpPrice)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-400">{t('stopLoss')}</div>
                                  <div className="font-mono text-sm text-red-400">{formatPrice(position.slPrice)}</div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Close Position */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-[#1a1f2e] rounded-lg p-1">
                              {[25, 50, 75, 100].map((pct) => (
                                <button
                                  key={pct}
                                  onClick={() => setClosePercent(pct)}
                                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                                    closePercent === pct
                                      ? 'bg-blue-500 text-white'
                                      : 'text-gray-400 hover:text-white'
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={handleClosePosition}
                              disabled={isClosing || isPartialClosing}
                              className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              {isClosing || isPartialClosing ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                              ) : (
                                closePercent === 100 ? t('closePosition') : `${t('close')} ${closePercent}%`
                              )}
                            </button>
                          </div>
                        </div>

                        {/* TP/SL Setting */}
                        <div className="bg-[#0f1419] border border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium flex items-center gap-2">
                              <Crosshair className="w-4 h-4" />
                              {t('takeProfitStopLoss')}
                            </h3>
                            {position.hasTpsl && (
                              <button
                                onClick={handleCancelTpsl}
                                disabled={isSettingTpsl}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              >
                                {t('cancel')}
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">{t('takeProfit')}</label>
                              <input
                                type="number"
                                value={tpPrice}
                                onChange={(e) => setTpPrice(e.target.value)}
                                placeholder={t('price')}
                                className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">{t('stopLoss')}</label>
                              <input
                                type="number"
                                value={slPrice}
                                onChange={(e) => setSlPrice(e.target.value)}
                                placeholder={t('price')}
                                className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleSetTpsl}
                            disabled={isSettingTpsl || (!tpPrice && !slPrice)}
                            className="w-full mt-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            {isSettingTpsl ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('setTpsl')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>{t('noActivePosition')}</p>
                        <p className="text-sm mt-1">{t('openPositionToStart')}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div>
                    {limitOrders.length > 0 ? (
                      <div className="space-y-2">
                        {limitOrders.map((order) => {
                          const tokenInfo = tokens.find(t => t.address.toLowerCase() === order.token.toLowerCase())
                          return (
                            <div key={order.orderId.toString()} className="bg-[#0f1419] border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  order.isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {order.isLong ? t('long') : t('short')}
                                </span>
                                <span className="text-sm">{tokenInfo?.symbol || order.token.slice(0, 8)}</span>
                                <span className="text-xs text-gray-400">
                                  {formatPrice(order.margin)} {nativeSymbol} @ {Number(order.leverage) / 1e18}x
                                </span>
                                <span className="text-xs text-gray-400">
                                  {t('trigger')}: {formatPrice(order.triggerPrice)}
                                </span>
                              </div>
                              <button
                                onClick={() => handleCancelLimitOrder(order.orderId)}
                                disabled={isCancellingLimit}
                                className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <p>{t('noActiveOrders')}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="text-center py-8 text-gray-400">
                    <p>{t('tradeHistoryComingSoon')}</p>
                    <p className="text-sm mt-1">{t('useExplorerForHistory')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="space-y-4">
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4">
              {/* Order Type Tabs */}
              <div className="flex mb-4">
                {(['market', 'limit'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      orderType === type
                        ? 'text-white border-b-2 border-blue-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t(type)}
                  </button>
                ))}
              </div>

              {/* Side Selection */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setOrderSide('long')}
                  className={`py-3 rounded-lg text-sm font-medium transition-colors ${
                    orderSide === 'long'
                      ? 'bg-green-500 text-white'
                      : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  {t('long')}
                </button>
                <button
                  onClick={() => setOrderSide('short')}
                  className={`py-3 rounded-lg text-sm font-medium transition-colors ${
                    orderSide === 'short'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  }`}
                >
                  <TrendingDown className="w-4 h-4 inline mr-1" />
                  {t('short')}
                </button>
              </div>

              {/* Margin Input */}
              <div className="mb-4">
                <label className="text-xs text-gray-400 block mb-1">{t('margin')} ({nativeSymbol})</label>
                <input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Leverage Slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">{t('leverage')}</label>
                  <span className="text-sm font-mono">{leverage}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1x</span>
                  <span>5x</span>
                  <span>10x</span>
                </div>
              </div>

              {/* Limit Price (for limit orders) */}
              {orderType === 'limit' && (
                <div className="mb-4">
                  <label className="text-xs text-gray-400 block mb-1">{t('triggerPrice')}</label>
                  <input
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* TP/SL Inputs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">{t('tp')} ({t('optional')})</label>
                  <input
                    type="number"
                    value={tpPrice}
                    onChange={(e) => setTpPrice(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">{t('sl')} ({t('optional')})</label>
                  <input
                    type="number"
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Position Preview */}
              {margin && markPrice && (
                <div className="bg-[#0f1419] rounded-lg p-3 mb-4 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{t('positionSize')}</span>
                    <span className="font-mono">{(Number(margin) * leverage).toFixed(4)} {nativeSymbol}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{t('entryPrice')}</span>
                    <span className="font-mono">{formatPrice(markPrice)}</span>
                  </div>
                  {liqPrice && Number(liqPrice) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">{t('estLiquidation')}</span>
                      <span className="font-mono text-red-400">{formatPrice(liqPrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{t('fee')}</span>
                    <span className="font-mono">{(Number(margin) * 0.001).toFixed(6)} {nativeSymbol}</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              {!isConnected ? (
                <button
                  onClick={() => {}}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {t('connectWallet')}
                </button>
              ) : (
                <button
                  onClick={handleOpenPosition}
                  disabled={isLoading || !margin || !selectedToken}
                  className={`w-full py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                    orderSide === 'long'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    `${orderSide === 'long' ? t('long') : t('short')} ${selectedTokenInfo?.symbol || ''}`
                  )}
                </button>
              )}
            </div>

            {/* Market Info */}
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">{t('marketInfo')}</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('markPrice')}</span>
                  <span className="font-mono">{formatPrice(markPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('fundingRate')}</span>
                  <span className={`font-mono ${Number(fundingRate || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatFundingRate(fundingRate)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('longOI')}</span>
                  <span className="font-mono text-green-400">{formatPrice(openInterest?.[0])}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('shortOI')}</span>
                  <span className="font-mono text-red-400">{formatPrice(openInterest?.[1])}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('maxLeverage')}</span>
                  <span className="font-mono">10x</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('maintenanceMargin')}</span>
                  <span className="font-mono">6%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Margin Modal */}
      {showMarginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">
                {marginAction === 'add' ? t('addMargin') : t('removeMargin')}
              </h3>
              <button
                onClick={() => setShowMarginModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-400 block mb-1">
                {t('amount')} ({nativeSymbol})
              </label>
              <input
                type="number"
                value={marginAmount}
                onChange={(e) => setMarginAmount(e.target.value)}
                placeholder="0.0"
                className="w-full bg-[#0f1419] border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {selectedPosition && (
              <div className="bg-[#0f1419] rounded-lg p-3 mb-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{t('currentMargin')}</span>
                  <span className="font-mono">{formatPrice(selectedPosition.margin)} {nativeSymbol}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleMarginAction}
              disabled={isAddingMargin || isRemovingMargin || !marginAmount}
              className={`w-full py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                marginAction === 'add'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {isAddingMargin || isRemovingMargin ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                marginAction === 'add' ? t('addMargin') : t('removeMargin')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
