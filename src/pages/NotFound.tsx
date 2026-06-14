import { Link } from 'react-router-dom'
import { Home, ArrowLeft, Ghost } from 'lucide-react'
import { useT } from '@/i18n/useT'

export default function NotFound() {
  const t = useT()

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="relative mb-6">
        <div className="text-8xl font-display font-bold text-doge-gold/20">404</div>
        <Ghost className="w-16 h-16 text-doge-gold absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <h1 className="text-2xl font-display font-bold text-white mb-2">{t('notFound.title')}</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        {t('notFound.desc')}
      </p>
      <div className="flex gap-4">
        <Link
          to="/"
          className="btn-primary flex items-center gap-2 px-6 py-3"
        >
          <Home className="w-4 h-4" />
          {t('notFound.home')}
        </Link>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors font-display font-semibold flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('notFound.back')}
        </button>
      </div>
    </div>
  )
}
