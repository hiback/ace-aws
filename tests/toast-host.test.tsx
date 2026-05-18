import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastHost, useToast } from '../src/hooks/use-toast'

const navigationMocks = vi.hoisted(() => ({
  pathname: '/',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
}))

beforeEach(() => {
  vi.useFakeTimers()
  navigationMocks.pathname = '/'
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ToastHost', () => {
  it('announces toasts politely and dismisses them after three seconds', () => {
    render(<ToastHost />)

    act(() => useToast().toast('Saved'))

    const toast = screen.getByRole('status')
    expect(toast.getAttribute('aria-live')).toBe('polite')
    expect(toast.textContent).toBe('Saved')

    act(() => vi.advanceTimersByTime(3_000))

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses a higher bottom offset on tabbed routes and a low offset elsewhere', () => {
    const { rerender } = render(<ToastHost />)
    act(() => useToast().toast('Tabbed'))

    expect(screen.getByRole('status').className).toContain('bottom-20')

    navigationMocks.pathname = '/login'
    rerender(<ToastHost />)

    expect(screen.getByRole('status').className).toContain('bottom-4')
  })

  it('keeps the higher bottom offset on tabbed list routes', () => {
    navigationMocks.pathname = '/list/wrong'
    render(<ToastHost />)

    act(() => useToast().toast('List route'))

    expect(screen.getByRole('status').className).toContain('bottom-20')
  })
})
