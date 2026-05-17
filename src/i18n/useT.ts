import { useCallback } from 'react'
import { useI18n } from '@/stores/i18nStore'
import { t, type TranslationKey } from '@/i18n/translations'
import { getNativeSymbol } from '@/config/contracts'
import { useTargetChainId } from '@/hooks/useNetwork'

export function useT() {
  const { lang } = useI18n()
  const chainId = useTargetChainId()
  const nativeSymbol = getNativeSymbol(chainId)

  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const result = t(key, lang, params)
      if (nativeSymbol !== 'BNB') {
        return result.replace(/BNB/g, nativeSymbol)
      }
      return result
    },
    [lang, nativeSymbol]
  )

  return translate
}
