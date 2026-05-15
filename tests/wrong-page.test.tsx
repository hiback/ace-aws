import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WrongPage from '../src/app/(tabbed)/list/wrong/page'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const wrongMocks = vi.hoisted(() => ({
  progress: [] as Array<{
    qid: number
    wrongCount: number
    lastAnsweredAt: number | null
  }>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useProgressStats: () => ({
    data: { answered: 2, correct: 2, total: 2 },
    isLoading: false,
  }),
  useWrongList: () => ({
    data: wrongMocks.progress,
    isLoading: false,
  }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({
    data: [
      { id: 1, topic: 'Development', zh: { question: '题目 1' }, en: { question: 'Q1' } },
      { id: 2, topic: 'Security', zh: { question: '题目 2' }, en: { question: 'Q2' } },
    ],
    isLoading: false,
  }),
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  wrongMocks.progress = []
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('WrongPage', () => {
  it('shows the all-answered empty state when every question is answered correctly', () => {
    render(<WrongPage />)

    expect(screen.getByText("You've answered everything ✨")).not.toBeNull()
  })

  it('shows the wrong count for wrong questions', () => {
    wrongMocks.progress = [{ qid: 1, wrongCount: 3, lastAnsweredAt: 1_700_000_000_000 }]

    render(<WrongPage />)

    expect(screen.getByText('Wrong 3x')).not.toBeNull()
  })

  it('links wrong rows with the sorted wrong-list snapshot', () => {
    wrongMocks.progress = [
      { qid: 1, wrongCount: 3, lastAnsweredAt: 1_700_000_000_000 },
      { qid: 2, wrongCount: 1, lastAnsweredAt: 1_700_000_000_100 },
    ]

    render(<WrongPage />)

    expect(screen.getByText('Q2').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/2?from=%2Flist%2Fwrong&set=2%2C1',
    )
    expect(screen.getByText('Q1').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/1?from=%2Flist%2Fwrong&set=2%2C1',
    )
  })

  it('omits missing-bank wrong records from rows and snapshots', () => {
    wrongMocks.progress = [
      { qid: 1, wrongCount: 3, lastAnsweredAt: 1_700_000_000_000 },
      { qid: 99, wrongCount: 1, lastAnsweredAt: 1_700_000_000_100 },
      { qid: 2, wrongCount: 1, lastAnsweredAt: 1_700_000_000_050 },
    ]

    render(<WrongPage />)

    expect(screen.queryByText('Q99')).toBeNull()
    expect(screen.getByText('Q2').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/2?from=%2Flist%2Fwrong&set=2%2C1',
    )
    expect(screen.getByText('Q1').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/1?from=%2Flist%2Fwrong&set=2%2C1',
    )
  })

  it('shows the empty state when every wrong record is missing from the bank', () => {
    wrongMocks.progress = [{ qid: 99, wrongCount: 1, lastAnsweredAt: 1_700_000_000_000 }]

    render(<WrongPage />)

    expect(screen.getByText("You've answered everything ✨")).not.toBeNull()
    expect(document.querySelector('ul')).toBeNull()
  })
})
