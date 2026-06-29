import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { useEffect, lazy, Suspense, useState } from "react"
import Layout from "@/components/Layout"
import LandingLayout from "@/components/LandingLayout"
import ErrorBoundary from './components/ErrorBoundary'
import { useI18n } from "@/stores/i18nStore"
import { t as translate, type TranslationKey } from "@/i18n/translations"
import { useAccount, useWriteContract, useReadContract } from "wagmi"
import { Loader2 } from "lucide-react"
import { DAILY_CHECKIN_ABI, getContractAddress, isZeroAddress } from "@/config/contracts"
import { useTargetChainId } from "@/hooks/useNetwork"
import { useT } from "@/i18n/useT"

const Home = lazy(() => import("@/pages/Home"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const DaoVote = lazy(() => import("@/pages/DaoVote"))
const CreateToken = lazy(() => import("@/pages/CreateToken"))
const TokenDetail = lazy(() => import("@/pages/TokenDetail"))
const PerpetualPage = lazy(() => import("@/pages/PerpetualPage"))
const Portfolio = lazy(() => import("@/pages/Portfolio"))
const HowToPlay = lazy(() => import("@/pages/HowToPlay"))
const CheckIn = lazy(() => import("@/pages/CheckIn"))
const NotFound = lazy(() => import("@/pages/NotFound"))

function DocumentTitle() {
  const { lang } = useI18n()
  useEffect(() => {
    const tr = (key: TranslationKey) => translate(key, lang)
    document.title = `${tr('home.title')} - ${tr('home.subtitle')} · dogepad.pro`
  }, [lang])
  return null
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-doge-gold/30 border-t-doge-gold rounded-full animate-spin" />
    </div>
  )
}

function ReferralBinder() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useTargetChainId()
  const { writeContractAsync } = useWriteContract()
  const [binding, setBinding] = useState(false)

  const checkinAddress = getContractAddress(chainId, 'dailyCheckin')

  // Check if user already has a referrer bound on-chain
  const { data: userInfo } = useReadContract({
    address: checkinAddress as `0x${string}`,
    abi: DAILY_CHECKIN_ABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: isConnected && !!address && !isZeroAddress(checkinAddress) },
  })

  // getUserInfo returns: (lastCheckinDay, streak, totalClaimed, referrer, refEarnings, refCount, canCheckinToday, todayReward)
  const onChainReferrer = userInfo ? String((userInfo as any)[3] ?? (userInfo as any).referrer ?? '') : ''
  const hasReferrerOnChain = !isZeroAddress(onChainReferrer as `0x${string}`)

  useEffect(() => {
    if (!isConnected || !address) return

    const bindKey = `dogepad_ref_bound_${address.toLowerCase()}`

    // If already bound on-chain, mark in localStorage and exit
    if (hasReferrerOnChain) {
      localStorage.setItem(bindKey, '1')
      localStorage.removeItem('dogepad_ref')
      return
    }

    // Get ref from URL or localStorage
    const params = new URLSearchParams(window.location.search)
    let ref = params.get('ref')
    if (ref) {
      ref = ref.trim()
      localStorage.setItem('dogepad_ref', ref)
    } else {
      ref = localStorage.getItem('dogepad_ref')
    }

    if (!ref) return
    if (!ref.startsWith('0x') || ref.length !== 42) return
    if (ref.toLowerCase() === address.toLowerCase()) return

    // Already bound successfully
    if (localStorage.getItem(bindKey) === '1') return

    // Rate limit: retry at most once per 5 minutes (prevents infinite retry on failure)
    const lastAttempt = localStorage.getItem(bindKey)
    if (lastAttempt && lastAttempt.startsWith('ts:')) {
      const ts = parseInt(lastAttempt.slice(3))
      if (Date.now() - ts < 5 * 60 * 1000) return
    }

    if (isZeroAddress(checkinAddress)) return

    const refAddress = ref as `0x${string}`
    setBinding(true)
    localStorage.setItem(bindKey, `ts:${Date.now()}`)

    writeContractAsync({
      address: checkinAddress,
      abi: DAILY_CHECKIN_ABI,
      functionName: 'bindReferrer',
      args: [refAddress],
      chainId,
    } as any)
      .then(() => {
        setBinding(false)
        localStorage.setItem(bindKey, '1')
        localStorage.removeItem('dogepad_ref')
      })
      .catch(() => {
        setBinding(false)
        // Keep the timestamp for rate limiting; will retry after 5 min
      })
  }, [isConnected, address, chainId, writeContractAsync, hasReferrerOnChain, checkinAddress])

  if (!binding) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-dark-900 border border-doge-gold/30 rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg">
      <Loader2 className="w-4 h-4 text-doge-gold animate-spin" />
      <span className="text-xs text-gray-300">{t('checkin.bindingRef')}</span>
    </div>
  )
}

export default function App() {
  return (
    <Router basename="/">
      <DocumentTitle />
      <ReferralBinder />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
        <Route element={<Layout />}>
          <Route path="/launch" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dao" element={<DaoVote />} />
          <Route path="/create" element={<CreateToken />} />
          <Route path="/token/:address" element={<TokenDetail />} />
          <Route path="/perpetual" element={<PerpetualPage />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/guide" element={<HowToPlay />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </Router>
  )
}
