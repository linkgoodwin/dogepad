import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { useT } from '@/i18n/useT'

export default function NotFound() {
  const t = useT()

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-display font-bold text-doge-gold mb-4">404</div>
      <h1 className="text-2xl font-display font-bold text-white mb-2">Page Not Found</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link
          to="/"
          className="btn-primary flex items-center gap-2 px-6 py-3"
        >
          <Home className="w-4 h-4" />
          Home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors font-display font-semibold flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    </div>
  )
}
