import { Outlet, Link } from 'react-router-dom'
import { Flame, Rocket } from 'lucide-react'
import WalletButton from '@/components/WalletButton'
import { useT } from '@/i18n/useT'

export default function LandingLayout() {
  const t = useT()
  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-6 lg:px-10 bg-dark-950/70 backdrop-blur-xl border-b border-dark-500/20">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center group-hover:bg-doge-gold/20 transition-colors">
            <Flame className="w-4.5 h-4.5 text-doge-gold" />
          </div>
          <span className="font-display font-bold text-lg text-gradient-gold">DogePad</span>
        </Link>

        <div className="flex items-center gap-4">
          <WalletButton />
          <Link
            to="/launch"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-doge-gold/10 text-doge-gold border border-doge-gold/20 font-display font-semibold text-sm hover:bg-doge-gold/20 hover:border-doge-gold/40 transition-all duration-200"
          >
            <Rocket className="w-4 h-4" />
            <span className="hidden sm:inline">{t('nav.launch')}</span>
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
