import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VoteDistribution } from '../src/components/domain/vote-distribution'
import { usePrefsStore } from '../src/stores/prefs-store'

afterEach(cleanup)

beforeEach(() => {
  act(() => {
    usePrefsStore.setState({ locale: 'en' })
  })
})

describe('VoteDistribution', () => {
  it('does not render when distribution is empty', () => {
    const { container } = render(<VoteDistribution distribution={{}} correctKey="A" />)

    expect(container.firstChild).toBeNull()
  })

  it('renders a non-empty distribution', () => {
    render(<VoteDistribution distribution={{ A: 70, B: 30 }} correctKey="A" />)

    expect(screen.getByText('Community votes')).not.toBeNull()
    expect(screen.getByText('A')).not.toBeNull()
    expect(screen.getByText('70%')).not.toBeNull()
  })
})
