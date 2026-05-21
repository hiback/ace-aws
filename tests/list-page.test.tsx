import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ListPage from '../src/app/(tabbed)/list/page'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const listMocks = vi.hoisted(() => ({
  bank: [
    { id: 2, topic: 'Security', zh: { question: '题目 2' }, en: { question: 'Q2' } },
    { id: 1, topic: 'Development', zh: { question: '题目 1' }, en: { question: 'Q1' } },
  ],
  progress: [
    {
      qid: 1,
      correctCount: 0,
      wrongCount: 2,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_000,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    },
    {
      qid: 2,
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: 1_700_000_000_100,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    },
  ],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useProgressList: () => ({ data: listMocks.progress, isLoading: false }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({
    data: listMocks.bank,
    isLoading: false,
  }),
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  listMocks.bank = [
    { id: 2, topic: 'Security', zh: { question: '题目 2' }, en: { question: 'Q2' } },
    { id: 1, topic: 'Development', zh: { question: '题目 1' }, en: { question: 'Q1' } },
  ]
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('ListPage', () => {
  it('shows every question in question-number order with latest state and a stable all-question snapshot', () => {
    render(<ListPage />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toContain('Q1')
    expect(links[0].getAttribute('href')).toBe('/practice/dva-c02/1?from=%2Flist&set=1%2C2')
    expect(links[1].textContent).toContain('Q2')
    expect(links[1].getAttribute('href')).toBe('/practice/dva-c02/2?from=%2Flist&set=1%2C2')
    expect(screen.getByText('Wrong')).not.toBeNull()
    expect(screen.getByText('Correct')).not.toBeNull()
    expect(screen.getByText('Wrong 2x')).not.toBeNull()
    expect(screen.getByText('Wrong 1x')).not.toBeNull()
  })

  it('shows a fallback empty state when the current bank has no questions', () => {
    listMocks.bank = []

    render(<ListPage />)

    expect(screen.getByText('No questions available.')).not.toBeNull()
    expect(document.querySelector('ul')).toBeNull()
  })
})
