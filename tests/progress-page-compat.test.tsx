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
import type { CertCode, QuestionProgress } from '../src/data/types'
import { findNextListReviewQid, findNextUnansweredQid } from '../src/hooks/use-answer'
import { progressRepo } from '../src/repositories/local-progress-repository'
import { usePrefsStore } from '../src/stores/prefs-store'

const mocks = vi.hoisted(() => ({
  params: { cert: 'dva-c02', qid: '1' },
  searchParams: new URLSearchParams(),
  bank: [] as Array<{ id: number }>,
  progress: null as QuestionProgress | null,
  router: { push: vi.fn(), replace: vi.fn() },
  recordAnswer: { mutate: vi.fn(), isPending: false },
  toggleBookmark: { mutate: vi.fn() },
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

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('../src/hooks/use-answer', () => ({
  findNextListReviewQid: vi.fn(),
  findNextUnansweredQid: vi.fn(),
  useIsBookmarked: () => ({ data: true, isLoading: false }),
  useQuestionProgress: () => ({ data: mocks.progress, isLoading: false }),
  useRecordAnswer: () => mocks.recordAnswer,
  useToggleBookmark: () => mocks.toggleBookmark,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useBookmarksList: () => ({ data: [1], isLoading: false }),
}))

vi.mock('../src/hooks/use-question', () => ({
  useQuestion: () => ({ data: question, isLoading: false }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({ data: mocks.bank, isLoading: false }),
}))

vi.mock('../src/components/domain/question-list-row', () => ({
  QuestionListRow: ({ status }: { status: string }) => (
    <div data-testid="bookmark-row-status">{status}</div>
  ),
}))

beforeEach(() => {
  mocks.params = { cert: 'dva-c02', qid: '1' }
  mocks.searchParams = new URLSearchParams()
  mocks.bank = [question]
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
    progressRepo.recordAnswer(1, ['A'], true, cert)
    const oldProgress = progressRepo.getProgress(1, cert) as QuestionProgress
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

  it('renders bookmark completion from the bookmark source', () => {
    mocks.searchParams = new URLSearchParams('from=/list/bookmarks')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Bookmark review complete')).not.toBeNull()
    fireEvent.click(screen.getByText('Back to bookmarks'))
    expect(mocks.router.push).toHaveBeenCalledWith('/list/bookmarks')
  })

  it('falls back to home completion for invalid sources', () => {
    mocks.searchParams = new URLSearchParams('from=/settings')

    render(<PracticeCompletePage />)

    expect(screen.getByText('Practice complete')).not.toBeNull()
    expect(screen.queryByText('Back to wrong list')).toBeNull()
  })
})
