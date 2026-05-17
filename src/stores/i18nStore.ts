import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/i18n/translations'

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: 'zh',
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((state) => ({ lang: state.lang === 'zh' ? 'en' : 'zh' })),
    }),
    {
      name: 'dogepad-lang',
    }
  )
)
