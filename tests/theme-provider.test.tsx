import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../src/components/providers/theme-provider'
import { themeInitScript } from '../src/lib/theme-init-script'
import { usePrefsStore } from '../src/stores/prefs-store'

const PREFS_KEY = 'ace-aws/prefs/v1'

const originalPersist = {
  hasHydrated: usePrefsStore.persist.hasHydrated,
  onHydrate: usePrefsStore.persist.onHydrate,
  onFinishHydration: usePrefsStore.persist.onFinishHydration,
}

type PrefsState = ReturnType<typeof usePrefsStore.getState>
type HydrationListener = (state: PrefsState) => void

function restorePersist() {
  usePrefsStore.persist.hasHydrated = originalPersist.hasHydrated
  usePrefsStore.persist.onHydrate = originalPersist.onHydrate
  usePrefsStore.persist.onFinishHydration = originalPersist.onFinishHydration
}

function mockPendingHydration() {
  let hydrated = false
  const finishListeners: HydrationListener[] = []

  usePrefsStore.persist.hasHydrated = () => hydrated
  usePrefsStore.persist.onHydrate = () => () => undefined
  usePrefsStore.persist.onFinishHydration = (listener) => {
    finishListeners.push(listener)
    return () => {
      const index = finishListeners.indexOf(listener)
      if (index !== -1) finishListeners.splice(index, 1)
    }
  }

  return (state: Partial<PrefsState>) => {
    hydrated = true
    usePrefsStore.setState(state)
    for (const listener of finishListeners) listener(usePrefsStore.getState())
  }
}

function mockHydrated() {
  usePrefsStore.persist.hasHydrated = () => true
  usePrefsStore.persist.onHydrate = () => () => undefined
  usePrefsStore.persist.onFinishHydration = () => () => undefined
}

function runThemeInitScript() {
  Function(themeInitScript)()
}

beforeEach(() => {
  restorePersist()
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  usePrefsStore.setState({ locale: 'zh', theme: 'system', currentCert: 'DVA-C02' })
})

afterEach(() => {
  restorePersist()
  cleanup()
})

describe('ThemeProvider', () => {
  it('does not remove the pre-paint light theme before prefs hydration finishes', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ state: { locale: 'zh', theme: 'light', currentCert: 'DVA-C02' } }),
    )
    runThemeInitScript()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    const finishHydration = mockPendingHydration()

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    )
    await act(async () => {})

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => finishHydration({ theme: 'light' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('keeps syncing later theme changes from the prefs store', async () => {
    mockHydrated()
    usePrefsStore.setState({ theme: 'light' })

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    )
    await act(async () => {})

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => usePrefsStore.setState({ theme: 'system' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)

    act(() => usePrefsStore.setState({ theme: 'dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
