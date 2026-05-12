'use client'
import { useEffect } from 'react'
import { usePrefsStore } from '@/stores/prefs-store'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = usePrefsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
  }, [theme])

  return <>{children}</>
}
