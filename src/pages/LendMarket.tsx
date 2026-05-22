import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Flame, AlertTriangle, ArrowRight, Coins } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { LONG_POOL_ABI, SHORT_POOL_ABI, LAUNCH_DAO_ABI, FEE_DISTRIBUTOR_ABI, getContractAddress, isZeroAddress, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'
import { calculateExponentialRate, rateCurveData } from '@/data/poolData'
import { cn, formatUsdc, formatTokenAmount } from '@/lib/utils'
import { useT } from '@/i18n/useT'

interface ShortPoolTokenData {
  address: string
  name: string
  symbol: string
  available: number
  borrowed: number
  utilization: number
  dailyRate: number
}

interface LongPoolTokenData {
  address: string
  name: string
  symbol: string
  deposits: number
  borrows: number
  utilization: number
  depositAPY: number
  dailyRate: number
}

export default function LendMarket() {
  const t = useT()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const longPoolAddress = getContractAddress(chainId, 'longPool')
  const shortPoolAddress = getContractAddress(chainId, 'shortPool')
  const daoAddress = getContractAddress(chainId, 'launchDAO')
  const longPoolReady = !isZeroAddress(longPoolAddress)
  const shortPoolReady = !isZeroAddress(shortPoolAddress)
  const daoReady = !isZeroAddress(daoAddress)

  const feeDistributorAddress = getContractAddress(chainId, 'feeDistributor')
  const feeReady = !isZeroAddress(feeDistributorAddress)

  const { data: feeTotalStakedData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'totalStakedDoge',
    chainId,
    query: { enabled: feeReady },
  })

  const { data: feeTotalDistributedData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'totalDistributed',
    chainId,
    query: { enabled: feeReady },
  })

  const { data: feeTotalBurnedData } = useReadContract({
    address: feeDistributorAddress,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'totalBurned',
    chainId,
    query: { enabled: feeReady },
  })

  const feeTotalStaked = feeTotalStakedData ? Number(formatEther(feeTotalStakedData as bigint)) : 0
  const feeTotalDistributed = feeTotalDistributedData ? Number(formatEther(feeTotalDistributedData as bigint)) : 0
  const feeTotalBurned = feeTotalBurnedData ? Number(formatEther(feeTotalBurnedData as bigint)) : 0

  const { data: candidateCountData } = useReadContract({
    address: daoAddress,
    abi: LAUNCH_DAO_ABI,
    functionName: 'getCandidateCount',
    chainId,
    query: { enabled: daoReady },
  })

  const candidateCount = candidateCountData ? Number(candidateCountData as bigint) : 0

  const allCandidateQueries = useMemo(() => {
    if (!candidateCount || !daoReady) return []
    return Array.from({ length: candidateCount }, (_, i) => ({
      address: daoAddress as `0x${string}`,
      abi: LAUNCH_DAO_ABI,
      functionName: 'candidates' as const,
      args: [BigInt(i)],
      chainId,
    }))
  }, [candidateCount, daoAddress, chainId, daoReady])

  const { data: allCandidatesData } = useReadContracts({
    contracts: allCandidateQueries,
    query: { enabled: allCandidateQueries.length > 0 },
  })

  const launchedTokenAddresses = useMemo(() => {
    if (!allCandidatesData) return [] as { address: string; name: string; symbol: string }[]
    const tokens: { address: string; name: string; symbol: string }[] = []
    allCandidatesData.forEach((result) => {
      if (result.status !== 'success' || !result.result) return
      const raw = result.result as any
      const wasLaunched = Boolean(raw.wasLaunched ?? raw[13] ?? false)
      const launchedToken = String(raw.launchedToken ?? raw[14] ?? '')
      if (wasLaunched && !isZeroAddress(launchedToken as `0x${string}`)) {
        tokens.push({
          address: launchedToken,
          name: String(raw.name ?? raw[1] ?? ''),
          symbol: String(raw.symbol ?? raw[2] ?? ''),
        })
      }
    })
    return tokens
  }, [allCandidatesData])

  const longPoolQueries = useMemo(() => {
    if (!longPoolReady || launchedTokenAddresses.length === 0) return []
    const queries: Array<{
      address: `0x${string}`
      abi: typeof LONG_POOL_ABI
      functionName: 'tokenDeposits' | 'tokenBorrows' | 'getUtilization' | 'getDailyRate'
      args: [`0x${string}`]
      chainId: number
    }> = []
    for (const token of launchedTokenAddresses) {
      const addr = token.address as `0x${string}`
      queries.push({ address: longPoolAddress as `0x${string}`, abi: LONG_POOL_ABI, functionName: 'tokenDeposits', args: [addr], chainId })
      queries.push({ address: longPoolAddress as `0x${string}`, abi: LONG_POOL_ABI, functionName: 'tokenBorrows', args: [addr], chainId })
      queries.push({ address: longPoolAddress as `0x${string}`, abi: LONG_POOL_ABI, functionName: 'getUtilization', args: [addr], chainId })
      queries.push({ address: longPoolAddress as `0x${string}`, abi: LONG_POOL_ABI, functionName: 'getDailyRate', args: [addr], chainId })
    }
    return queries
  }, [longPoolReady, longPoolAddress, launchedTokenAddresses, chainId])

  const { data: longPoolData } = useReadContracts({
    contracts: longPoolQueries,
    query: { enabled: longPoolQueries.length > 0 },
  })

  const longPoolTokens: LongPoolTokenData[] = useMemo(() => {
    if (!longPoolData || launchedTokenAddresses.length === 0) return []
    return launchedTokenAddresses.map((token, i) => {
      const base = i * 4
      const deposits = longPoolData[base]?.status === 'success' && longPoolData[base].result != null
        ? Number(formatEther(longPoolData[base].result as bigint)) : 0
      const borrows = longPoolData[base + 1]?.status === 'success' && longPoolData[base + 1].result != null
        ? Number(formatEther(longPoolData[base + 1].result as bigint)) : 0
      const util = longPoolData[base + 2]?.status === 'success' && longPoolData[base + 2].result != null
        ? Number(longPoolData[base + 2].result as bigint) / 1e16 : 0
      const dailyRate = longPoolData[base + 3]?.status === 'success' && longPoolData[base + 3].result != null
        ? Number(longPoolData[base + 3].result as bigint) / 1e16 : 0
      const depositAPY = (Math.pow(1 + dailyRate / 100, 365) - 1) * 100
      return {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        deposits,
        borrows,
        utilization: util,
        depositAPY,
        dailyRate,
      }
    }).filter(t => t.deposits > 0 || t.borrows > 0)
  }, [longPoolData, launchedTokenAddresses])

  const totalDeposits = useMemo(() => longPoolTokens.reduce((sum, t) => sum + t.deposits, 0), [longPoolTokens])
  const totalBorrows = useMemo(() => longPoolTokens.reduce((sum, t) => sum + t.borrows, 0), [longPoolTokens])
  const longUtilization = totalDeposits > 0 ? (totalBorrows / totalDeposits) * 100 : 0
  const avgDepositAPY = useMemo(() => {
    if (totalDeposits === 0) return 0
    return longPoolTokens.reduce((sum, t) => sum + t.depositAPY * t.deposits, 0) / totalDeposits
  }, [longPoolTokens, totalDeposits])

  const shortPoolQueries = useMemo(() => {
    if (!shortPoolReady || launchedTokenAddresses.length === 0) return []
    const queries: Array<{
      address: `0x${string}`
      abi: typeof SHORT_POOL_ABI
      functionName: 'tokenAvailable' | 'tokenBorrowed' | 'getUtilization' | 'getDailyRate'
      args: [`0x${string}`]
      chainId: number
    }> = []
    for (const token of launchedTokenAddresses) {
      const addr = token.address as `0x${string}`
      queries.push({ address: shortPoolAddress as `0x${string}`, abi: SHORT_POOL_ABI, functionName: 'tokenAvailable', args: [addr], chainId })
      queries.push({ address: shortPoolAddress as `0x${string}`, abi: SHORT_POOL_ABI, functionName: 'tokenBorrowed', args: [addr], chainId })
      queries.push({ address: shortPoolAddress as `0x${string}`, abi: SHORT_POOL_ABI, functionName: 'getUtilization', args: [addr], chainId })
      queries.push({ address: shortPoolAddress as `0x${string}`, abi: SHORT_POOL_ABI, functionName: 'getDailyRate', args: [addr], chainId })
    }
    return queries
  }, [shortPoolReady, shortPoolAddress, launchedTokenAddresses, chainId])

  const { data: shortPoolData } = useReadContracts({
    contracts: shortPoolQueries,
    query: { enabled: shortPoolQueries.length > 0 },
  })

  const shortPoolTokens: ShortPoolTokenData[] = useMemo(() => {
    if (!shortPoolData || launchedTokenAddresses.length === 0) return []
    return launchedTokenAddresses.map((token, i) => {
      const base = i * 4
      const available = shortPoolData[base]?.status === 'success' && shortPoolData[base].result != null
        ? Number(formatEther(shortPoolData[base].result as bigint)) : 0
      const borrowed = shortPoolData[base + 1]?.status === 'success' && shortPoolData[base + 1].result != null
        ? Number(formatEther(shortPoolData[base + 1].result as bigint)) : 0
      const util = shortPoolData[base + 2]?.status === 'success' && shortPoolData[base + 2].result != null
        ? Number(shortPoolData[base + 2].result as bigint) / 1e16 : 0
      const dailyRate = shortPoolData[base + 3]?.status === 'success' && shortPoolData[base + 3].result != null
        ? Number(shortPoolData[base + 3].result as bigint) / 1e16 : 0
      return {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        available,
        borrowed,
        utilization: util,
        dailyRate,
      }
    }).filter(t => t.available > 0 || t.borrowed > 0)
  }, [shortPoolData, launchedTokenAddresses])

  const rateChartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { top: 30, right: 20, bottom: 40, left: 60 },
    xAxis: {
      type: 'value' as const,
      name: t('lend.chart.utilization'),
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
      name: t('lend.chart.dailyRate'),
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
        data: [{ yAxis: 10, label: { formatter: t('lend.chart.tenPercentDay'), color: '#ffbb00', fontSize: 10 } }],
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
        return t('lend.chart.tooltip', { u: String(u), r: r.toFixed(2), apy: (Math.pow(1 + r / 100, 365) * 100).toFixed(0) })
      },
    },
  }), [t])

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl mb-2">
          <Landmark className="w-8 h-8 inline-block mr-2 text-neon-purple" />
          {t('lend.title')}
        </h1>
        <p className="text-gray-400">{t('lend.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-dark border-neon-green/20">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neon-green" /> {t('lend.longPool')}
          </p>
          <p className="text-2xl font-display font-bold text-neon-green">{formatUsdc(totalDeposits)}</p>
          <span className="text-xs text-gray-400">{nativeSymbol} {t('lend.depositLabel')} · {longUtilization.toFixed(1)}% {t('lend.utilized')}</span>
        </div>
        <div className="card-dark border-neon-green/20">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neon-green" /> {t('lend.longApy')}
          </p>
          <p className="text-2xl font-display font-bold text-neon-green">{avgDepositAPY.toFixed(2)}%</p>
          <span className="text-xs text-gray-400">{t('lend.depositApy')} · {t('lend.longMarkets')} {longPoolTokens.length}</span>
        </div>
        <div className="card-dark border-neon-red/20">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neon-red" /> {t('lend.shortMarkets')}
          </p>
          <p className="text-2xl font-display font-bold text-neon-red">{shortPoolTokens.length}</p>
          <span className="text-xs text-gray-400">{t('lend.shortMarketsDesc')}</span>
        </div>
        <div className="card-dark border-doge-gold/20">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Coins className="w-3 h-3 text-doge-gold" /> {t('fee.dividendPool')}
          </p>
          <p className="text-2xl font-display font-bold text-doge-gold">{formatTokenAmount(feeTotalStaked)}</p>
          <span className="text-xs text-gray-400">DOGE {t('fee.stakedDoge')} · 30% {t('fee.dividendRatio')}</span>
        </div>
      </div>

      <div className="card-dark overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-dark-500/50 flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-neon-green" />
            {t('lend.longTokenList')}
          </h2>
          <span className="text-xs text-gray-400">{longPoolTokens.length} {t('lend.longMarketsUnit')}</span>
        </div>
        {longPoolTokens.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-500/30 text-gray-400 text-xs">
                  <th className="px-4 py-3 text-left font-medium">{t('lend.table.token')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.deposits')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.borrowed')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.utilization')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.depositApy')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.dailyRate')}</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {longPoolTokens.map((token) => (
                  <tr key={token.address} className="border-b border-dark-500/10 hover:bg-dark-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center shrink-0">
                          <span className="font-display font-bold text-xs text-neon-green">{token.symbol.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-display font-semibold text-white text-sm">{token.name}</p>
                          <p className="text-xs text-gray-500">{token.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{formatUsdc(token.deposits)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-neon-red">{formatUsdc(token.borrows)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              token.utilization > 70 ? 'bg-neon-red' : token.utilization > 40 ? 'bg-neon-yellow' : 'bg-neon-green'
                            )}
                            style={{ width: `${Math.min(token.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">{token.utilization.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-display font-semibold text-neon-green">
                        {token.depositAPY.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        'font-display font-semibold',
                        token.dailyRate > 10 ? 'text-neon-red' : token.dailyRate > 3 ? 'text-neon-yellow' : 'text-gray-300'
                      )}>
                        {token.dailyRate.toFixed(2)}%
                      </span>
                      <span className="text-xs text-gray-500">{t('common.perDay')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/lend/long/${token.address}`}
                        className="text-xs text-doge-gold hover:underline flex items-center gap-1 justify-end"
                      >
                        {t('lend.table.long')} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
              <span className="text-2xl">📈</span>
            </div>
            <p className="text-gray-400 mb-2">{t('lend.noLongMarkets')}</p>
            <p className="text-xs text-gray-500">{t('lend.noLongMarketsDesc')}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-dark border-neon-green/10">
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
              <p className="font-display font-bold text-lg text-neon-green">{avgDepositAPY.toFixed(2)}%</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.longMarkets')}</p>
              <p className="font-display font-bold text-lg text-neon-green">{longPoolTokens.length}</p>
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
              <p className="text-xs text-gray-400">{t('lend.shortMarkets')}</p>
              <p className="font-display font-bold text-lg text-neon-red">{shortPoolTokens.length}</p>
            </div>
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400">{t('lend.collateralRatio')}</p>
              <p className="font-display font-bold text-lg">150%</p>
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

      <div className="card-dark border-doge-gold/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Coins className="w-5 h-5 text-doge-gold" />
            {t('fee.dividendPool')}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-dark-700 rounded-lg p-3">
            <p className="text-xs text-gray-400">{t('fee.totalStaked')}</p>
            <p className="font-display font-bold text-lg text-doge-gold">{formatTokenAmount(feeTotalStaked)} DOGE</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-3">
            <p className="text-xs text-gray-400">{t('fee.totalDistributed')}</p>
            <p className="font-display font-bold text-lg text-neon-green">{formatUsdc(feeTotalDistributed)} {nativeSymbol}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-3">
            <p className="text-xs text-gray-400">{t('fee.totalBurned')}</p>
            <p className="font-display font-bold text-lg text-orange-500">{formatUsdc(feeTotalBurned)} {nativeSymbol}</p>
          </div>
        </div>
        <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-3">
          <p className="text-xs text-doge-gold font-medium">{t('fee.stakeDogeToEarn')}</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-400">
            <span>30% → {t('fee.stakedDoge')}</span>
            <span>20% → {t('lend.burnEngine')}</span>
            <span>50% → {t('lend.longPool')}</span>
          </div>
        </div>
      </div>

      <div className="card-dark overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-dark-500/50 flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">{t('lend.shortTokenList')}</h2>
          <span className="text-xs text-gray-400">{shortPoolTokens.length} {t('lend.shortMarketsUnit')}</span>
        </div>
        {shortPoolTokens.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-500/30 text-gray-400 text-xs">
                  <th className="px-4 py-3 text-left font-medium">{t('lend.table.token')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.available')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.borrowed')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.utilization')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('lend.table.dailyRate')}</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shortPoolTokens.map((token) => (
                  <tr key={token.address} className="border-b border-dark-500/10 hover:bg-dark-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center shrink-0">
                          <span className="font-display font-bold text-xs text-doge-gold">{token.symbol.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-display font-semibold text-white text-sm">{token.name}</p>
                          <p className="text-xs text-gray-500">{token.symbol}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{formatTokenAmount(token.available)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-neon-red">{formatTokenAmount(token.borrowed)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              token.utilization > 70 ? 'bg-neon-red' : token.utilization > 40 ? 'bg-neon-yellow' : 'bg-neon-green'
                            )}
                            style={{ width: `${Math.min(token.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">{token.utilization.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        'font-display font-semibold',
                        token.dailyRate > 10 ? 'text-neon-red' : token.dailyRate > 3 ? 'text-neon-yellow' : 'text-gray-300'
                      )}>
                        {token.dailyRate.toFixed(2)}%
                      </span>
                      <span className="text-xs text-gray-500">{t('common.perDay')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/lend/short/${token.address}`}
                        className="text-xs text-doge-gold hover:underline flex items-center gap-1 justify-end"
                      >
                        {t('lend.table.short')} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
              <span className="text-2xl">📉</span>
            </div>
            <p className="text-gray-400 mb-2">{t('lend.noShortMarkets')}</p>
            <p className="text-xs text-gray-500">{t('lend.noShortMarketsDesc')}</p>
          </div>
        )}
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
                {calculateExponentialRate(u).toFixed(2)}%{t('common.perDay')}
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
            <p className="text-xs text-gray-400">{t('lend.tokens')}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.bnbUsed')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">{nativeSymbol}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.burnRate')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">{t('lend.tokensPerDay')}</p>
          </div>
          <div className="bg-dark-700 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{t('lend.burn.burnCount')}</p>
            <p className="text-xl font-display font-bold text-orange-500">—</p>
            <p className="text-xs text-gray-400">{t('lend.executions')}</p>
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
    </div>
  )
}
