import { useState, useMemo, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { Flame, Info, Globe, Twitter, MessageCircle, Users, Upload, Clock, CheckCircle, Loader2, AlertTriangle, Wallet, X, Wifi } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/utils'
import { uploadToIpfs } from '@/lib/ipfs'
import { LAUNCH_DAO_ABI, getContractAddress, isZeroAddress, isTestnet, getNetworkName, getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'

const DURATION_TIERS = [
  { value: 0, feeBnb: 0.1, labelKey: 'create.tier3Days' as const, descKey: 'create.tier3Desc' as const },
  { value: 1, feeBnb: 0.5, labelKey: 'create.tier7Days' as const, descKey: 'create.tier7Desc' as const },
  { value: 2, feeBnb: 1, labelKey: 'create.tier30Days' as const, descKey: 'create.tier30Desc' as const },
]

export default function CreateToken() {
  const t = useT()
  const { isConnected } = useAccount()
  const chainId = useTargetChainId()
  const testnet = isTestnet(chainId)
  const networkName = getNetworkName(chainId)
  const nativeSymbol = getNativeSymbol(chainId)
  const daoAddress = getContractAddress(chainId, 'launchDAO')

  const { writeContractAsync, data: txHash, isPending: isWriting } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [discord, setDiscord] = useState('')
  const [aboutCoin, setAboutCoin] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTier, setSelectedTier] = useState(1)
  const [wantTaxShare, setWantTaxShare] = useState(true)
  const [wantLpShare, setWantLpShare] = useState(true)
  const [wantTokenAllocation, setWantTokenAllocation] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [txError, setTxError] = useState('')

  const selectedTierInfo = DURATION_TIERS[selectedTier]
  const isContractNotDeployed = isZeroAddress(daoAddress)

  const totalFee = useMemo(() => {
    return selectedTierInfo.feeBnb
  }, [selectedTierInfo.feeBnb])

  const totalFeeStr = `${totalFee.toFixed(2)} ${nativeSymbol}`

  const sanitizeUrl = (url: string): string => {
    if (!url) return ''
    const trimmed = url.trim()
    if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) return ''
    if (trimmed && !/^(https?:\/\/|ipfs:\/\/)/i.test(trimmed)) return 'https://' + trimmed
    return trimmed
  }

  const sanitizeSocialUrl = (url: string, ...domains: string[]): string => {
    if (!url) return ''
    const trimmed = url.trim()
    if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) return ''
    if (/^(https?:\/\/|ipfs:\/\/)/i.test(trimmed)) return trimmed
    for (const domain of domains) {
      if (trimmed.toLowerCase().startsWith(domain)) return 'https://' + trimmed
    }
    return trimmed
  }

  const validateWebsite = (url: string): string | null => {
    if (!url) return null
    const normalized = sanitizeUrl(url).replace(/\/+$/, '')
    const slashCount = (normalized.match(/\//g) || []).length
    if (slashCount > 2) return t('create.websiteInvalid')
    return null
  }

  const TWITTER_BLOCKED_KEYWORDS = ['search', 'explore', 'home', 'i/', 'settings', 'compose', 'notifications', 'messages']

  const validateTwitter = (url: string): string | null => {
    if (!url) return null
    const normalized = sanitizeSocialUrl(url, 'twitter.com', 'x.com').replace(/\/+$/, '')
    const slashCount = (normalized.match(/\//g) || []).length
    if (slashCount !== 3) return t('create.twitterInvalid')
    const pathLower = normalized.toLowerCase()
    for (const kw of TWITTER_BLOCKED_KEYWORDS) {
      if (pathLower.includes('/' + kw)) return t('create.twitterInvalid')
    }
    return null
  }

  const websiteError = validateWebsite(website)
  const twitterError = validateTwitter(twitter)

  const buildMetadataURI = (): string => {
    const meta: Record<string, string> = {}
    if (avatarUrl) meta.image = sanitizeUrl(avatarUrl)
    if (website) meta.website = sanitizeUrl(website)
    if (twitter) meta.twitter = sanitizeSocialUrl(twitter, 'twitter.com', 'x.com')
    if (telegram) meta.telegram = sanitizeSocialUrl(telegram, 't.me')
    if (discord) meta.discord = sanitizeSocialUrl(discord, 'discord.gg', 'discord.com')
    if (aboutCoin) meta.about = aboutCoin
    if (description) meta.description = description
    return Object.keys(meta).length > 0
      ? `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(meta))))}`
      : ''
  }

  const handleImageUpload = async (file: File) => {
    if (!file) return
    setUploading(true); setUploadError('')
    try {
      const url = await uploadToIpfs(file)
      setAvatarUrl(url)
    } catch (err: any) { setUploadError(err.message || t('create.uploadFailed')) }
    finally { setUploading(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleImageUpload(f) }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }

  const handleSubmit = () => {
    if (!name || !symbol || uploading) return
    if (!isConnected) return
    setTxError('')
    setShowConfirm(true)
  }

  const handleConfirmSubmit = async () => {
    setTxError('')
    try {
      const metadataURI = buildMetadataURI()
      const feeWei = parseEther(totalFee.toFixed(4))

      const hash = await writeContractAsync({
        address: daoAddress,
        abi: LAUNCH_DAO_ABI,
        functionName: 'submitCandidate',
        args: [name, symbol, metadataURI, selectedTier, wantTaxShare, wantLpShare, wantTokenAllocation],
        value: feeWei,
        chainId,
        gas: 5_000_000n,
      } as any)
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || t('common.transactionFailed')
      if (msg.includes('User rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        setTxError(t('create.userRejected'))
      } else {
        setTxError(msg.length > 100 ? msg.slice(0, 100) + '...' : msg)
      }
    }
  }

  const handleCloseConfirm = () => {
    if (isWriting || isConfirming) return
    setShowConfirm(false)
    setTxError('')
  }

  const resetForm = () => {
    setName(''); setSymbol(''); setAvatarUrl(''); setWebsite('')
    setTwitter(''); setTelegram(''); setDiscord('')
    setAboutCoin(''); setDescription('')
    setSelectedTier(1)
  }

  useEffect(() => {
    if (isConfirmed) {
      resetForm()
    }
  }, [isConfirmed])

  const isSubmitting = isWriting || isConfirming

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Flame className="w-6 h-6 text-doge-gold" />
          {t('create.title')}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{t('create.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card-dark space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">{t('create.tokenName')}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dragon Slayer" maxLength={64} className="input-dark w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">{t('create.tokenSymbol')}</label>
                <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. DrgS" maxLength={11} className="input-dark w-full" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm mb-2">
                <Clock className="w-4 h-4 text-doge-gold" />
                <span className="font-semibold text-white">{t('create.durationTier')}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {DURATION_TIERS.map((tier) => (
                  <button
                    key={tier.value}
                    className={cn(
                      'rounded-xl border-2 p-3 text-center transition-all duration-200',
                      selectedTier === tier.value
                        ? 'border-doge-gold bg-doge-gold/10 shadow-lg shadow-doge-gold/10'
                        : 'border-dark-500 bg-dark-600 hover:border-dark-400'
                    )}
                    onClick={() => setSelectedTier(tier.value)}
                  >
                    <div className={cn('text-base font-display font-bold', selectedTier === tier.value ? 'text-doge-gold' : 'text-gray-300')}>
                      {t(tier.labelKey)}
                    </div>
                    <div className={cn('text-sm font-display font-semibold mt-0.5', selectedTier === tier.value ? 'text-doge-gold' : 'text-gray-400')}>
                      {tier.feeBnb.toFixed(2)} {nativeSymbol}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{t(tier.descKey)}</div>
                    {selectedTier === tier.value && <CheckCircle className="w-3.5 h-3.5 text-doge-gold mx-auto mt-1.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm mb-2">
                <Info className="w-4 h-4 text-doge-cyan" />
                <span className="font-semibold text-white">{t('create.creatorIncentives')}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{t('create.creatorIncentivesDesc')}</p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                    wantTaxShare ? 'border-doge-gold bg-doge-gold/20' : 'border-dark-400 bg-dark-700'
                  )} onClick={() => setWantTaxShare(!wantTaxShare)}>
                    {wantTaxShare && <CheckCircle className="w-3.5 h-3.5 text-doge-gold" />}
                  </div>
                  <div>
                    <span className="text-sm text-white group-hover:text-doge-gold transition-colors">{t('create.wantTaxShare')}</span>
                    <p className="text-[10px] text-gray-500">{t('create.wantTaxShareDesc')}</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                    wantLpShare ? 'border-doge-gold bg-doge-gold/20' : 'border-dark-400 bg-dark-700'
                  )} onClick={() => setWantLpShare(!wantLpShare)}>
                    {wantLpShare && <CheckCircle className="w-3.5 h-3.5 text-doge-gold" />}
                  </div>
                  <div>
                    <span className="text-sm text-white group-hover:text-doge-gold transition-colors">{t('create.wantLpShare')}</span>
                    <p className="text-[10px] text-gray-500">{t('create.wantLpShareDesc')}</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                    wantTokenAllocation ? 'border-doge-gold bg-doge-gold/20' : 'border-dark-400 bg-dark-700'
                  )} onClick={() => setWantTokenAllocation(!wantTokenAllocation)}>
                    {wantTokenAllocation && <CheckCircle className="w-3.5 h-3.5 text-doge-gold" />}
                  </div>
                  <div>
                    <span className="text-sm text-white group-hover:text-doge-gold transition-colors">{t('create.wantTokenAllocation')}</span>
                    <p className="text-[10px] text-gray-500">{t('create.wantTokenAllocationDesc')}</p>
                  </div>
                </label>
              </div>
              {!(wantTaxShare || wantLpShare || wantTokenAllocation) && (
                <p className="text-xs text-neon-red mt-2">{t('create.incentiveRequired')}</p>
              )}
            </div>
          </div>

          <div className="card-dark space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Globe className="w-4 h-4 text-doge-cyan" />
              <span className="font-semibold text-white">{t('create.socialLinks')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1">
                  <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t('create.website')} className="input-dark w-full" />
                  {websiteError && <p className="text-[10px] text-neon-red mt-1">{websiteError}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Twitter className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1">
                  <input type="text" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder={t('create.twitter')} className="input-dark w-full" />
                  {twitterError && <p className="text-[10px] text-neon-red mt-1">{twitterError}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input type="text" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder={t('create.telegram')} className="input-dark flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input type="text" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder={t('create.discord')} className="input-dark flex-1" />
              </div>
            </div>
          </div>

          <div className="card-dark space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-doge-gold" />
              <span className="font-semibold text-white">{t('create.aboutCoin')}</span>
            </div>
            <input
              type="text"
              value={aboutCoin}
              onChange={(e) => setAboutCoin(e.target.value.slice(0, 128))}
              placeholder={t('create.aboutCoinPlaceholder')}
              maxLength={128}
              className="input-dark w-full"
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('create.description')}</span>
              <span>{aboutCoin.length}/128</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1024))}
              placeholder={t('create.descriptionPlaceholder')}
              maxLength={1024}
              rows={4}
              className="input-dark w-full resize-none"
            />
            <div className="text-right text-xs text-gray-500">{description.length}/1024</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={cn('rounded-xl p-3 flex items-center gap-2 text-sm', testnet ? 'bg-neon-yellow/5 border border-neon-yellow/20' : 'bg-neon-green/5 border border-neon-green/20')}>
            <Wifi className={cn('w-4 h-4', testnet ? 'text-neon-yellow' : 'text-neon-green')} />
            <span className={cn('font-semibold', testnet ? 'text-neon-yellow' : 'text-neon-green')}>{networkName}</span>
            {testnet && <span className="text-xs text-neon-yellow/70 ml-auto">{t('create.testnetWarning')}</span>}
          </div>

          {isContractNotDeployed && (
            <div className="bg-neon-red/10 border border-neon-red/30 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-neon-red shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-neon-red">{t('create.contractNotDeployed')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('create.contractNotDeployedDesc')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3">{t('create.avatarUrl')}</h3>
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-28 h-28 rounded-xl border-2 border-dashed border-dark-500 hover:border-doge-gold/50 transition-colors overflow-hidden bg-dark-700 flex items-center justify-center cursor-pointer relative group"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('avatar-upload')?.click()}
              >
                {uploading ? (
                  <Loader2 className="w-8 h-8 text-doge-gold animate-spin" />
                ) : avatarUrl ? (
                  <img src={sanitizeUrl(avatarUrl)} alt="avatar" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-7 h-7 text-gray-500 group-hover:text-doge-gold transition-colors" />
                    <span className="text-[10px] text-gray-500 group-hover:text-doge-gold/70 transition-colors">{t('create.upload')}</span>
                  </div>
                )}
                {!uploading && avatarUrl && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
              <input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleFileChange} />
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => { setAvatarUrl(e.target.value); setUploadError('') }}
                placeholder={t('create.orPasteUrl')}
                className="input-dark w-full text-center text-xs"
              />
              {uploadError && <p className="text-xs text-neon-red">{uploadError}</p>}
              <p className="text-xs text-gray-500 text-center">{t('create.maxFileSize')}</p>
            </div>
          </div>

          <div className="card-dark">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-doge-gold" />
              {t('create.fixedParams')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('create.totalSupply')}</span>
                <span className="text-doge-gold font-semibold">1,000,000,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('create.durationFee')}</span>
                <span className="text-doge-gold font-semibold">{selectedTierInfo.feeBnb.toFixed(2)} {nativeSymbol}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-dark-500/30">
                <span className="text-gray-400">{t('create.expiry')}</span>
                <span className="text-doge-gold font-semibold">{t(selectedTierInfo.labelKey)}</span>
              </div>
            </div>
          </div>

          <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-display font-semibold text-doge-gold">{t('create.totalCost')}</p>
                <p className="text-xs text-gray-400">{t('create.totalCostDesc')}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-doge-gold">{totalFeeStr}</p>
                <p className="text-xs text-gray-400">{t(selectedTierInfo.labelKey)} {t('create.campaign')}</p>
              </div>
            </div>
          </div>

          {!isConnected ? (
            <div className="bg-neon-red/5 border border-neon-red/20 rounded-xl p-4 text-center">
              <Wallet className="w-6 h-6 text-neon-red mx-auto mb-2" />
              <p className="text-sm text-neon-red font-semibold">{t('create.connectWallet')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('create.connectWalletDesc')}</p>
            </div>
          ) : (
            <button className="btn-primary w-full" disabled={!name || !symbol || uploading || isContractNotDeployed || !(wantTaxShare || wantLpShare || wantTokenAllocation) || !!websiteError || !!twitterError} onClick={handleSubmit}>
              {isContractNotDeployed ? (
                t('create.contractNotDeployed')
              ) : uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('create.uploading')}
                </span>
              ) : t('create.submit')}
            </button>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleCloseConfirm}>
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg">{t('create.confirmTitle')}</h3>
              {!isSubmitting && <button onClick={handleCloseConfirm} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>}
            </div>

            {isConfirmed ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-neon-green mx-auto mb-3" />
                <p className="font-display font-bold text-lg text-neon-green mb-2">{t('create.submitSuccess')}</p>
                <p className="text-xs text-gray-400 font-mono break-all mb-4">TX: {txHash}</p>
                <button onClick={handleCloseConfirm} className="btn-primary w-full">{t('create.close')}</button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <div className="bg-dark-700 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t('create.tokenName')}</span>
                      <span className="font-semibold">{name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t('create.tokenSymbol')}</span>
                      <span className="font-semibold text-doge-gold">{symbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t('create.durationTier')}</span>
                      <span className="font-semibold">{t(selectedTierInfo.labelKey)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t('create.creatorIncentives')}</span>
                      <span className="font-semibold text-doge-gold text-xs">
                        {[
                          wantTaxShare && t('create.wantTaxShare'),
                          wantLpShare && t('create.wantLpShare'),
                          wantTokenAllocation && t('create.wantTokenAllocation'),
                        ].filter(Boolean).join(' / ')}
                      </span>
                    </div>
                  </div>

                  <div className="bg-doge-gold/5 border border-doge-gold/20 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-doge-gold font-semibold">{t('create.totalCost')}</span>
                    <span className="text-xl font-display font-bold text-doge-gold">{totalFeeStr}</span>
                  </div>

                  <div className="flex items-start gap-2 bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-neon-yellow shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-400">{t('create.confirmWarning')}</p>
                  </div>

                  {txError && (
                    <div className="bg-neon-red/5 border border-neon-red/20 rounded-lg p-3">
                      <p className="text-xs text-neon-red break-all">{txError}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={handleCloseConfirm} disabled={isSubmitting} className="btn-secondary flex-1">{t('create.cancel')}</button>
                  <button onClick={handleConfirmSubmit} disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {isWriting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('create.walletConfirm')}</>
                    ) : isConfirming ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('create.confirming')}</>
                    ) : t('create.confirmSubmit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
