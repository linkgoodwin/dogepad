import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { useEffect, lazy, Suspense } from "react"
import Layout from "@/components/Layout"
import LandingLayout from "@/components/LandingLayout"
import ErrorBoundary from './components/ErrorBoundary'
import { useI18n } from "@/stores/i18nStore"
import { t as translate, type TranslationKey } from "@/i18n/translations"

const Home = lazy(() => import("@/pages/Home"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const DaoVote = lazy(() => import("@/pages/DaoVote"))
const CreateToken = lazy(() => import("@/pages/CreateToken"))
const TokenDetail = lazy(() => import("@/pages/TokenDetail"))
const LendMarket = lazy(() => import("@/pages/LendMarket"))
const LendDetail = lazy(() => import("@/pages/LendDetail"))
const Portfolio = lazy(() => import("@/pages/Portfolio"))
const HowToPlay = lazy(() => import("@/pages/HowToPlay"))
const Revival = lazy(() => import("@/pages/Revival"))

function DocumentTitle() {
  const { lang } = useI18n()
  useEffect(() => {
    const tr = (key: TranslationKey) => translate(key, lang)
    document.title = `${tr('home.title')} - ${tr('home.subtitle')} · dogepad.online`
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

export default function App() {
  return (
    <Router basename="/dogepad/">
      <DocumentTitle />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dao" element={<DaoVote />} />
          <Route path="/create" element={<CreateToken />} />
          <Route path="/token/:address" element={<TokenDetail />} />
          <Route path="/lend" element={<LendMarket />} />
          <Route path="/lend/:mode" element={<LendDetail />} />
          <Route path="/lend/:mode/:tokenAddress" element={<LendDetail />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/guide" element={<HowToPlay />} />
          <Route path="/revival" element={<Revival />} />
        </Route>
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </Router>
  )
}
