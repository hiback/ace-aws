import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomTabBar } from '../src/components/chrome/bottom-tab-bar'
import { usePrefsStore } from '../src/stores/prefs-store'

const navigationMocks = vi.hoisted(() => ({
  pathname: '/stats',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
}))

beforeEach(() => {
  navigationMocks.pathname = '/stats'
  usePrefsStore.setState({ locale: 'en' })
})

afterEach(cleanup)

describe('BottomTabBar', () => {
  it('includes the stats tab link', () => {
    render(<BottomTabBar />)

    const statsLink = screen.getByRole('link', { name: /stats/i })
    expect(statsLink.getAttribute('href')).toBe('/stats')
    expect(statsLink.getAttribute('class')).toContain('text-accent')
  })
})
