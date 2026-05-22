'use client'
import { useEffect } from 'react'
import type { Theme } from '@/data/types'
import { usePrefsStore } from '@/stores/prefs-store'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const persist = usePrefsStore.persist
    const syncTheme = () => applyTheme(usePrefsStore.getState().theme)
    const unsubscribeStore = usePrefsStore.subscribe((state, previousState) => {
      if (state.theme !== previousState.theme) applyTheme(state.theme)
    })

    if (persist.hasHydrated()) {
      syncTheme()
      return unsubscribeStore
    }

    const unsubscribeFinish = persist.onFinishHydration(syncTheme)

    return () => {
      unsubscribeStore()
      unsubscribeFinish()
    }
  }, [])

  return <>{children}</>
}
