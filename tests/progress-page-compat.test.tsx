import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PracticePage from '../src/app/(immersive)/practice/[cert]/[qid]/page'
import PracticeCompletePage from '../src/app/(immersive)/practice/[cert]/complete/page'
import BookmarksPage from '../src/app/(tabbed)/list/bookmarks/page'
import { loadBank } from '../src/data/loaders'
import type { CertCode, Question, QuestionProgress } from '../src/data/types'
import { findNextListReviewQid, findNextUnansweredQid } from '../src/hooks/use-answer'
import { browserProgress } from '../src/lib/browser-progress-module'
import { usePrefsStore } from '../src/stores/prefs-store'

const mocks = vi.hoisted(() => ({
  params: { cert: 'dva-c02', qid: '1' },
  searchParams: new URLSearchParams(),
  bank: [] as Array<{ id: number }>,
  bankLoading: false,
  question: undefined as unknown as { id: number },
  progress: null as QuestionProgress | null,
  progressLoading: false,
  router: { push: vi.fn(), replace: vi.fn() },
  recordAnswer: { mutate: vi.fn(), isPending: false },
  toggleBookmark: { mutate: vi.fn() },
  progressModule: {
    listProgress: vi.fn(),
  },
  toast: vi.fn(),
}))

const question = {
  id: 1,
  cert: 'DVA-C02',
  type: 'single',
  topic: 'Development',
  correct_answer: ['A'],
  vote_distribution: { A: 1 },
  en: {
    question: 'Which option is correct?',
    options: { A: 'Correct option', B: 'Wrong option' },
    explanation: 'Because A is correct.',
  },
  zh: {
    question: '哪一个选项正确？',
    options: { A: '正确选项', B: '错误选项' },
    explanation: '因为 A 正确。',
  },
} as const

const multiQuestion = {
  ...question,
  type: 'multi',
  correct_answer: ['A', 'B'],
  answer_count: 2,
  vote_distribution: { AB: 1 },
  en: {
    ...question.en,
    options: { A: 'Correct option A', B: 'Correct option B', C: 'Wrong option C' },
  },
  zh: {
    ...question.zh,
    options: { A: '正确选项 A', B: '正确选项 B', C: '错误选项 C' },
  },
} as const

function loadableQuestion(id: number): Question {
  return { ...question, id, correct_answer: ['A'] } as Question
}

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('../src/hooks/use-answer', () => ({
  findNextListReviewQid: vi.fn(),
  findNextUnansweredQid: vi.fn(),
  useIsBookmarked: () => ({ data: true, isLoading: false }),
  useQuestionProgress: () => ({ data: mocks.progress, isLoading: mocks.progressLoading }),
  useRecordAnswer: () => mocks.recordAnswer,
  useToggleBookmark: () => mocks.toggleBookmark,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useBookmarksList: () => ({ data: [1], isLoading: false }),
}))

vi.mock('../src/components/providers/progress-scope-provider', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/components/providers/progress-scope-provider')>()
  return {
    ...actual,
    useProgressModule: () => mocks.progressModule,
  }
})

vi.mock('../src/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock('../src/data/loaders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/loaders')>()
  return {
    ...actual,
    loadBank: vi.fn(),
  }
})

vi.mock('../src/hooks/use-question', () => ({
  useQuestion: () => ({
    data: Number(mocks.params.qid) === mocks.question.id ? mocks.question : null,
    isLoading: false,
  }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({
    data: mocks.bankLoading ? undefined : mocks.bank,
    isLoading: mocks.bankLoading,
  }),
}))

vi.mock('../src/components/domain/question-list-row', () => ({
  QuestionListRow: ({ status }: { status: string }) => (
    <div data-testid="bookmark-row-status">{status}</div>
  ),
}))

beforeEach(() => {
  mocks.params = { cert: 'dva-c02', qid: '1' }
  mocks.searchParams = new URLSearchParams()
  mocks.question = question
  mocks.bank = [question]
  mocks.bankLoading = false
  mocks.progressLoading = false
  mocks.progress = {
    qid: 1,
    correctCount: 0,
    wrongCount: 0,
    lastPicks: [],
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: true,
    bookmarkUpdatedAt: 1_700_000_000_000,
  }
  mocks.router.push.mockClear()
  mocks.router.replace.mockClear()
  mocks.recordAnswer.mutate.mockClear()
  mocks.recordAnswer.isPending = false
  mocks.toggleBookmark.mutate.mockClear()
  mocks.progressModule.listProgress.mockReset()
  mocks.progressModule.listProgress.mockReturnValue([mocks.progress])
  mocks.toast.mockClear()
  vi.mocked(loadBank).mockReset()
  vi.mocked(loadBank).mockResolvedValue([loadableQuestion(1)])
  vi.mocked(findNextListReviewQid).mockReset()
  vi.mocked(findNextListReviewQid).mockResolvedValue(null)
  vi.mocked(findNextUnansweredQid).mockReset()
  vi.mocked(findNextUnansweredQid).mockResolvedValue(null)
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('progress page compatibility', () => {
  it('lets bookmark-only progress records answer the practice question', () => {
    render(<PracticePage />)

    expect(screen.getByText('Submit')).not.toBeNull()
    expect(screen.queryByText('Wrong')).toBeNull()
  })

  it('keeps the practice question visible while local question progress is pending', () => {
    mocks.progress = null
    mocks.progressLoading = true

    render(<PracticePage />)

    expect(screen.getByText('Submit')).not.toBeNull()
    expect(screen.getByText('Which option is correct?')).not.toBeNull()
  })

  it('shows previous normal-practice results without a retry action', () => {
    mocks.progress = {
      qid: 1,
      correctCount: 1,
      wrongCount: 0,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    expect(screen.getAllByText('Correct').length).toBeGreaterThan(0)
    expect(screen.queryByText('Retry')).toBeNull()
    expect(screen.getByText('Next')).not.toBeNull()
  })

  it('starts answered list-review questions in answer mode without revealing results', () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong&set=1,2')
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    expect(screen.getByText('View last result')).not.toBeNull()
    expect(screen.getByText('Submit')).not.toBeNull()
    expect(screen.queryByText('Wrong')).toBeNull()
    expect(screen.queryByText('Because A is correct.')).toBeNull()
  })

  it('starts wrong redo session questions in answer mode without a view-last-result action', () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,2')
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    expect(screen.getByText('Skip')).not.toBeNull()
    expect(screen.getByText('Submit')).not.toBeNull()
    expect(screen.queryByText('View last result')).toBeNull()
    expect(screen.queryByText('Wrong')).toBeNull()
    expect(screen.queryByText('Because A is correct.')).toBeNull()
  })

  it('starts smart practice answered questions as mandatory fresh attempts', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1,2')
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    expect(screen.getByText('Submit')).not.toBeNull()
    expect(screen.queryByText('Skip')).toBeNull()
    expect(screen.queryByText('View last result')).toBeNull()
    expect(screen.queryByText('Wrong')).toBeNull()
    expect(screen.queryByText('Because A is correct.')).toBeNull()
  })

  it('routes smart practice without a fixed set safely home', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice')

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it.each([
    'set=1,nope',
    'set=99,100',
    'set=1,2,3,4,5,6,7,8,9,10,11',
  ])('routes smart practice with invalid fixed set %s safely home', async (query) => {
    mocks.searchParams = new URLSearchParams(`from=/smart-practice&${query}`)
    mocks.bank = Array.from({ length: 11 }, (_value, index) => ({ ...question, id: index + 1 }))

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('requires one selected option before submitting a smart practice single-select question', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1,2')

    render(<PracticePage />)

    expect(screen.queryByText('Skip')).toBeNull()
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(false)
  })

  it('requires the full answer count before submitting a smart practice multi-select question', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1,2')
    mocks.question = multiQuestion
    mocks.bank = [multiQuestion, { id: 2 }]

    render(<PracticePage />)

    expect(screen.queryByText('Skip')).toBeNull()
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option A'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option B'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(false)
  })

  it('keeps normal single-select practice rendering with skip plus disabled submit until selected', () => {
    render(<PracticePage />)

    expect(screen.getByText('Skip')).not.toBeNull()
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(false)
  })

  it('keeps normal multi-select practice rendering with skip plus full-count submit gating', () => {
    mocks.question = multiQuestion
    mocks.bank = [multiQuestion]

    render(<PracticePage />)

    expect(screen.getByText('Skip')).not.toBeNull()
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option A'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('Correct option B'))
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(false)
  })

  it('records smart practice answers and advances through the fixed set with source and set preserved', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1,2')
    mocks.bank = [question, { id: 2 }]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))

    expect(mocks.recordAnswer.mutate).toHaveBeenCalledWith(
      { qid: 1, picks: ['A'], correct: true },
      expect.any(Object),
    )

    fireEvent.click(screen.getByText('Next'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fsmart-practice&set=1%2C2',
      ),
    )
  })

  it('normalizes smart practice next URLs after dropping stale and duplicate fixed-set ids', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=99,1,1,2')
    mocks.bank = [question, { id: 2 }]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fsmart-practice&set=1%2C2',
      ),
    )
  })

  it('redirects smart practice path qids outside the fixed set to the normalized first set item', async () => {
    mocks.params = { cert: 'dva-c02', qid: '1' }
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=99,2,2,3')
    mocks.bank = [question, { id: 2 }, { id: 3 }]

    render(<PracticePage />)

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fsmart-practice&set=2%2C3',
      ),
    )
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('shows smart practice position from the fixed set', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=2,1,3')
    mocks.bank = [{ id: 2 }, question, { id: 3 }]

    render(<PracticePage />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'span' &&
          element.textContent?.replace(/\s+/g, ' ').trim() === 'Question 2 of 3',
      ),
    ).not.toBeNull()
  })

  it('routes smart practice final item to completion with source and set preserved and backs out to home', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByLabelText('Back'))
    expect(mocks.router.push).toHaveBeenCalledWith('/')

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/complete?from=%2Fsmart-practice&set=1',
      ),
    )
  })

  it('normalizes smart practice completion URLs after dropping stale and duplicate fixed-set ids', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=99,1,1')
    mocks.bank = [question]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/complete?from=%2Fsmart-practice&set=1',
      ),
    )
  })

  it('returns wrong redo URLs without a captured set to home', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo')

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('returns wrong redo URLs with an invalid captured set to home', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,nope')

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('continues wrong redo URLs with partially stale captured sets in remaining captured order', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=99,1,2')
    mocks.bank = [question, { id: 2 }]

    render(<PracticePage />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'span' &&
          element.textContent?.replace(/\s+/g, ' ').trim() === 'Question 1 of 2',
      ),
    ).not.toBeNull()

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=99%2C1%2C2',
      ),
    )
  })

  it('continues a wrong redo URL to the next captured current-bank qid when the path qid is stale', async () => {
    mocks.params = { cert: 'dva-c02', qid: '99' }
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,99,2')
    mocks.bank = [question, { id: 2 }]

    render(<PracticePage />)

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=1%2C99%2C2',
      ),
    )
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      '/practice/dva-c02/1?from=%2Fwrong-redo&set=1%2C99%2C2',
    )
  })

  it('routes a wrong redo URL to completion when a stale path qid has no later current-bank qid', async () => {
    mocks.params = { cert: 'dva-c02', qid: '99' }
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,99')
    mocks.bank = [question]

    render(<PracticePage />)

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/complete?from=%2Fwrong-redo',
      ),
    )
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      '/practice/dva-c02/1?from=%2Fwrong-redo&set=1%2C99',
    )
  })

  it('continues copied wrong redo URLs by captured order even after the question is no longer wrong', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,2')
    mocks.bank = [question, { id: 2 }]
    mocks.progress = {
      qid: 1,
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: 1_700_000_000_002,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=1%2C2',
      ),
    )
  })

  it('returns wrong redo URLs with fully stale captured sets to home', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=99,100')

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('does not regenerate a wrong redo session in-page when the captured set is missing', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo')
    mocks.bank = [question, { id: 2 }]
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      expect.stringContaining('/practice/dva-c02/'),
    )
  })

  it('shows list-review position and total in the header', () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong&set=2,1,3')
    mocks.bank = [{ id: 2 }, question, { id: 3 }]

    render(<PracticePage />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'span' &&
          element.textContent?.replace(/\s+/g, ' ').trim() === 'Question 2 of 3',
      ),
    ).not.toBeNull()
  })

  it('shows wrong redo position and total from the captured set', () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=2,1,3')
    mocks.bank = [{ id: 2 }, question, { id: 3 }]

    render(<PracticePage />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'span' &&
          element.textContent?.replace(/\s+/g, ' ').trim() === 'Question 2 of 3',
      ),
    ).not.toBeNull()
  })

  it('advances wrong redo skip through the captured set and preserves query params', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,2')
    mocks.bank = [question, { id: 2 }]

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=1%2C2',
      ),
    )
  })

  it('advances wrong redo next through the captured set after submission', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,2')
    mocks.bank = [question, { id: 2 }]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=1%2C2',
      ),
    )
  })

  it('keeps the current wrong redo session order fixed after recovering the current question', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=2,1,3')
    mocks.bank = [{ id: 2 }, question, { id: 3 }]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['A'], correct: true })
    })

    render(<PracticePage />)

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === 'span' &&
          element.textContent?.replace(/\s+/g, ' ').trim() === 'Question 2 of 3',
      ),
    ).not.toBeNull()

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/3?from=%2Fwrong-redo&set=2%2C1%2C3',
      ),
    )
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      '/practice/dva-c02/complete?from=%2Fwrong-redo',
    )
    expect(mocks.router.push).not.toHaveBeenCalledWith(
      '/practice/dva-c02/2?from=%2Fwrong-redo&set=2%2C1%2C3',
    )
  })

  it('advances wrong redo next through the captured set after an incorrect submission', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1,2')
    mocks.bank = [question, { id: 2 }]
    mocks.recordAnswer.mutate.mockImplementationOnce((_vars, options) => {
      mocks.progress = {
        qid: 1,
        correctCount: 0,
        wrongCount: 1,
        lastPicks: ['B'],
        lastCorrect: false,
        lastAnsweredAt: 1_700_000_000_002,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }
      options?.onSuccess?.(mocks.progress, { qid: 1, picks: ['B'], correct: false })
    })

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Wrong option'))
    fireEvent.click(screen.getByText('Submit'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Fwrong-redo&set=1%2C2',
      ),
    )
  })

  it('routes wrong redo final item to wrong redo completion and backs out to home', async () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo&set=1')

    render(<PracticePage />)

    fireEvent.click(screen.getByLabelText('Back'))
    expect(mocks.router.push).toHaveBeenCalledWith('/')

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/complete?from=%2Fwrong-redo',
      ),
    )
  })

  it('shows only next after viewing a list-review previous result', () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong&set=1,2')
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }

    render(<PracticePage />)

    fireEvent.click(screen.getByText('View last result'))

    expect(screen.getAllByText('Wrong').length).toBeGreaterThan(0)
    expect(screen.getByText('Because A is correct.')).not.toBeNull()
    expect(screen.queryByText('Submit')).toBeNull()
    expect(screen.queryByText('Skip')).toBeNull()
    expect(screen.getByText('Next')).not.toBeNull()
  })

  it('advances list-review next through the snapshot and preserves query params', async () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong&set=1,2')
    mocks.progress = {
      qid: 1,
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 1_700_000_000_001,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    }
    vi.mocked(findNextListReviewQid).mockResolvedValue(2)

    render(<PracticePage />)

    fireEvent.click(screen.getByText('View last result'))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/2?from=%2Flist%2Fwrong&set=1%2C2',
      ),
    )
  })

  it('routes list-review final item to the completion page', async () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong&set=1')
    vi.mocked(findNextListReviewQid).mockResolvedValue(null)

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith(
        '/practice/dva-c02/complete?from=%2Flist%2Fwrong',
      ),
    )
  })

  it('routes normal practice final item to the completion page', async () => {
    vi.mocked(findNextUnansweredQid).mockResolvedValue(null)

    render(<PracticePage />)

    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith('/practice/dva-c02/complete?from=%2F'),
    )
  })

  it('disables unsubmitted footer actions while answer recording is pending', () => {
    mocks.recordAnswer.isPending = true
    render(<PracticePage />)

    fireEvent.click(screen.getByText('Correct option'))
    fireEvent.click(screen.getByText('Submit'))

    expect(mocks.recordAnswer.mutate).not.toHaveBeenCalled()
    expect(screen.getByText('Skip').closest('button')?.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Submit').closest('button')?.hasAttribute('disabled')).toBe(true)
  })

  it('updates the exact question progress cache after recording an answer', async () => {
    const { useRecordAnswer } =
      await vi.importActual<typeof import('../src/hooks/use-answer')>('../src/hooks/use-answer')
    const cert: CertCode = 'DVA-C02'
    browserProgress.recordAnswer(1, ['A'], true, cert)
    const oldProgress = browserProgress.getProgress(1, cert) as QuestionProgress
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['progress', 'question', cert, 1], oldProgress)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useRecordAnswer(cert), { wrapper })

    act(() => {
      result.current.mutate({ qid: 1, picks: ['B'], correct: false })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(['progress', 'question', cert, 1])).toMatchObject({
      qid: 1,
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
    })
  })

  it('shows bookmark-only progress rows as unanswered', () => {
    render(<BookmarksPage />)

    expect(screen.getByTestId('bookmark-row-status').textContent).toBe('unanswered')
  })

  it('renders home completion with only the home action', () => {
    mocks.searchParams = new URLSearchParams('from=/')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Practice complete')).not.toBeNull()
    expect(
      screen.getByText('There are no unanswered questions left for this certification.'),
    ).not.toBeNull()
    expect(screen.getAllByText('Back to home')).toHaveLength(1)
    expect(screen.queryByText('Back to wrong list')).toBeNull()
  })

  it('renders wrong-list completion with list and home actions', () => {
    mocks.searchParams = new URLSearchParams('from=/list/wrong')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Wrong-list review complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to wrong list'))
    expect(mocks.router.push).toHaveBeenCalledWith('/list/wrong')

    fireEvent.click(screen.getByText('Back to home'))
    expect(mocks.router.push).toHaveBeenCalledWith('/')
  })

  it('renders all-question list completion from the all-list source', () => {
    mocks.searchParams = new URLSearchParams('from=/list')

    render(<PracticeCompletePage />)

    expect(screen.getByText('All-question review complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to list'))
    expect(mocks.router.push).toHaveBeenCalledWith('/list')
  })

  it('renders bookmark completion from the bookmark source', () => {
    mocks.searchParams = new URLSearchParams('from=/list/bookmarks')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Bookmark review complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to bookmarks'))
    expect(mocks.router.push).toHaveBeenCalledWith('/list/bookmarks')
  })

  it('renders unanswered session completion from the unanswered source', () => {
    mocks.searchParams = new URLSearchParams('from=/list/unanswered')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Unanswered session complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to unanswered'))
    expect(mocks.router.push).toHaveBeenCalledWith('/list/unanswered')
  })

  it('renders wrong redo completion with dedicated copy and only a home action', () => {
    mocks.searchParams = new URLSearchParams('from=/wrong-redo')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Wrong redo complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to home'))
    expect(mocks.router.push).toHaveBeenCalledWith('/')
    expect(screen.queryByText('Back to wrong list')).toBeNull()
  })

  it('renders smart practice completion stats from the fixed set and latest progress', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1,2,3')
    mocks.bank = [question, { ...question, id: 2 }, { ...question, id: 3 }]
    mocks.progressModule.listProgress.mockReturnValue([
      { ...mocks.progress, qid: 1, lastCorrect: true, correctCount: 1, wrongCount: 0 },
      { ...mocks.progress, qid: 2, lastCorrect: false, correctCount: 0, wrongCount: 1 },
    ])

    render(<PracticeCompletePage />)

    expect(screen.getByText(/Session complete/)).not.toBeNull()
    expect(screen.getByRole('img', { name: 'You got 1 of 3 correct' })).not.toBeNull()
    expect(screen.getByText('Accuracy').closest('div')?.textContent).toBe('33%Accuracy')
    expect(screen.getByText('Wrong').closest('div')?.textContent).toBe('2Wrong')
    expect(screen.getByText('Round size').closest('div')?.textContent).toBe('3qRound size')
    expect(screen.queryByText(/elapsed/i)).toBeNull()
    expect(screen.queryByText(/average/i)).toBeNull()
  })

  it('shows loading instead of a smart summary while the completion bank is loading', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')
    mocks.bankLoading = true

    render(<PracticeCompletePage />)

    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
    expect(screen.queryByText(/Session complete/)).toBeNull()
    expect(screen.queryByText('/ 0')).toBeNull()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', 'from=/smart-practice'],
    ['malformed', 'from=/smart-practice&set=1,nope'],
    ['fully stale', 'from=/smart-practice&set=99,100'],
    ['overlong', 'from=/smart-practice&set=1,2,3,4,5,6,7,8,9,10,11'],
  ])('routes %s smart completion fixed sets home without rendering a summary', async (_name, query) => {
    mocks.searchParams = new URLSearchParams(query)
    mocks.bank = Array.from({ length: 11 }, (_value, index) => ({ ...question, id: index + 1 }))

    render(<PracticeCompletePage />)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByText(/Session complete/)).toBeNull()
    expect(screen.queryByText('/ 0')).toBeNull()
  })

  it('starts another smart practice round from latest progress', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')
    vi.mocked(loadBank).mockResolvedValue([loadableQuestion(2), loadableQuestion(3)])
    mocks.progressModule.listProgress.mockReturnValue([
      { ...mocks.progress, qid: 1, lastCorrect: true, correctCount: 1, wrongCount: 0 },
      { ...mocks.progress, qid: 2, lastCorrect: false, correctCount: 0, wrongCount: 1 },
    ])

    render(<PracticeCompletePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Again' }))

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledTimes(1))
    expect(loadBank).toHaveBeenCalledWith('DVA-C02')
    expect(mocks.progressModule.listProgress).toHaveBeenCalledWith('DVA-C02')
    const href = mocks.router.push.mock.calls[0][0] as string
    expect(href).toMatch(/^\/practice\/dva-c02\/[23]\?from=%2Fsmart-practice&set=/)
    expect(
      new URLSearchParams(href.split('?')[1]).get('set')?.split(',').map(Number).toSorted(),
    ).toEqual([2, 3])
  })

  it('prevents duplicate smart completion starts while pending', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')
    let resolveBank: (value: Awaited<ReturnType<typeof loadBank>>) => void = () => {}
    vi.mocked(loadBank).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBank = resolve
        }),
    )

    render(<PracticeCompletePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Again' }))

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Starting...' }).disabled).toBe(
        true,
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Starting...' }))
    expect(loadBank).toHaveBeenCalledTimes(1)

    resolveBank([loadableQuestion(1)])
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledTimes(1))
  })

  it('keeps smart completion visible and shows a toast when next round generation fails', async () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')
    vi.mocked(loadBank).mockRejectedValueOnce(new Error('failed'))

    render(<PracticeCompletePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Again' }))

    await waitFor(() => {
      expect(mocks.router.push).not.toHaveBeenCalled()
      expect(mocks.toast).toHaveBeenCalledWith('Could not start smart practice. Try again.')
    })
    expect(screen.getByText(/Session complete/)).not.toBeNull()
  })

  it('returns home from smart practice completion', () => {
    mocks.searchParams = new URLSearchParams('from=/smart-practice&set=1')

    render(<PracticeCompletePage />)

    fireEvent.click(screen.getByText('Back to home'))

    expect(mocks.router.push).toHaveBeenCalledWith('/')
    expect(screen.queryByText('Back to wrong list')).toBeNull()
  })

  it('falls back to home completion for invalid sources', () => {
    mocks.searchParams = new URLSearchParams('from=/settings')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Practice complete')).not.toBeNull()
    expect(screen.queryByText('Back to wrong list')).toBeNull()
  })
})
