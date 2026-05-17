import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  change?: number
  icon: ReactNode
}

export default function StatCard({ title, value, change, icon }: StatCardProps) {
  return (
    <div className="card-dark flex items-center gap-4">
      <div className="rounded-xl bg-dark-600 p-3">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-1">{title}</p>
        <p className="text-xl font-display font-bold gold-text truncate">{value}</p>
        {change !== undefined && (
          <span
            className={cn(
              'text-xs font-medium',
              change >= 0 ? 'text-doge-gold' : 'text-doge-ember'
            )}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  )
}
