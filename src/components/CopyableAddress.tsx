import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { getBscScanUrl } from '../config/contracts'
import { useT } from '@/i18n/useT'

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
  const { t } = useT()

  if (!address || typeof address !== 'string') return null

  const safeAddr = String(address)
  const safeChainId = typeof chainId === 'number' ? chainId : 0

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(safeAddr)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const display = label || (short ? `${safeAddr.slice(0, 6)}...${safeAddr.slice(-4)}` : safeAddr)

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-xs text-gray-400 font-mono truncate" title={safeAddr}>{display}</span>
      <button
        onClick={handleCopy}
        className="shrink-0 text-gray-500 hover:text-neon-green transition-colors"
        title={t('common.copyAddress')}
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
      {showExplorer && safeChainId > 0 && (
        <a
          href={getBscScanUrl(safeChainId, type, safeAddr)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-gray-500 hover:text-neon-green transition-colors"
          title={t('common.viewOnExplorer')}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
