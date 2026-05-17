import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "@/components/Layout"
import LandingLayout from "@/components/LandingLayout"
import ErrorBoundary from './components/ErrorBoundary'
import Home from "@/pages/Home"
import Dashboard from "@/pages/Dashboard"
import DaoVote from "@/pages/DaoVote"
import CreateToken from "@/pages/CreateToken"
import TokenDetail from "@/pages/TokenDetail"
import LendMarket from "@/pages/LendMarket"
import LendDetail from "@/pages/LendDetail"
import Portfolio from "@/pages/Portfolio"
import HowToPlay from "@/pages/HowToPlay"
import Revival from "@/pages/Revival"

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
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
          <Route path="/lend/:address" element={<LendDetail />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/guide" element={<HowToPlay />} />
          <Route path="/revival" element={<Revival />} />
        </Route>
      </Routes>
      </ErrorBoundary>
    </Router>
  )
}
