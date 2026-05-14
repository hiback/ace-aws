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
    expect(screen.getByText('2 options')).not.toBeNull()
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0)
    expect(screen.getByText('Correct')).not.toBeNull()
  })

  it('does not synthesize an Other bucket', () => {
    render(<VoteDistribution distribution={{ A: 80 }} correctKey="A" />)

    expect(screen.queryByText('Other')).toBeNull()
    expect(screen.getByText('1 options')).not.toBeNull()
  })

  it('renders Other only when present in the data', () => {
    render(<VoteDistribution distribution={{ A: 80, Other: 20 }} correctKey="A" />)

    expect(screen.getAllByText('Other').length).toBeGreaterThan(0)
    expect(screen.getByText('1 options')).not.toBeNull()
  })

  it('fills the stacked bar when percentages add up to less than 100', () => {
    const { container } = render(
      <VoteDistribution distribution={{ A: 70, B: 20 }} correctKey="A" />,
    )
    const segments = [...container.querySelectorAll<HTMLElement>('[style*="flex-basis"]')]

    expect(segments).toHaveLength(2)
    expect(Number.parseFloat(segments[0].style.flexBasis)).toBeCloseTo(77.78, 2)
    expect(Number.parseFloat(segments[1].style.flexBasis)).toBeCloseTo(22.22, 2)
    expect(screen.getAllByText('70%').length).toBeGreaterThan(0)
    expect(screen.queryByText('Other')).toBeNull()
  })

  it('normalizes stacked bar widths when rounded percentages exceed 100', () => {
    const { container } = render(
      <VoteDistribution distribution={{ A: 63, B: 33, C: 4, Other: 2 }} correctKey="A" />,
    )
    const segments = [...container.querySelectorAll<HTMLElement>('[style*="flex-basis"]')]

    expect(segments).toHaveLength(4)
    expect(Number.parseFloat(segments[0].style.flexBasis)).toBeCloseTo(61.76, 2)
    expect(Number.parseFloat(segments[1].style.flexBasis)).toBeCloseTo(32.35, 2)
    expect(screen.getAllByText('63%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Other').length).toBeGreaterThan(0)
  })

  it('highlights the matching user segment with a striped overlay', () => {
    const { container } = render(
      <VoteDistribution distribution={{ A: 70, B: 30 }} correctKey="A" userKey="B" />,
    )
    const barMarker = container.querySelector<HTMLElement>('[data-user-vote-marker="bar"]')
    const legendMarker = container.querySelector<HTMLElement>('[data-user-vote-marker="legend"]')

    expect(barMarker).not.toBeNull()
    expect(barMarker?.style.left).toBe('70%')
    expect(barMarker?.style.width).toBe('30%')
    expect(barMarker?.style.backgroundImage).toContain('repeating-linear-gradient')
    expect(legendMarker).not.toBeNull()
    expect(legendMarker?.querySelector('span')?.getAttribute('style')).toContain(
      'repeating-linear-gradient',
    )
  })

  it('uses a closed square marker when user pick is not in distribution', () => {
    const { container } = render(
      <VoteDistribution distribution={{ A: 80 }} correctKey="A" userKey="B" />,
    )

    expect(screen.getByText('B')).not.toBeNull()
    expect(screen.getByText(/not in distribution/)).not.toBeNull()
    expect(container.querySelector('[data-user-vote-marker="orphan-legend"]')).not.toBeNull()
    expect(container.querySelector('.border-dashed')).toBeNull()
  })
})
