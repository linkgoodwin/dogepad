import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { getBscScanUrl } from '../config/contracts'

interface CopyableAddressProps {
  address: string
  chainId: number
  type?: 'address' | 'token'
  label?: string
  short?: boolean
  showExplorer?: boolean
  className?: string
}

export default function CopyableAddress({
  address,
  chainId,
  type = 'token',
  label,
  short = true,
  showExplorer = true,
  className = '',
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const display = label || (short ? `${address.slice(0, 6)}...${address.slice(-4)}` : address)

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-xs text-gray-400 font-mono truncate" title={address}>
        {display}
      </span>
      <button
        onClick={handleCopy}
        className="shrink-0 text-gray-500 hover:text-neon-green transition-colors"
        title="复制地址"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      {showExplorer && (
        <a
          href={getBscScanUrl(chainId, type, address)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-gray-500 hover:text-neon-green transition-colors"
          title="在浏览器中查看"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
