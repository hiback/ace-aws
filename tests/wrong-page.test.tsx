import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WrongPage from '../src/app/(tabbed)/list/wrong/page'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
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
    data: [],
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
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('WrongPage', () => {
  it('shows the all-answered empty state when every question is answered correctly', () => {
    render(<WrongPage />)

    expect(screen.getByText("You've answered everything ✨")).not.toBeNull()
  })
})
