import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'

interface Token {
  name: string
  symbol: string
  address: string
  priceBnb: string
  priceChange24h: number
  marketCap: string
  volume24h: string
  progress: number
  isListedOnDex: boolean
  logoUrl?: string
}

interface TokenCardProps {
  token: Token
}

export default function TokenCard({ token }: TokenCardProps) {
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)
  return (
    <Link to={`/token/${token.address}`} className="block">
      <div className="card-dark cursor-pointer">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center overflow-hidden shrink-0">
            {token.logoUrl ? (
              <img src={token.logoUrl} alt={token.name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-bold text-doge-gold">
                {token.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-white truncate">{token.name}</span>
              <span className="text-xs text-gray-400">{token.symbol}</span>
            </div>
          </div>
          {token.isListedOnDex ? (
            <span className="badge-gold">DEX</span>
          ) : (
            <span className="badge-cyan">内盘</span>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400">Price</p>
            <p className="font-display font-bold text-white">{token.priceBnb} {nativeSymbol}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">24h</p>
            <span
              className={cn(
                'font-display font-semibold',
                token.priceChange24h >= 0 ? 'text-doge-gold' : 'text-doge-ember'
              )}
            >
              {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
          <span>Progress to DEX</span>
          <span>{token.progress.toFixed(1)}%</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(token.progress, 100)}%` }}
          />
        </div>
      </div>
    </Link>
  )
}
