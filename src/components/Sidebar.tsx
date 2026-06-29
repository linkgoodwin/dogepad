import { Link, useLocation } from 'react-router-dom'
import { Flame, Rocket, PlusCircle, Vote, Landmark, Wallet, CalendarCheck, BookOpen, X } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useT } from '@/i18n/useT'
import { useI18n } from '@/stores/i18nStore'
import { cn } from '@/lib/utils'

export default function Sidebar() {
  const location = useLocation()
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const t = useT()
  const { lang, toggleLang } = useI18n()

  const navItems = [
    { label: t('nav.launch'), icon: Rocket, path: '/launch' },
    { label: t('nav.submitToken'), icon: PlusCircle, path: '/create' },
    { label: t('nav.subscribeStake'), icon: Vote, path: '/dao' },
    { label: t('nav.perpetual'), icon: Landmark, path: '/perpetual' },
    { label: t('nav.portfolio'), icon: Wallet, path: '/portfolio' },
    { label: t('nav.checkin'), icon: CalendarCheck, path: '/checkin' },
    { label: t('nav.howToPlay'), icon: BookOpen, path: '/guide' },
  ]

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-60 bg-dark-900 border-r border-dark-500/30 flex flex-col transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-dark-500/30">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => sidebarOpen && toggleSidebar()}>
            <div className="w-8 h-8 rounded-lg bg-doge-gold/10 border border-doge-gold/30 flex items-center justify-center">
              <Flame className="w-5 h-5 text-doge-gold" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-sm text-doge-gold leading-tight">DogePad</span>
              <span className="text-[10px] text-gray-500 leading-tight">{t('home.launchpad')}</span>
            </div>
          </Link>
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={toggleSidebar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {t('nav.sectionLaunch')}
          </div>
          {navItems.slice(0, 3).map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => sidebarOpen && toggleSidebar()}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-doge-gold/10 text-doge-gold border-l-2 border-doge-gold'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700 border-l-2 border-transparent'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}

          <div className="px-4 py-1.5 mt-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {t('nav.sectionFinance')}
          </div>
          {navItems.slice(3, 5).map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => sidebarOpen && toggleSidebar()}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-doge-gold/10 text-doge-gold border-l-2 border-doge-gold'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700 border-l-2 border-transparent'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}

          <div className="px-4 py-1.5 mt-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            {t('nav.sectionOther')}
          </div>
          {navItems.slice(5).map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => sidebarOpen && toggleSidebar()}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-doge-gold/10 text-doge-gold border-l-2 border-doge-gold'
                    : 'text-gray-400 hover:text-white hover:bg-dark-700 border-l-2 border-transparent'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-dark-500/30">
          <button
            onClick={toggleLang}
            className="w-full mb-3 py-1.5 rounded-lg text-sm font-display font-medium border border-doge-gold/30 text-doge-gold hover:bg-doge-gold/10 transition-all duration-200"
          >
            {lang === 'zh' ? '中/EN' : 'EN/中'}
          </button>
          <div className="text-xs text-gray-500 text-center">
            {t('common.poweredBy', { name: 'DogePad' })}
          </div>
        </div>
      </aside>
    </>
  )
}
