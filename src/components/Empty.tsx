import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'

export default function Empty() {
  const t = useT()
  return (
    <div className={cn('flex h-full items-center justify-center')}>{t('common.empty')}</div>
  )
}
