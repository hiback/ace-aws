import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CertSwitcherSheet } from '../src/components/domain/cert-switcher-sheet'
import { usePrefsStore } from '../src/stores/prefs-store'

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' })
})

afterEach(cleanup)

describe('CertSwitcherSheet', () => {
  it('renders the current cert progress and browse-all action', () => {
    const onBrowseAll = vi.fn()

    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={onBrowseAll}
        currentCert="DVA-C02"
        answered={147}
        total={557}
        accuracy={78}
      />,
    )

    expect(screen.getByText('Switch certification')).not.toBeNull()
    expect(screen.getByText('147/557 · 26%')).not.toBeNull()
    expect(screen.getByText('Accuracy 78%')).not.toBeNull()

    fireEvent.click(screen.getByText('Browse all certifications'))

    expect(onBrowseAll).toHaveBeenCalledTimes(1)
  })
})
