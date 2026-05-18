import { beforeEach, describe, expect, it } from 'vitest'
import { themeInitScript } from '../src/lib/theme-init-script'

const PREFS_KEY = 'ace-aws/prefs/v1'

function runThemeInitScript() {
  Function(themeInitScript)()
}

function setStoredTheme(theme: 'light' | 'dark' | 'system') {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ state: { theme } }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('themeInitScript', () => {
  it('sets data-theme for explicit light before paint', () => {
    setStoredTheme('light')

    runThemeInitScript()

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('sets data-theme for explicit dark before paint', () => {
    setStoredTheme('dark')

    runThemeInitScript()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('leaves system theme unset so CSS follows the system fallback', () => {
    setStoredTheme('system')

    runThemeInitScript()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('leaves missing preferences unset so CSS follows the system fallback', () => {
    runThemeInitScript()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
