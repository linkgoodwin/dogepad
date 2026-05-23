import { useMemo } from 'react'
import { formatEther } from 'viem'
import { useT } from '@/i18n/useT'

interface Trade {
  type: 'buy' | 'sell'
  usdcAmount: bigint
  tokenAmount: bigint
  blockNumber: bigint
}

interface PriceChartProps {
  trades: Trade[]
}

export default function PriceChart({ trades }: PriceChartProps) {
  const t = useT()

  const data = useMemo(() => {
    if (!trades || trades.length === 0) return []
    return trades.map((trade) => ({
      type: trade.type,
      price: Number(formatEther(trade.usdcAmount)) / Number(formatEther(trade.tokenAmount)),
    }))
  }, [trades])

  if (!data || data.length === 0) {
    return (
      <div className="bg-dark-700/50 rounded-lg h-[200px] flex items-center justify-center">
        <p className="text-gray-400 text-sm">{t('tokenDetail.noTrades')}</p>
      </div>
    )
  }

  const prices = data.map((d) => d.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice || maxPrice || 1

  const padding = { top: 16, right: 16, bottom: 24, left: 56 }
  const chartW = 600
  const chartH = 200
  const plotW = chartW - padding.left - padding.right
  const plotH = chartH - padding.top - padding.bottom

  const toX = (i: number) => padding.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW)
  const toY = (price: number) => padding.top + plotH - ((price - minPrice) / priceRange) * plotH

  const yTicks = 4
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minPrice + (priceRange * i) / yTicks
    return { val, y: toY(val) }
  })

  const formatPriceLabel = (v: number) => {
    if (v >= 1) return v.toFixed(2)
    if (v >= 0.0001) return v.toFixed(6)
    return v.toExponential(2)
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.price).toFixed(1)}`).join(' ')

  const areaPath = data.length > 1
    ? `${linePath} L${toX(data.length - 1).toFixed(1)},${(padding.top + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padding.top + plotH).toFixed(1)} Z`
    : ''

  const lastPrice = data[data.length - 1].price
  const firstPrice = data[0].price
  const priceChange = lastPrice - firstPrice
  const priceChangePercent = firstPrice !== 0 ? (priceChange / firstPrice) * 100 : 0
  const isUp = priceChange >= 0
  const lineColor = isUp ? '#22c55e' : '#ef4444'

  return (
    <div className="bg-dark-700/50 rounded-lg overflow-hidden" style={{ height: chartH }}>
      <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yLabels.map(({ val, y }, i) => (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={chartW - padding.right} y2={y} stroke="#28283c" strokeWidth="0.5" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="#6b7280" fontSize="8" fontFamily="Inter, system-ui, sans-serif">
              {formatPriceLabel(val)}
            </text>
          </g>
        ))}

        {data.length > 1 && areaPath && (
          <path d={areaPath} fill="url(#areaGradient)" />
        )}

        {data.length > 1 && (
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {data.map((d, i) => (
          <circle
            key={i}
            cx={toX(i).toFixed(1)}
            cy={toY(d.price).toFixed(1)}
            r={data.length > 20 ? 2 : 3}
            fill={d.type === 'buy' ? '#22c55e' : '#ef4444'}
          />
        ))}
      </svg>
    </div>
  )
}
