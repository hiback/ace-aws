import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OriginalSheet } from '../src/components/domain/original-sheet'
import { usePrefsStore } from '../src/stores/prefs-store'

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' })
})

afterEach(cleanup)

describe('OriginalSheet', () => {
  it('uses translated labels for the title and close buttons', () => {
    render(
      <OriginalSheet
        open
        onClose={vi.fn()}
        enQuestion="What is the best option?"
        enOptions={{ A: 'Option A', B: 'Option B' }}
      />,
    )

    expect(screen.getByText('English Original')).not.toBeNull()
    expect(screen.getAllByLabelText('Close')).toHaveLength(2)
  })

  it('does not hardcode English close labels', () => {
    usePrefsStore.setState({ locale: 'zh' })

    render(
      <OriginalSheet
        open
        onClose={vi.fn()}
        enQuestion="What is the best option?"
        enOptions={{ A: 'Option A', B: 'Option B' }}
      />,
    )

    expect(screen.getByText('英文原文')).not.toBeNull()
    expect(screen.getAllByLabelText('关闭')).toHaveLength(2)
  })

  it('caps sheet height without forcing short content to fill the cap', () => {
    render(
      <OriginalSheet
        open
        onClose={vi.fn()}
        enQuestion="Short question?"
        enOptions={{ A: 'Short option.' }}
      />,
    )

    const dialog = screen.getByRole('dialog')
    const panel = dialog.lastElementChild as HTMLElement
    const panelClasses = panel.className.split(/\s+/)

    expect(panelClasses).toContain('max-h-[80%]')
    expect(panelClasses).not.toContain('h-[80%]')
  })
})
