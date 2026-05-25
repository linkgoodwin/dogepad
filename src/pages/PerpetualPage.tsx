import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ethers } from 'ethers'
import { getContractAddress, DEFAULT_CHAIN_ID } from '../config/contracts'
import KLineChart from '../components/KLineChart'
import { useKLineData } from '../hooks/useKLineData'
import { KLineSource } from '../hooks/useKLineData'

const PERP_ABI = [
  'function openPosition(address token, bool isLong, uint256 marginUsdc, uint256 leverage) payable',
  'function closePosition(address token) external',
  'function getPosition(address user, address token) view returns (uint256 margin, uint256 size, uint256 entryPrice, uint256 lastFundingTime, bool isLong, bool isActive)',
  'function getMarginRatio(address user, address token) view returns (uint256)',
  'function getPnl(address user, address token) view returns (int256)',
  'function getOpenInterest(address token) view returns (uint256 longOI, uint256 shortOI)',
  'function getMarkPrice(address token) view returns (uint256)',
  'function getNextFundingTime(address token) view returns (uint256)',
]

const ORACLE_ABI = ['function getPrice(address token) view returns (uint256)']

export default function PerpetualPage() {
  const { address } = useAccount()
  const chainId = DEFAULT_CHAIN_ID

  const getSigner = async () => {
    if (typeof (window as any).ethereum === 'undefined') return null
    const browserProvider = new ethers.providers.Web3Provider((window as any).ethereum)
    await browserProvider.send('eth_requestAccounts', [])
    return browserProvider.getSigner()
  }

  const getProvider = () => {
    return new ethers.providers.JsonRpcProvider('https://rpc.testnet.arc.network')
  }

  const [tokenAddress, setTokenAddress] = useState('')
  const [isLong, setIsLong] = useState(true)
  const [margin, setMargin] = useState('0.1')
  const [leverage, setLeverage] = useState('5')
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState<any>(null)
  const [markPrice, setMarkPrice] = useState<string>('-')
  const [pnl, setPnl] = useState<string>('-')
  const [marginRatio, setMarginRatio] = useState<string>('-')
  const [openInterest, setOpenInterest] = useState<{ long: string; short: string }>({ long: '-', short: '-' })
  const [klineSource, setKlineSource] = useState<KLineSource>('perpetual')

  const { klineData, loading: klineLoading, refresh: refreshKline } = useKLineData(
    tokenAddress,
    klineSource,
    60_000
  )

  const perpPool = getContractAddress(chainId, 'perpetualPool')
  const priceOracle = getContractAddress(chainId, 'priceOracle')

  const fetchPosition = async () => {
    if (!perpPool || !tokenAddress || !address) return
    try {
      const provider = getProvider()
      const contract = new ethers.Contract(perpPool, PERP_ABI, provider)
      const pos = await contract.getPosition(address, tokenAddress)
      setPosition({
        margin: ethers.utils.formatEther(pos.margin),
        size: ethers.utils.formatEther(pos.size),
        entryPrice: ethers.utils.formatEther(pos.entryPrice),
        isLong: pos.isLong,
        isActive: pos.isActive,
      })

      if (pos.isActive) {
        const ratio = await contract.getMarginRatio(address, tokenAddress)
        setMarginRatio((parseFloat(ethers.utils.formatEther(ratio)) * 100).toFixed(2) + '%')

        const pnlVal = await contract.getPnl(address, tokenAddress)
        setPnl(ethers.utils.formatEther(pnlVal))
      }

      const oi = await contract.getOpenInterest(tokenAddress)
      setOpenInterest({
        long: ethers.utils.formatEther(oi.longOI),
        short: ethers.utils.formatEther(oi.shortOI),
      })
    } catch (err) {
      console.error('Fetch position failed:', err)
    }
  }

  const fetchMarkPrice = async () => {
    if (!priceOracle || !tokenAddress) return
    try {
      const provider = getProvider()
      const oracle = new ethers.Contract(priceOracle, ORACLE_ABI, provider)
      const price = await oracle.getPrice(tokenAddress)
      setMarkPrice(ethers.utils.formatEther(price))
    } catch (err) {
      console.error('Fetch price failed:', err)
    }
  }

  const handleOpenPosition = async () => {
    if (!perpPool || !tokenAddress) return
    setLoading(true)
    try {
      const signer = await getSigner()
      if (!signer) return
      const contract = new ethers.Contract(perpPool, PERP_ABI, signer)
      const marginUsdc = ethers.utils.parseEther(margin)
      const leverageVal = ethers.utils.parseEther(leverage)
      const tx = await contract.openPosition(tokenAddress, isLong, marginUsdc, leverageVal, {
        value: marginUsdc,
        gasLimit: 500_000,
      })
      await tx.wait()
      await fetchPosition()
      refreshKline()
    } catch (err: any) {
      console.error('Open position failed:', err)
      alert('Open position failed: ' + (err.reason || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleClosePosition = async () => {
    if (!perpPool || !tokenAddress) return
    setLoading(true)
    try {
      const signer = await getSigner()
      if (!signer) return
      const contract = new ethers.Contract(perpPool, PERP_ABI, signer)
      const tx = await contract.closePosition(tokenAddress, { gasLimit: 500_000 })
      await tx.wait()
      setPosition(null)
      setPnl('-')
      setMarginRatio('-')
      await fetchPosition()
      refreshKline()
    } catch (err: any) {
      console.error('Close position failed:', err)
      alert('Close position failed: ' + (err.reason || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Perpetual Trading</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-slate-400">K-Line Source:</span>
                {(['perpetual', 'dex', 'bondingCurve'] as KLineSource[]).map((src) => (
                  <button
                    key={src}
                    onClick={() => setKlineSource(src)}
                    className={`px-3 py-1 rounded text-xs ${
                      klineSource === src
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {src === 'perpetual' ? 'Perp' : src === 'dex' ? 'DEX' : 'Curve'}
                  </button>
                ))}
                <button
                  onClick={refreshKline}
                  className="ml-auto px-3 py-1 rounded text-xs bg-slate-800 text-slate-400 hover:bg-slate-700"
                >
                  Refresh
                </button>
              </div>
              {klineLoading ? (
                <div className="h-[400px] flex items-center justify-center text-slate-500">
                  Loading K-Line data...
                </div>
              ) : klineData.length > 0 ? (
                <KLineChart data={klineData} height={400} />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-500">
                  No trade data available
                </div>
              )}
            </div>

            <div className="bg-slate-900 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Market Info</h3>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500">Mark Price</div>
                  <div className="text-lg font-mono">{markPrice}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Long OI</div>
                  <div className="text-lg font-mono text-green-400">{openInterest.long}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Short OI</div>
                  <div className="text-lg font-mono text-red-400">{openInterest.short}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Margin Ratio</div>
                  <div className="text-lg font-mono">{marginRatio}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-900 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Open Position</h3>

              <div className="mb-3">
                <label className="text-xs text-slate-500">Token Address</label>
                <input
                  type="text"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full mt-1 px-3 py-2 bg-slate-800 rounded-lg text-sm font-mono border border-slate-700 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setIsLong(true)
                    fetchMarkPrice()
                  }}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm ${
                    isLong ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Long
                </button>
                <button
                  onClick={() => {
                    setIsLong(false)
                    fetchMarkPrice()
                  }}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm ${
                    !isLong ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Short
                </button>
              </div>

              <div className="mb-3">
                <label className="text-xs text-slate-500">Margin (USDC)</label>
                <input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="w-full mt-1 px-3 py-2 bg-slate-800 rounded-lg text-sm font-mono border border-slate-700 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="text-xs text-slate-500">Leverage: {leverage}x</label>
                <input
                  type="range"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  min="1"
                  max="10"
                  step="1"
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>1x</span>
                  <span>5x</span>
                  <span>10x</span>
                </div>
              </div>

              <div className="mb-3 p-2 bg-slate-800 rounded-lg text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Position Size</span>
                  <span>{(parseFloat(margin || '0') * parseFloat(leverage || '1')).toFixed(4)} USDC</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">Entry Price</span>
                  <span>{markPrice}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">Liquidation Price</span>
                  <span className="text-red-400">
                    {markPrice !== '-' && isLong
                      ? (parseFloat(markPrice) * (1 - 0.9 / parseFloat(leverage))).toFixed(6)
                      : markPrice !== '-' && !isLong
                      ? (parseFloat(markPrice) * (1 + 0.9 / parseFloat(leverage))).toFixed(6)
                      : '-'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleOpenPosition}
                disabled={loading || !tokenAddress}
                className={`w-full py-3 rounded-lg font-semibold text-sm ${
                  isLong
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-900'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-900'
                } disabled:opacity-50`}
              >
                {loading ? 'Opening...' : `Open ${isLong ? 'Long' : 'Short'} ${leverage}x`}
              </button>
            </div>

            {position?.isActive && (
              <div className="bg-slate-900 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Your Position</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Direction</span>
                    <span className={position.isLong ? 'text-green-400' : 'text-red-400'}>
                      {position.isLong ? 'Long' : 'Short'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Size</span>
                    <span>{position.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Entry Price</span>
                    <span>{position.entryPrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Margin</span>
                    <span>{position.margin} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PnL</span>
                    <span className={parseFloat(pnl) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {pnl} USDC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Margin Ratio</span>
                    <span>{marginRatio}</span>
                  </div>
                </div>

                <button
                  onClick={handleClosePosition}
                  disabled={loading}
                  className="w-full mt-4 py-2 rounded-lg font-semibold text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                >
                  {loading ? 'Closing...' : 'Close Position'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
