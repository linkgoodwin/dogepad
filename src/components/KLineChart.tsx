import { useEffect, useRef, useCallback, useState } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi, Time, CandlestickSeries, HistogramSeries } from 'lightweight-charts'

export interface KLineData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface KLineChartProps {
  data: KLineData[]
  height?: number
  colorUp?: string
  colorDown?: string
  showVolume?: boolean
}

export function aggregateKLine(
  trades: Array<{ price: number; amount: number; timestamp: number }>,
  intervalMs: number
): KLineData[] {
  if (!trades || trades.length === 0) return []

  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp)
  const buckets = new Map<number, KLineData>()

  for (const trade of sorted) {
    const bucketKey = Math.floor(trade.timestamp / intervalMs) * intervalMs
    const existing = buckets.get(bucketKey)
    if (existing) {
      existing.high = Math.max(existing.high, trade.price)
      existing.low = Math.min(existing.low, trade.price)
      existing.close = trade.price
      existing.volume += trade.amount
    } else {
      buckets.set(bucketKey, {
        time: bucketKey,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.amount,
      })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time)
}

export function useKLineAggregator(intervalMs: number = 60_000) {
  const tradesRef = useRef<Array<{ price: number; amount: number; timestamp: number }>>([])

  const addTrade = useCallback((price: number, amount: number, timestamp?: number) => {
    tradesRef.current.push({
      price,
      amount,
      timestamp: timestamp ?? Date.now(),
    })
  }, [])

  const getKLineData = useCallback((): KLineData[] => {
    return aggregateKLine(tradesRef.current, intervalMs)
  }, [intervalMs])

  const clear = useCallback(() => {
    tradesRef.current = []
  }, [])

  return { addTrade, getKLineData, clear }
}

export default function KLineChart({
  data,
  height = 400,
  colorUp = '#22c55e',
  colorDown = '#ef4444',
  showVolume = true,
}: KLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [chartError, setChartError] = useState<string>('')

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#0f172a' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        width: chartContainerRef.current.clientWidth || 800,
        height,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: false,
        handleScroll: false,
      })

      chartRef.current = chart

      // Add candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: colorUp,
        downColor: colorDown,
        borderDownColor: colorDown,
        borderUpColor: colorUp,
        wickDownColor: colorDown,
        wickUpColor: colorUp,
      })
      candleSeriesRef.current = candleSeries

      // Add volume series
      if (showVolume) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#6366f1',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        })
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        })
        volumeSeriesRef.current = volumeSeries
      }

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        }
      }

      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        chart.remove()
        chartRef.current = null
        candleSeriesRef.current = null
        volumeSeriesRef.current = null
      }
    } catch (err: any) {
      console.error('Chart init error:', err)
      setChartError(err.message || 'Failed to initialize chart')
    }
  }, [height, showVolume])

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current) return

    try {
      // Validate and filter data
      const validData = (data || []).filter(d =>
        d &&
        typeof d.time === 'number' &&
        typeof d.open === 'number' &&
        typeof d.high === 'number' &&
        typeof d.low === 'number' &&
        typeof d.close === 'number' &&
        d.high >= d.low &&
        d.open >= 0 &&
        d.close >= 0
      )

      if (validData.length === 0) return

      const candleData = validData.map((d) => ({
        time: (d.time / 1000) as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))

      candleSeriesRef.current.setData(candleData)

      if (volumeSeriesRef.current) {
        const volumeData = validData.map((d) => ({
          time: (d.time / 1000) as Time,
          value: d.volume || 0,
          color: d.close >= d.open ? `${colorUp}66` : `${colorDown}66`,
        }))
        volumeSeriesRef.current.setData(volumeData)
      }

      chartRef.current?.timeScale().fitContent()
    } catch (err: any) {
      console.error('Chart data error:', err)
      setChartError(err.message || 'Failed to update chart data')
    }
  }, [data, colorUp, colorDown])

  if (chartError) {
    return (
      <div className="w-full rounded-lg overflow-hidden bg-[#0f172a] flex items-center justify-center" style={{ height }}>
        <div className="text-gray-400 text-sm text-center p-4">
          <p>Chart unavailable</p>
          <p className="text-xs text-gray-500 mt-1">{chartError}</p>
        </div>
      </div>
    )
  }

  return <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" style={{ height }} />
}
