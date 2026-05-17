import { useMemo } from 'react'
import { Landmark, TrendingUp, Flame, Inbox, AlertTriangle } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { LONG_POOL_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { calculateExponentialRate, rateCurveData } from '@/data/poolData'
import { cn, formatUsdc } from '@/lib/utils'
import { useT } from '@/i18n/useT'

export default function LendMarket() {
  const t = useT()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const longPoolAddress = getContractAddress(chainId, 'longPool')
  const longPoolReady = !isZeroAddress(longPoolAddress)

  const { data: totalDepositsData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'totalDeposits',
    chainId,
    query: { enabled: longPoolReady },
  })

  const { data: totalBorrowsData } = useReadContract({
    address: longPoolAddress,
    abi: LONG_POOL_ABI,
    functionName: 'totalBorrows',
    chainId,
    query: { enabled: longPoolReady },
  })

  const totalDeposits = totalDepositsData != null ? Number(formatEther(totalDepositsData as bigint)) : 0
  const totalBorrows = totalBorrowsData != null ? Number(formatEther(totalBorrowsData as bigint)) : 0
  const utilization = totalDeposits > 0 ? (totalBorrows / totalDeposits) * 100 : 0
  const depositAPY = totalDeposits > 0 ? (Math.pow(1 + calculateExponentialRate(utilization) / 100, 365) - 1) * 100 : 0
  const borrowAPY = totalDeposits > 0 ? (Math.pow(1 + calculateExponentialRate(utilization) / 100, 365) - 1) * 100 : 0
  const dailyRate = calculateExponentialRate(utilization)

  const rateChartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { top: 30, right: 20, bottom: 40, left: 60 },
    xAxis: {
      type: 'value' as const,
      name: 'Utilization %',
      nameLocation: 'middle' as const,
      nameGap: 25,
      min: 0,
      max: 100,
      axisLine: { lineStyle: { color: '#2a2a38' } },
      axisLabel: { color: '#666', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1a1a24' } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'Daily Rate %',
      nameLocation: 'middle' as const,
      nameGap: 45,
      min: 0,
      max: 80,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#1a1a24' } },
      axisLabel: { color: '#666', fontSize: 10 },
    },
    series: [{
      type: 'line' as const,
      data: rateCurveData.map((p) => [p.utilization, p.dailyRate]),
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#ff4444', width: 2.5 },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 68, 68, 0.4)' },
            { offset: 1, color: 'rgba(255, 68, 68, 0)' },
          ],
        },
      },
      markLine: {
        silent: true,
        lineStyle: { color: '#ffbb00', type: 'dashed' as const, width: 1 },
        data: [{ yAxis: 10, label: { formatter: '10%/day', color: '#ffbb00', fontSize: 10 } }],
      },
    }],
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#111118',
      borderColor: '#2a2a38',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: Array<{ value: [number, number] }>) => {
        const u = params[0].value[0]
        const r = params[0].value[1]
        return `Utilization: ${u}%<br/>Daily Rate: ${r.toFixed(2)}%<br/>APY: ${(Math.pow(1 + r / 100, 365) * 100).toFixed(0)}%`
      },
    },
  }), [])

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl mb-2">
          <Landmark className="w-8 h-8 inline-block mr-2 text-neon-purple" />
          {t('lend.title')}
        </h1>
        <p className="text-gray-400">{t('lend.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-dark">
          <p className="text-xs text-gray-400 mb-1">{t('lend.totalDeposits')}</p>
          <p className="text-2xl font-display font-bold neon-text">{formatUsdc(totalDeposits)} {nativeSymbol}</p>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> {utilization.toFixed(1)}% utilized
          </span>
        </div>
        <div className="card-dark border-neon-red/20">
          <p className="text-xs text-gray-400 mb-1">{t('lend.shortRate')}</p>
          <p className="text-2xl font-display font-bold text-neon-red">{dailyRate.toFixed(2)}%/day</p>
          <span className="text-xs text-neon-red">Utilization: {utilization.toFixed(1)}%</span>
        </div>
        <div className="card-dark border-neon-green/20">
          <p className="text-xs text-gray-400 mb-1">{t('lend.longApy')}</p>
          <p className="text-2xl font-display font-bold text-neon-green">{depositAPY.toFixed(2)}%</p>
          <span className="text-xs text-gray-400">{nativeSymbol} Deposit</span>
        </div>
        <div className="card-dark border-orange-500/20">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> {t('lend.totalBurned')}</p>
          <p className="text-2xl font-display font-bold text-orange-500">—</p>
          <span className="text-xs text-gray-400">Requires BuyAndBurn contract</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-dark">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-neon-green" />
              {t('lend.longPool')}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.bnbDeposits')}</p>
              <p className="font-display font-bold text-lg">{formatUsdc(totalDeposits)} {nativeSymbol}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.bnbBorrowed')}</p>
              <p className="font-display font-bold text-lg">{formatUsdc(totalBorrows)} {nativeSymbol}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.depositApy')}</p>
              <p className="font-display font-bold text-lg text-neon-green">{depositAPY.toFixed(2)}%</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.borrowApy')}</p>
              <p className="font-display font-bold text-lg">{borrowAPY.toFixed(2)}%</p>
            </div>
          </div>
          <div className="bg-neon-green/5 border border-neon-green/20 rounded-lg p-3">
            <p className="text-xs text-neon-green font-medium flex items-center gap-1">
              <Flame className="w-3 h-3" /> {t('lend.burnEngine')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('lend.longPoolDesc')}
            </p>
          </div>
        </div>

        <div className="card-dark border-neon-red/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-neon-red" />
              {t('lend.shortPool')}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.availableTokens')}</p>
              <p className="font-display font-bold text-lg">—</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.borrowedTokens')}</p>
              <p className="font-display font-bold text-lg text-neon-red">—</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.dailyRate')}</p>
              <p className="font-display font-bold text-lg text-neon-red">{dailyRate.toFixed(2)}%</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.collateralRatio')}</p>
              <p className="font-display font-bold text-lg">150%</p>
            </div>
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{t('lend.utilization')}</span>
              <span>{utilization.toFixed(1)}%</span>
            </div>
            <div className="progress-bar h-3">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  utilization > 70 ? 'bg-neon-red' : utilization > 40 ? 'bg-neon-yellow' : 'bg-neon-green'
                )}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
          </div>
          <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
            <p className="text-xs text-neon-red font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {t('lend.rateWarning')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('lend.rateWarningDesc')}
            </p>
          </div>
        </div>
      </div>

      <div className="card-dark">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          {t('lend.rateCurve')}
        </h2>
        <ReactECharts option={rateChartOption} style={{ height: '320px' }} />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4">
          {[
            { u: 10, label: '10%' },
            { u: 30, label: '30%' },
            { u: 50, label: '50%' },
            { u: 70, label: '70%' },
            { u: 85, label: '85%' },
            { u: 95, label: '95%' },
          ].map(({ u, label }) => (
            <div key={u} className="bg-dark-700 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">u={label}</p>
              <p className={cn(
                'font-display font-bold text-sm',
                calculateExponentialRate(u) > 10 ? 'text-neon-red' : calculateExponentialRate(u) > 3 ? 'text-neon-yellow' : 'text-gray-300'
              )}>
                {calculateExponentialRate(u).toFixed(2)}%/day
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="card-dark border-orange-500/10">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          {t('lend.burnEngine')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.totalBurned')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">tokens</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.bnbUsed')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">{nativeSymbol}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.burnRate')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">tokens/day</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.burnCount')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">executions</p>
          </div>
        </div>
        <div className="mt-4 bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('lend.burnEngineSource')}
          </p>
          <p className="text-sm text-gray-300 leading-relaxed mt-1">
            {t('lend.burnEngineAntiShort')}
          </p>
        </div>
      </div>

      <div className="card-dark overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-dark-500/50">
          <h2 className="font-display font-semibold text-lg">{t('lend.allAssets')}</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-gray-400 mb-2">No lending assets available</p>
          <p className="text-xs text-gray-500">Assets will appear here when tokens are listed on DEX</p>
        </div>
      </div>
    </div>
  )
}
