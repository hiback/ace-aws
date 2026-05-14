import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StatusBanner } from '../src/components/domain/status-banner'
import { usePrefsStore } from '../src/stores/prefs-store'

afterEach(cleanup)

beforeEach(() => {
  act(() => {
    usePrefsStore.setState({ locale: 'en' })
  })
})

describe('StatusBanner', () => {
  it('renders correct and user answers in the result summary', () => {
    const { container } = render(
      <StatusBanner tone="wrong" correctLetters={['C']} userLetters={['A']} />,
    )

    expect(screen.getByText('Wrong')).not.toBeNull()
    expect(container.textContent).toContain('Correct answer is C · Your answer A')
    expect(container.firstElementChild?.className).toContain('bg-[#B84A4A]')
  })
})
