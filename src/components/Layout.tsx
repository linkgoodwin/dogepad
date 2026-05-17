import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import WalletButton from '@/components/WalletButton'
import { useUIStore } from '@/stores/uiStore'

export default function Layout() {
  const { toggleSidebar } = useUIStore()

  return (
    <div className="flex min-h-screen bg-dark-950">
      <Sidebar />

      <div className="flex-1 lg:ml-60">
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 lg:px-8 bg-dark-950/80 backdrop-blur-md border-b border-dark-500/30">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-gray-400 hover:text-white"
              onClick={toggleSidebar}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
          <WalletButton />
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
