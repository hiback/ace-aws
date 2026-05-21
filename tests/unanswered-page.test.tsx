import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UnansweredPage from '../src/app/(tabbed)/list/unanswered/page'
import type { QuestionProgress } from '../src/data/types'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const listMocks = vi.hoisted(() => ({
  progress: [
    {
      qid: 1,
      correctCount: 0,
      wrongCount: 0,
      lastPicks: [],
      lastCorrect: null,
      lastAnsweredAt: null,
      bookmarked: true,
      bookmarkUpdatedAt: 1_700_000_000_000,
    },
    {
      qid: 2,
      correctCount: 1,
      wrongCount: 0,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: 1_700_000_000_100,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    },
  ] as QuestionProgress[],
}))

const defaultProgress = [...listMocks.progress]

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useProgressList: () => ({ data: listMocks.progress, isLoading: false }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({
    data: [
      { id: 3, topic: 'Security', zh: { question: '题目 3' }, en: { question: 'Q3' } },
      { id: 2, topic: 'Security', zh: { question: '题目 2' }, en: { question: 'Q2' } },
      { id: 1, topic: 'Development', zh: { question: '题目 1' }, en: { question: 'Q1' } },
    ],
    isLoading: false,
  }),
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  listMocks.progress = [...defaultProgress]
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('UnansweredPage', () => {
  it('shows questions without submitted answers, including bookmark-only progress, with a stable snapshot', () => {
    render(<UnansweredPage />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toContain('Q1')
    expect(links[0].getAttribute('href')).toBe(
      '/practice/dva-c02/1?from=%2Flist%2Funanswered&set=1%2C3',
    )
    expect(links[1].textContent).toContain('Q3')
    expect(links[1].getAttribute('href')).toBe(
      '/practice/dva-c02/3?from=%2Flist%2Funanswered&set=1%2C3',
    )
    expect(screen.queryByText('Q2')).toBeNull()
  })

  it('shows the all-answered empty state when no unanswered questions remain', () => {
    listMocks.progress = [
      {
        ...defaultProgress[0],
        correctCount: 1,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_000,
      },
      defaultProgress[1],
      {
        qid: 3,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_200,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
    ]

    render(<UnansweredPage />)

    expect(screen.getByText("You've answered everything ✨")).not.toBeNull()
    expect(document.querySelector('ul')).toBeNull()
  })
})
