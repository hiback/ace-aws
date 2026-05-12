import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useT } from '../src/hooks/use-t'
import { usePrefsStore } from '../src/stores/prefs-store'

describe('useT', () => {
  it('returns zh string by default', () => {
    act(() => {
      usePrefsStore.setState({ locale: 'zh' })
    })
    const { result } = renderHook(() => useT())
    expect(result.current('appName')).toBe('ace-aws')
    expect(result.current('settingsTitle')).toBe('设置')
  })

  it('returns en string when locale is en', () => {
    act(() => {
      usePrefsStore.setState({ locale: 'en' })
    })
    const { result } = renderHook(() => useT())
    expect(result.current('settingsTitle')).toBe('Settings')
  })

  it('interpolates {var} placeholders', () => {
    act(() => {
      usePrefsStore.setState({ locale: 'zh' })
    })
    const { result } = renderHook(() => useT())
    expect(result.current('selectN', { n: 2 })).toBe('还需选择 2 项')
    expect(result.current('questionXofY', { x: 12, y: 612 })).toBe('第 12 题 / 共 612 题')
  })

  it('falls back to en when key missing in current locale (defensive)', () => {
    act(() => {
      usePrefsStore.setState({ locale: 'zh' })
    })
    const { result } = renderHook(() => useT())
    // @ts-expect-error — testing missing-key path
    expect(result.current('nonExistentKey')).toBe('nonExistentKey')
  })

  it('updates returned function when locale changes', () => {
    act(() => {
      usePrefsStore.setState({ locale: 'zh' })
    })
    const { result, rerender } = renderHook(() => useT())
    expect(result.current('settingsTitle')).toBe('设置')
    act(() => {
      usePrefsStore.setState({ locale: 'en' })
    })
    rerender()
    expect(result.current('settingsTitle')).toBe('Settings')
  })
})
