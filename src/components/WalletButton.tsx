import { useState, useRef, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useChainId } from 'wagmi'
import { Wallet, ChevronDown, LogOut, Copy, Check, ExternalLink, X, Globe, AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useNetworkSwitcher, useTargetChainId } from '@/hooks/useNetwork'
import { cn, formatUsdc } from '@/lib/utils'
import { fixWalletNetwork } from '@/config/wagmi'
import { getNativeSymbol } from '@/config/contracts'

function truncateAddress(address: string | undefined) {
  if (!address || typeof address !== 'string') return '...'
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

const WALLET_ICONS: Record<string, { gradient: string; svg: string }> = {
  metamask: {
    gradient: 'from-orange-500/20 to-orange-600/10',
    svg: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M34.4 4L20.8 14.2l2.5-5.9L34.4 4z" fill="#E2761B" stroke="#E2761B" stroke-width=".1"/><path d="M5.6 4l13.5 10.3-2.4-6L5.6 4z" fill="#E4761B" stroke="#E4761B" stroke-width=".1"/><path d="M29.4 27.8l-3.6 5.5 7.7 2.1 2.2-7.5-6.3-.1zM4.3 27.9l2.2 7.5 7.7-2.1-3.6-5.5-6.3.1z" fill="#D7C1B3" stroke="#D7C1B3" stroke-width=".1"/><path d="M13.8 17.7l-2.1 3.2 7.6.3-.3-8.2-5.2 4.7zM26.2 17.7l-5.3-4.8-.2 8.3 7.6-.3-2.1-3.2z" fill="#233447" stroke="#233447" stroke-width=".1"/><path d="M10.2 27.9l4-7.8-5.5.1 1.5 7.7zM29.8 20.2l-5.5-.1 4 7.8 1.5-7.7zM21.3 20.1l-.5-4.2-2.1-5.7h-1l1.4 7.7.2 2.2.1 3.5 7.6-.3-.1-3.2-5.6-.1v.1z" fill="#CD6116" stroke="#CD6116" stroke-width=".1"/><path d="M20.8 20.2l-.1 3.5-.2 2.2-1.4 7.7h1l2.1-5.7.5-4.2-1.9-3.5z" fill="#E4751F" stroke="#E4751B" stroke-width=".1"/></svg>`,
  },
  okxwallet: {
    gradient: 'from-gray-600/20 to-gray-700/10',
    svg: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="10" height="10" rx="2" fill="#fff"/><rect x="18" y="6" width="10" height="10" rx="2" fill="#fff"/><rect x="6" y="18" width="10" height="10" rx="2" fill="#fff"/><rect x="18" y="18" width="10" height="10" rx="2" fill="#fff"/></svg>`,
  },
  binance: {
    gradient: 'from-yellow-500/20 to-yellow-600/10',
    svg: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 17.7L20 12.2l5.5 5.5 3.2-3.2L20 8 11.3 14.5l3.2 3.2zM8 20l3.2-3.2L14.4 20l-3.2 3.2L8 20zm6.5 2.3L20 27.8l5.5-5.5 3.2 3.2L20 32l-8.7-6.5-.2-.1 3.4-3.1zm11.1-2.3l3.2-3.2L32 20l-3.2 3.2-3.2-3.2zm-5.6 0L20 19.8 18 20l-.4.4L20 22.8 22.4 20.4l-.4-.4z" fill="#F0B90B"/></svg>`,
  },
  walletconnect: {
    gradient: 'from-blue-500/20 to-blue-600/10',
    svg: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.3 16.1c4.3-4.2 11.2-4.2 15.4 0l.5.5c.2.2.2.5 0 .6l-1.8 1.7c-.1.1-.2.1-.3 0l-.7-.7c-3-2.9-7.8-2.9-10.8 0l-.8.8c-.1.1-.2.1-.3 0L12.2 17c-.2-.2-.2-.5 0-.6l.1-.3zm19 3.5l1.6 1.5c.2.2.2.5 0 .6l-7.2 7c-.2.2-.5.2-.7 0l-5.1-5c0 0-.1 0-.1 0l-5.1 5c-.2.2-.5.2-.7 0l-7.2-7c-.2-.2-.2-.5 0-.6l1.6-1.5c.2-.2.5-.2.7 0l5.1 5c0 0 .1 0 .1 0l5.1-5c.2-.2.5-.2.7 0l5.1 5c0 0 .1 0 .1 0l5.1-5c.2-.2.5-.2.7 0z" fill="#3B99FC"/></svg>`,
  },
}

function getWalletIcon(connectorId: string) {
  if (WALLET_ICONS[connectorId]) return WALLET_ICONS[connectorId]
  return {
    gradient: 'from-doge-gold/20 to-doge-gold/5',
    svg: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="12" width="24" height="18" rx="3" stroke="#f59e0b" stroke-width="2" fill="none"/><path d="M8 17h24" stroke="#f59e0b" stroke-width="2"/><circle cx="27" cy="22" r="2.5" fill="#f59e0b"/></svg>`,
  }
}

export default function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const { isWrongNetwork, isTestnetMode, networkName, switchToDefault, targetChainId } = useNetworkSwitcher()
  const nativeSymbol = getNativeSymbol(targetChainId)
  const [showModal, setShowModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const t = useT()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleConnect = (connector: any) => {
    setConnecting(connector.uid)
    connect({ connector }, {
      onSettled: () => setConnecting(null),
    })
    setShowModal(false)
  }

  if (!isConnected) {
    return (
      <>
        <button
          className="group relative flex items-center gap-2 bg-gradient-to-r from-doge-gold to-doge-gold-light text-dark-950 font-display font-bold px-5 py-2 rounded-lg transition-all duration-300 hover:shadow-gold hover:scale-[1.02] active:scale-95 overflow-hidden"
          onClick={() => setShowModal(true)}
        >
          <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <Wallet className="w-4 h-4 relative z-10" />
          <span className="relative z-10">{t('common.connect')}</span>
        </button>

        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative bg-dark-800/95 backdrop-blur-xl border border-dark-500/50 rounded-2xl p-6 w-[380px] max-h-[85vh] overflow-auto shadow-2xl animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-display font-bold text-xl text-white">{t('common.connect')}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t('common.chooseWallet')}</p>
                </div>
                <button
                  className="w-8 h-8 rounded-lg bg-dark-700 border border-dark-500/50 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-400 transition-all"
                  onClick={() => setShowModal(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {connectors.map((connector) => {
                  const icon = getWalletIcon(connector.id)
                  const isConnecting = connecting === connector.uid
                  return (
                    <button
                      key={connector.uid}
                      className="w-full group flex items-center gap-4 p-3.5 rounded-xl bg-gradient-to-r from-dark-700/80 to-dark-700/40 border border-dark-500/30 hover:border-doge-gold/40 hover:from-dark-700 hover:to-dark-600/60 transition-all duration-300 disabled:opacity-50"
                      onClick={() => handleConnect(connector)}
                      disabled={!!connecting}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${icon.gradient} border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}
                        dangerouslySetInnerHTML={{ __html: icon.svg }}
                      />
                      <div className="flex-1 text-left">
                        <span className="font-display font-semibold text-sm text-white group-hover:text-doge-gold transition-colors">
                          {connector.name}
                        </span>
                        {connector.id === 'metamask' && (
                          <span className="block text-[10px] text-gray-500">{t('common.popular')}</span>
                        )}
                      </div>
                      {isConnecting ? (
                        <div className="w-5 h-5 border-2 border-doge-gold/30 border-t-doge-gold rounded-full animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-doge-gold/60 transition-colors" />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-dark-500/30">
                <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                  {t('common.termsAndRisks')}
                </p>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="relative flex items-center gap-2" ref={dropdownRef}>
      {isWrongNetwork ? (
        <button
          onClick={switchToDefault}
          className="flex items-center gap-1.5 bg-neon-red/10 border border-neon-red/30 rounded-xl px-3 py-2 hover:border-neon-red/60 transition-all"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-neon-red" />
          <span className="text-xs font-semibold text-neon-red">{t('common.wrongNetwork')}</span>
        </button>
      ) : (
        <div className={cn(
          'flex items-center gap-1.5 rounded-xl px-3 py-2 border',
          isTestnetMode
            ? 'bg-neon-yellow/5 border-neon-yellow/20'
            : 'bg-neon-green/5 border-neon-green/20'
        )}>
          <Globe className={cn('w-3.5 h-3.5', isTestnetMode ? 'text-neon-yellow' : 'text-neon-green')} />
          <span className={cn('text-xs font-semibold', isTestnetMode ? 'text-neon-yellow' : 'text-neon-green')}>
            {networkName}
          </span>
        </div>
      )}

      <button
        className="flex items-center gap-2.5 bg-dark-700/80 border border-dark-500/40 rounded-xl px-4 py-2 hover:border-doge-gold/40 transition-all duration-300 group"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="font-display text-sm font-semibold tracking-wide">{truncateAddress(address)}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-dark-800/95 backdrop-blur-xl border border-dark-500/50 rounded-2xl p-5 shadow-2xl animate-slide-up z-50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{t('common.address')}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-doge-gold transition-colors"
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">{t('common.copied')}</span></>
              ) : (
                <><Copy className="w-3.5 h-3.5" /><span>{t('common.copy')}</span></>
              )}
            </button>
          </div>
          <p className="text-sm font-mono text-gray-300 mb-4 bg-dark-900/50 rounded-lg px-3 py-2 break-all border border-dark-500/20">
            {address}
          </p>

          <div className="bg-gradient-to-br from-dark-700/60 to-dark-700/30 rounded-xl p-4 mb-4 border border-dark-500/20">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{t('common.balance')}</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-display font-bold gold-text">
                {balance ? formatUsdc(parseFloat(balance.formatted)) : '0'}
              </span>
              <span className="text-sm text-gray-400 font-display">{nativeSymbol}</span>
            </div>
          </div>

          <button
            className="w-full flex items-center justify-center gap-2 bg-neon-yellow/10 text-neon-yellow font-display font-semibold py-2.5 rounded-xl border border-neon-yellow/20 hover:bg-neon-yellow/20 hover:border-neon-yellow/40 transition-all duration-200 mb-2"
            onClick={async () => {
              await fixWalletNetwork(targetChainId)
              setShowDropdown(false)
            }}
          >
            <Globe className="w-4 h-4" />
            {t('common.fixRpcNode')}
          </button>

          <button
            className="w-full flex items-center justify-center gap-2 bg-doge-ember/10 text-doge-ember font-display font-semibold py-2.5 rounded-xl border border-doge-ember/20 hover:bg-doge-ember/20 hover:border-doge-ember/40 transition-all duration-200"
            onClick={() => {
              disconnect()
              setShowDropdown(false)
            }}
          >
            <LogOut className="w-4 h-4" />
            {t('common.disconnect')}
          </button>
        </div>
      )}
    </div>
  )
}
