import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabsBar } from '../src/components/domain/tabs-bar'
import { usePrefsStore } from '../src/stores/prefs-store'

const navigationMocks = vi.hoisted(() => ({
  pathname: '/list',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
}))

beforeEach(() => {
  navigationMocks.pathname = '/list'
  usePrefsStore.setState({ locale: 'zh', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('TabsBar', () => {
  it('orders list tabs as all, wrong, bookmarks, and unanswered', () => {
    render(<TabsBar />)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['全部', '错过', '收藏', '未答'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/list',
      '/list/wrong',
      '/list/bookmarks',
      '/list/unanswered',
    ])
  })
})
