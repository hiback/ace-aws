'use client'
import { useEffect } from 'react'
import { usePrefsStore } from '@/stores/prefs-store'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = usePrefsStore((s) => s.locale)

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale)
  }, [locale])

  return <>{children}</>
}
