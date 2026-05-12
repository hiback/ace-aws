import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CertCode, Locale, Theme } from '@/data/types'

interface PrefsState {
  locale: Locale
  theme: Theme
  currentCert: CertCode | null
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
  setCurrentCert: (cert: CertCode | null) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      locale: 'zh',
      theme: 'system',
      currentCert: null,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setCurrentCert: (currentCert) => set({ currentCert }),
    }),
    {
      name: 'ace-aws/prefs/v1',
      partialize: (s) => ({ locale: s.locale, theme: s.theme, currentCert: s.currentCert }),
    },
  ),
)
