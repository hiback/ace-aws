import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockExamHistoryPage from '../src/app/(immersive)/mock-exam/[cert]/history/page'
import MockExamIntroPage from '../src/app/(immersive)/mock-exam/[cert]/page'
import MockExamAttemptQuestionPage from '../src/app/(immersive)/mock-exam/attempt/[attemptId]/[index]/page'
import MockExamResultPage from '../src/app/(immersive)/mock-exam/attempt/[attemptId]/result/page'
import MockExamReviewPage from '../src/app/(immersive)/mock-exam/attempt/[attemptId]/review/[index]/page'
import MockExamAnswerSheetPage from '../src/app/(immersive)/mock-exam/attempt/[attemptId]/sheet/page'
import { ProgressScopeProvider } from '../src/components/providers/progress-scope-provider'
import { loadBank } from '../src/data/loaders'
import type { Letter, Question } from '../src/data/types'
import type { MockExamRuntime } from '../src/hooks/use-mock-exam-runtime'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'
import { usePrefsStore } from '../src/stores/prefs-store'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const paramsMock = vi.hoisted(() => ({
  value: {} as Record<string, string>,
}))

const searchParamsMock = vi.hoisted(() => ({
  value: new URLSearchParams(),
}))

const runtimeMocks = vi.hoisted(() => ({
  value: null as unknown,
  useMockExamRuntime: vi.fn(),
}))

const repositoryMocks = vi.hoisted(() => ({
  getDraft: vi.fn(),
  getSubmittedAttempt: vi.fn(),
  getHistory: vi.fn(),
  getMockExamDraftRepository: vi.fn(),
}))

const accountSyncMocks = vi.hoisted(() => ({
  enqueueDirtySync: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
  useParams: () => paramsMock.value,
  useSearchParams: () => searchParamsMock.value,
  usePathname: () => '/mock-exam/attempt/test/0',
}))

vi.mock('@/data/loaders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/loaders')>()
  return {
    ...actual,
    loadBank: vi.fn(),
  }
})

vi.mock('@/hooks/use-mock-exam-runtime', () => ({
  useMockExamRuntime: runtimeMocks.useMockExamRuntime,
}))

vi.mock('@/lib/mock-exam/repository', () => ({
  getMockExamDraftRepository: repositoryMocks.getMockExamDraftRepository,
}))

vi.mock('@/components/providers/account-progress-sync-provider', () => ({
  useAccountProgressSync: () => accountSyncMocks,
}))

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  routerMocks.push.mockClear()
  routerMocks.replace.mockClear()
  paramsMock.value = { attemptId: 'attempt-render-ui', index: '0' }
  searchParamsMock.value = new URLSearchParams()
  runtimeMocks.useMockExamRuntime.mockReset()
  runtimeMocks.useMockExamRuntime.mockImplementation(() => runtimeMocks.value)
  setMockExamRuntime()
  vi.mocked(loadBank).mockReset()
  vi.mocked(loadBank).mockResolvedValue(makeBank())
  repositoryMocks.getDraft.mockReset()
  repositoryMocks.getDraft.mockResolvedValue(null)
  repositoryMocks.getSubmittedAttempt.mockReset()
  repositoryMocks.getSubmittedAttempt.mockResolvedValue(null)
  repositoryMocks.getHistory.mockReset()
  repositoryMocks.getHistory.mockResolvedValue([])
  repositoryMocks.getMockExamDraftRepository.mockReset()
  repositoryMocks.getMockExamDraftRepository.mockReturnValue({
    getDraft: repositoryMocks.getDraft,
    getSubmittedAttempt: repositoryMocks.getSubmittedAttempt,
    getHistory: repositoryMocks.getHistory,
  })
  accountSyncMocks.enqueueDirtySync.mockReset()
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'DVA-C02' })
})

afterEach(() => {
  cleanup()
})

describe('Mock Exam intro page render layer', () => {
  it('does not expose the mock exam history entry from the prep screen', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const submitted = makeSubmittedAttempt('intro-history-cache')
    client.setQueryData(['mock-exam', 'anonymous', 'history', 'DVA-C02'], [submitted])
    repositoryMocks.getHistory.mockImplementation(
      () => new Promise<SubmittedMockExamAttempt[]>(() => {}),
    )
    paramsMock.value = { cert: 'dva-c02' }

    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamIntroPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Begin exam' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Exam history/i })).toBeNull()
    expect(screen.queryByText('1 attempts')).toBeNull()
    expect(screen.queryByText('Your first mock exam')).toBeNull()
    expect(repositoryMocks.getDraft).not.toHaveBeenCalled()
  })
})

describe('Mock Exam history page render layer', () => {
  it('does not render a zero-attempt special state after empty history loads', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let resolveHistory!: (history: SubmittedMockExamAttempt[]) => void
    repositoryMocks.getHistory.mockImplementation(
      () =>
        new Promise<SubmittedMockExamAttempt[]>((resolve) => {
          resolveHistory = resolve
        }),
    )
    paramsMock.value = { cert: 'dva-c02' }

    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamHistoryPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    await act(async () => {
      resolveHistory([])
    })
    await waitFor(() =>
      expect(client.getQueryData(['mock-exam', 'anonymous', 'history', 'DVA-C02'])).toEqual([]),
    )

    expect(screen.getByText('Exam history')).toBeTruthy()
    expect(screen.queryByText('Your first mock exam')).toBeNull()
    expect(screen.queryByText('Score trend')).toBeNull()
    expect(screen.queryByText('All attempts')).toBeNull()
  })

  it('shows one submitted attempt as a single-score pass-line gauge', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    repositoryMocks.getHistory.mockResolvedValue([
      makeSubmittedAttempt('single-history-attempt', 650, false),
    ])
    paramsMock.value = { cert: 'dva-c02' }

    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamHistoryPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('img', {
        name: 'Mock exam score gauge: 650, pass score 720, Failed',
      }),
    ).toBeTruthy()
    expect(screen.queryByTestId('mock-exam-score-trend')).toBeNull()
  })

  it('shows multiple submitted attempts as a score trend line', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    repositoryMocks.getHistory.mockResolvedValue([
      makeSubmittedAttempt('latest-history-attempt', 850, true),
      makeSubmittedAttempt('previous-history-attempt', 810, true),
    ])
    paramsMock.value = { cert: 'dva-c02' }

    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamHistoryPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('mock-exam-score-trend')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Score trend' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Mock exam score gauge/ })).toBeNull()
  })

  it('shows a load error instead of the first-time empty state when history fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    repositoryMocks.getHistory.mockRejectedValue(new Error('history failed'))
    paramsMock.value = { cert: 'dva-c02' }

    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamHistoryPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Could not load exam history. Try again.')).toBeTruthy()
    expect(screen.queryByText('Your first mock exam')).toBeNull()
  })
})

describe('Mock Exam attempt question render layer', () => {
  it('renders the current question from the shared bank cache without page-level loading', async () => {
    const attempt = makeAttempt('attempt-question-render', [901, 902])
    setMockExamRuntime({ attempt })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    vi.mocked(loadBank).mockImplementation(() => new Promise(() => {}))
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage(client)

    expect(screen.getByText('02:10:00')).toBeTruthy()
    expect(screen.getByText(byTextContent('Question 1 of 2'))).toBeTruthy()
    expect(screen.getByText('Question 901')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Prev' }).getAttribute('disabled')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('disabled')).toBeNull()
  })

  it('shows a structured timed-question skeleton when primary data is unavailable', () => {
    setMockExamRuntime({ attempt: undefined })
    paramsMock.value = { attemptId: 'attempt-loading-ui', index: '0' }

    renderMockExamAttemptQuestionPage()

    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelector('header[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('main')).toBeTruthy()
    expect(document.querySelector('footer')).toBeTruthy()
  })

  it('renders the route-indexed question while runtime catches up to browser history navigation', async () => {
    const attempt = makeAttempt('attempt-question-transition-render', [901, 902])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    vi.mocked(loadBank).mockImplementation(() => new Promise(() => {}))
    const runtime = setMockExamRuntime({ attempt })
    paramsMock.value = { attemptId: attempt.id, index: '0' }
    const view = renderMockExamAttemptQuestionPage(client)

    expect(screen.getByText('Question 901')).toBeTruthy()

    paramsMock.value = { attemptId: attempt.id, index: '1' }
    view.rerender(
      <QueryClientProvider client={client}>
        <MockExamAttemptQuestionPage />
      </QueryClientProvider>,
    )

    expect(screen.getByText('02:10:00')).toBeTruthy()
    expect(screen.getByText(byTextContent('Question 2 of 2'))).toBeTruthy()
    expect(screen.getByText('Question 902')).toBeTruthy()
    expect(screen.queryByText('Question 901')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    await waitFor(() => expect(runtime.navigate).toHaveBeenCalledWith(1))
  })

  it('switches the visible multi-pick hint and action disabled states from fake runtime state', async () => {
    const attempt = makeAttempt('attempt-question-multi-render', [900, 901])
    setMockExamRuntime({
      attempt,
      currentPicks: [],
      requiredPickCount: 2,
      multiSelectionComplete: false,
    })
    vi.mocked(loadBank).mockResolvedValue([
      makeQuestion(900, 'Development', 'multi'),
      makeQuestion(901, 'Development'),
    ])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    const view = renderMockExamAttemptQuestionPage()

    expect(await screen.findByText('2 more needed')).toBeTruthy()
    expect(screen.getByText('Multi · 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('disabled')).not.toBeNull()

    const cappedAttempt = {
      ...attempt,
      questions: attempt.questions.map((question, index) =>
        index === 0 ? { ...question, userPicks: ['A', 'B'] as Letter[] } : question,
      ),
    }
    const cappedRuntime = setMockExamRuntime({
      attempt: cappedAttempt,
      currentPicks: ['A', 'B'],
      requiredPickCount: 2,
      multiSelectionComplete: true,
    })
    view.rerender(
      <QueryClientProvider client={view.client}>
        <MockExamAttemptQuestionPage />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Selected 2/2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('disabled')).toBeNull()
    const unselectedOption = screen.getByRole('button', { name: 'C C' })
    expect(unselectedOption.getAttribute('aria-disabled')).toBeNull()

    fireEvent.click(unselectedOption)

    expect(cappedRuntime.pick).toHaveBeenCalledWith('C')
  })

  it('does not show selected multi-choice picks beside the required count', async () => {
    const attempt = makeAttempt('attempt-question-picks-hidden', [900])
    setMockExamRuntime({
      attempt,
      currentPicks: ['B', 'A'],
      requiredPickCount: 2,
      multiSelectionComplete: true,
    })
    vi.mocked(loadBank).mockResolvedValue([makeQuestion(900, 'Development', 'multi')])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage()

    const selectedCount = await screen.findByText('Selected 2/2')

    expect(selectedCount.nextElementSibling).toBeNull()
    expect(screen.queryByText('Selected picks: B, A')).toBeNull()
  })

  it('renders the Mock Exam Flag visual and calls the runtime flag command', async () => {
    const attempt = makeAttempt('attempt-question-flag-render', [901])
    attempt.questions[0] = { ...attempt.questions[0], flagged: true }
    const runtime = setMockExamRuntime({ attempt })
    vi.mocked(loadBank).mockResolvedValue([makeQuestion(901, 'Development')])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage()

    const flagButton = await screen.findByRole('button', { name: 'Flagged' })
    expect(flagButton.getAttribute('aria-pressed')).toBe('true')
    expect(flagButton.className).toContain('bg-accent')

    fireEvent.click(flagButton)

    expect(runtime.toggleFlag).toHaveBeenCalledTimes(1)
  })

  it('uses warning timer color and opens and closes confirmation sheets without persistence assertions', async () => {
    const attempt = makeAttempt('attempt-question-sheets-render', [901, 902])
    attempt.questions[0] = {
      ...attempt.questions[0],
      answered: true,
      flagged: true,
      userPicks: ['A'],
      correct: true,
    }
    setMockExamRuntime({ attempt, remainingSeconds: 599, timerWarning: true })
    vi.mocked(loadBank).mockResolvedValue([
      makeQuestion(901, 'Development'),
      makeQuestion(902, 'Development'),
    ])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage()

    const timer = await screen.findByText('00:09:59')
    expect(timer.closest('div')?.className).toContain('text-danger-deep')

    fireEvent.click(screen.getByLabelText('Close'))

    expect(await screen.findByText('Exit mock exam?')).toBeTruthy()
    expect(screen.getByLabelText('1 Answered')).toBeTruthy()
    expect(screen.getByLabelText('1 Flagged')).toBeTruthy()
    expect(screen.getByLabelText('00:09:59 Time left')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stay in exam' }))
    expect(screen.queryByText('Exit mock exam?')).toBeNull()

    fireEvent.click(screen.getByLabelText('Close'))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }))

    expect(await screen.findByText('Discard this mock exam draft?')).toBeTruthy()
    expect(screen.getByText('This action cannot be undone.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByText('Discard this mock exam draft?')).toBeNull()
    expect(screen.getByText('Exit mock exam?')).toBeTruthy()
  })

  it('keeps user-driven route navigation in the page while runtime owns attempt navigation', async () => {
    const attempt = makeAttempt('attempt-question-route-render', [901, 902])
    const runtime = setMockExamRuntime({ attempt })
    vi.mocked(loadBank).mockResolvedValue([
      makeQuestion(901, 'Development'),
      makeQuestion(902, 'Development'),
    ])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage()
    await screen.findByText('Question 901')

    fireEvent.click(screen.getByRole('button', { name: 'Question grid' }))
    expect(routerMocks.push).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/sheet?from=0`)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(runtime.navigate).toHaveBeenCalledWith(1))
    expect(routerMocks.push).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/1`)
  })

  it('shows the load-error empty state when the bank cannot be loaded', async () => {
    const attempt = makeAttempt('attempt-question-load-error-render', [901])
    setMockExamRuntime({ attempt })
    vi.mocked(loadBank).mockRejectedValue(new Error('bank failed'))
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    renderMockExamAttemptQuestionPage()

    expect(
      await screen.findByText('Could not load the mock exam question. Try again.'),
    ).toBeTruthy()
  })
})

describe('Mock Exam submitted review render layer', () => {
  it('shows a load error when the submitted review cannot be loaded', async () => {
    repositoryMocks.getSubmittedAttempt.mockRejectedValue(new Error('submitted failed'))
    paramsMock.value = { attemptId: 'review-load-error', index: '0' }

    renderMockExamReviewPage()

    expect(
      await screen.findByText('Could not load the mock exam question. Try again.'),
    ).toBeTruthy()
    expect(screen.queryByText('Question not found')).toBeNull()
  })

  it('renders the reviewed question from submitted attempt and shared bank data while history metadata is pending', async () => {
    const submitted = makeSubmittedAttempt('review-history-pending')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        flagged: index === 1,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockImplementation(
      () => new Promise<SubmittedMockExamAttempt[]>(() => {}),
    )
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    vi.mocked(loadBank).mockImplementation(() => new Promise(() => {}))
    paramsMock.value = { attemptId: submitted.id, index: '1' }

    renderMockExamReviewPage(client)

    expect(await screen.findByText('Question 902')).toBeTruthy()
    expect(screen.getByText(byTextContent('Review answers 2/2'))).toBeTruthy()
    expect(screen.getByText('DVA-C02 · Attempt #1')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the selected review filter while rendering the route-indexed question', async () => {
    const submitted = makeSubmittedAttempt('review-filter-stability')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        flagged: index === 1,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    paramsMock.value = { attemptId: submitted.id, index: '1' }
    const view = renderMockExamReviewPage(client)

    await screen.findByText('Question 902')
    fireEvent.click(screen.getByRole('button', { name: 'Flagged 1' }))

    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?filter=flagged`,
    )

    paramsMock.value = { attemptId: submitted.id, index: '0' }
    searchParamsMock.value = new URLSearchParams('filter=flagged')
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: 'Flagged 1' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText('Question 901')).toBeTruthy()
    expect(screen.queryByText('Question 902')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?filter=flagged`,
    )
  })

  it('selects the first matching review question when choosing a filter', async () => {
    const submitted = makeSubmittedAttempt('review-filter-next-stability')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902, 903]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        flagged: index > 0,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [
        makeQuestion(901, 'Development'),
        makeQuestion(902, 'Development'),
        makeQuestion(903, 'Development'),
      ],
    )
    paramsMock.value = { attemptId: submitted.id, index: '0' }
    const view = renderMockExamReviewPage(client)

    await screen.findByText('Question 901')
    fireEvent.click(screen.getByRole('button', { name: 'Wrong 2' }))

    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?filter=wrong`,
    )

    paramsMock.value = { attemptId: submitted.id, index: '1' }
    searchParamsMock.value = new URLSearchParams('filter=wrong')
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Question 902')).toBeTruthy()
    expect(screen.queryByText('Question 901')).toBeNull()
    expect(screen.getByRole('button', { name: 'Wrong 2' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText('Wrong 1 / 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/2?filter=wrong`,
    )

    paramsMock.value = { attemptId: submitted.id, index: '2' }
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Question 903')).toBeTruthy()
    expect(screen.queryByText('Question 902')).toBeNull()
    expect(screen.getByText('Wrong 2 / 2')).toBeTruthy()
  })

  it('does not push history when reselecting the active review filter on a matching question', async () => {
    const submitted = makeSubmittedAttempt('review-filter-repeat-active')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    paramsMock.value = { attemptId: submitted.id, index: '1' }
    searchParamsMock.value = new URLSearchParams('filter=wrong')

    renderMockExamReviewPage(client)

    await screen.findByText('Question 902')
    routerMocks.push.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Wrong 1' }))

    expect(routerMocks.push).not.toHaveBeenCalled()
  })

  it('renders the route-indexed question when the selected review filter is empty', async () => {
    const submitted = makeSubmittedAttempt('review-empty-filter-keeps-question')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: true,
        flagged: false,
        userPicks: ['A'],
        qid: index === 0 ? 901 : 902,
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    paramsMock.value = { attemptId: submitted.id, index: '0' }
    searchParamsMock.value = new URLSearchParams('filter=wrong')

    renderMockExamReviewPage(client)

    expect(await screen.findByText('Question 901')).toBeTruthy()
    expect(screen.queryByText('No wrong questions in this exam.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Wrong 0' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.getByText('Wrong 0 / 0')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Prev' }).getAttribute('disabled')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('disabled')).not.toBeNull()
  })

  it('canonicalizes an out-of-range review index while preserving filter and sheet query', async () => {
    const submitted = makeSubmittedAttempt('review-index-canonical')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902, 903]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        flagged: index === 2,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [
        makeQuestion(901, 'Development'),
        makeQuestion(902, 'Development'),
        makeQuestion(903, 'Development'),
      ],
    )
    paramsMock.value = { attemptId: submitted.id, index: '999' }
    searchParamsMock.value = new URLSearchParams('filter=wrong&sheet=1')

    renderMockExamReviewPage(client)

    expect(await screen.findByText(byTextContent('Answer sheet'))).toBeTruthy()
    expect(routerMocks.replace).toHaveBeenCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/2?filter=wrong&sheet=1`,
    )
  })

  it('closes the review answer sheet with replace so browser back does not reopen it', async () => {
    const submitted = makeSubmittedAttempt('review-sheet-close-replace')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    paramsMock.value = { attemptId: submitted.id, index: '1' }
    searchParamsMock.value = new URLSearchParams('filter=wrong&sheet=1')

    renderMockExamReviewPage(client)

    expect(await screen.findByText(byTextContent('Answer sheet'))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to question' }))

    expect(routerMocks.replace).toHaveBeenCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?filter=wrong`,
    )
    expect(routerMocks.push).not.toHaveBeenCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?filter=wrong`,
    )
  })

  it('keeps the review answer sheet open across route index remounts and preserves jump navigation', async () => {
    const submitted = makeSubmittedAttempt('review-sheet-stability')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index === 0,
        flagged: index === 1,
        userPicks: index === 0 ? ['A'] : ['B'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [makeQuestion(901, 'Development'), makeQuestion(902, 'Development')],
    )
    paramsMock.value = { attemptId: submitted.id, index: '1' }
    const view = renderMockExamReviewPage(client)

    await screen.findByText('Question 902')
    fireEvent.click(screen.getByLabelText('Answer sheet'))
    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/1?sheet=1`,
    )
    expect(screen.queryByText(byTextContent('Answer sheet'))).toBeNull()

    searchParamsMock.value = new URLSearchParams('sheet=1')
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText(byTextContent('Answer sheet'))).toBeTruthy()

    searchParamsMock.value = new URLSearchParams()
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.queryByText(byTextContent('Answer sheet'))).toBeNull()
    expect(screen.getByText('Question 902')).toBeTruthy()

    view.unmount()
    paramsMock.value = { attemptId: submitted.id, index: '0' }
    searchParamsMock.value = new URLSearchParams('sheet=1')
    render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText(byTextContent('Answer sheet'))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '1 Correct' }))

    expect(routerMocks.push).toHaveBeenLastCalledWith(`/mock-exam/attempt/${submitted.id}/review/0`)
  })

  it('renders the route-indexed question after an answer-sheet jump and later route change', async () => {
    const submitted = makeSubmittedAttempt('review-sheet-jump-route-stability')
    submitted.questions = makeAttempt(`${submitted.id}-draft`, [901, 902, 903]).questions.map(
      (question, index) => ({
        ...question,
        answered: true,
        correct: index !== 1,
        flagged: false,
        userPicks: index === 1 ? ['B'] : ['A'],
      }),
    )
    repositoryMocks.getSubmittedAttempt.mockResolvedValue(submitted)
    repositoryMocks.getHistory.mockResolvedValue([submitted])
    const client = makeQueryClient()
    client.setQueryData(
      ['question-bank', 'DVA-C02'],
      [
        makeQuestion(901, 'Development'),
        makeQuestion(902, 'Development'),
        makeQuestion(903, 'Development'),
      ],
    )
    paramsMock.value = { attemptId: submitted.id, index: '0' }
    const view = renderMockExamReviewPage(client)

    await screen.findByText('Question 901')
    fireEvent.click(screen.getByLabelText('Answer sheet'))
    expect(routerMocks.push).toHaveBeenLastCalledWith(
      `/mock-exam/attempt/${submitted.id}/review/0?sheet=1`,
    )

    searchParamsMock.value = new URLSearchParams('sheet=1')
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '2 Wrong' }))
    expect(routerMocks.push).toHaveBeenLastCalledWith(`/mock-exam/attempt/${submitted.id}/review/1`)

    paramsMock.value = { attemptId: submitted.id, index: '1' }
    searchParamsMock.value = new URLSearchParams()
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Question 902')).toBeTruthy()

    paramsMock.value = { attemptId: submitted.id, index: '2' }
    view.rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamReviewPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Question 903')).toBeTruthy()
    expect(screen.queryByText('Question 902')).toBeNull()
  })

  it('shows a structured review skeleton while submitted attempt data is unavailable', () => {
    repositoryMocks.getSubmittedAttempt.mockImplementation(() => new Promise(() => {}))
    paramsMock.value = { attemptId: 'review-primary-loading', index: '0' }

    renderMockExamReviewPage()

    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelector('header[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('main')).toBeTruthy()
    expect(document.querySelector('footer')).toBeTruthy()
  })
})

describe('Mock Exam answer sheet render layer', () => {
  it('shows a structured answer-sheet skeleton while runtime data is unavailable', () => {
    setMockExamRuntime({ attempt: undefined })
    paramsMock.value = { attemptId: 'attempt-sheet-loading' }

    render(<MockExamAnswerSheetPage />)

    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelector('header[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('main')).toBeTruthy()
    expect(document.querySelector('footer')).toBeTruthy()
  })

  it('renders answered, flagged, and current tile states from fake runtime state', async () => {
    const attempt = makeAttempt('attempt-sheet-grid-render', [910, 911, 912])
    attempt.currentIndex = 0
    attempt.questions[0] = {
      ...attempt.questions[0],
      answered: true,
      correct: true,
      userPicks: ['A'],
    }
    attempt.questions[1] = { ...attempt.questions[1], flagged: true }
    setMockExamRuntime({ attempt })
    paramsMock.value = { attemptId: attempt.id }
    searchParamsMock.value = new URLSearchParams('from=1')

    render(<MockExamAnswerSheetPage />)

    expect(await screen.findByText('1 Answered')).toBeTruthy()
    expect(screen.getByText('2 Unanswered')).toBeTruthy()
    expect(screen.getByText('1 Flagged')).toBeTruthy()
    const answeredTile = screen.getByRole('button', { name: '1' })
    const currentFlaggedTile = screen.getByRole('button', { name: '2' })
    expect(answeredTile.className).toContain('bg-accent')
    expect(currentFlaggedTile.getAttribute('aria-current')).toBe('true')
    expect(currentFlaggedTile.className).toContain(
      'shadow-[inset_0_0_0_2px_var(--color-accent-deep)]',
    )

    fireEvent.click(screen.getByLabelText('Back'))
    expect(routerMocks.push).toHaveBeenLastCalledWith(`/mock-exam/attempt/${attempt.id}/1`)

    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(routerMocks.push).toHaveBeenLastCalledWith(`/mock-exam/attempt/${attempt.id}/2`)
  })

  it('opens and closes submit confirmation and disables submit when runtime is locked', async () => {
    const attempt = makeAttempt('attempt-sheet-submit-render', [910, 911, 912])
    setMockExamRuntime({ attempt, isLocked: true })
    paramsMock.value = { attemptId: attempt.id }

    render(<MockExamAnswerSheetPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Submit mock exam?')).toBeTruthy()
    expect(screen.getByText('3 unanswered questions will count against your score.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Submit exam' }).getAttribute('disabled'),
    ).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to review' }))
    expect(screen.queryByText('Submit mock exam?')).toBeNull()
  })

  it('uses warning timer color on the answer sheet and submit confirmation', async () => {
    const attempt = makeAttempt('attempt-sheet-warning-render', [910])
    setMockExamRuntime({ attempt, remainingSeconds: 599, timerWarning: true })
    paramsMock.value = { attemptId: attempt.id }

    render(<MockExamAnswerSheetPage />)

    const sheetTimer = await screen.findByText('00:09:59')
    expect(sheetTimer.closest('div')?.className).toContain('text-danger-deep')

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    const confirmStat = screen.getByLabelText('00:09:59 Time left')
    expect(confirmStat.querySelector('div')?.className).toContain('text-danger-deep')
  })
})

describe('Mock Exam result render layer', () => {
  it('shows a load error when the submitted result cannot be loaded', async () => {
    repositoryMocks.getSubmittedAttempt.mockRejectedValue(new Error('submitted failed'))
    paramsMock.value = { attemptId: 'result-load-error' }

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <ProgressScopeProvider>
          <MockExamResultPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText('Could not load the mock exam question. Try again.'),
    ).toBeTruthy()
    expect(screen.queryByText('Question not found')).toBeNull()
  })

  it('shares the submitted attempt snapshot cache with the review page', async () => {
    const submitted = makeSubmittedAttempt('result-review-shared-snapshot')
    repositoryMocks.getSubmittedAttempt
      .mockResolvedValueOnce(submitted)
      .mockRejectedValueOnce(new Error('background refresh failed'))
    const client = makeQueryClient()
    paramsMock.value = { attemptId: submitted.id }

    const view = render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <MockExamResultPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('850')).toBeTruthy()
    expect(client.getQueryData(['mock-exam', 'anonymous', 'submitted-attempt', submitted.id])).toBe(
      submitted,
    )

    view.unmount()
    paramsMock.value = { attemptId: submitted.id, index: '0' }
    client.setQueryData(['question-bank', 'DVA-C02'], [makeQuestion(901, 'Development')])
    vi.mocked(loadBank).mockImplementation(() => new Promise(() => {}))

    renderMockExamReviewPage(client)

    expect(screen.getByText('Question 901')).toBeTruthy()
    await waitFor(() => expect(repositoryMocks.getSubmittedAttempt).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Could not load the mock exam question. Try again.')).toBeNull()
    expect(client.getQueryData(['mock-exam', 'anonymous', 'submitted-attempt', submitted.id])).toBe(
      submitted,
    )
  })

  it('shows a structured result skeleton while submitted attempt data is unavailable', () => {
    repositoryMocks.getSubmittedAttempt.mockImplementation(() => new Promise(() => {}))
    paramsMock.value = { attemptId: 'result-loading' }

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <ProgressScopeProvider>
          <MockExamResultPage />
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('status')).toBeNull()
    expect(document.querySelector('main[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('section')).toBeTruthy()
    expect(screen.getByTestId('mock-exam-result-skeleton-actions')).toBeTruthy()
  })
})

function byTextContent(expected: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === expected &&
    Array.from(element.children).every((child) => child.textContent !== expected)
}

function renderMockExamAttemptQuestionPage(client = makeQueryClient()) {
  const view = render(
    <QueryClientProvider client={client}>
      <MockExamAttemptQuestionPage />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function renderMockExamReviewPage(client = makeQueryClient()) {
  const view = render(
    <QueryClientProvider client={client}>
      <ProgressScopeProvider>
        <MockExamReviewPage />
      </ProgressScopeProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function setMockExamRuntime(overrides: Partial<MockExamRuntime> = {}) {
  const attempt =
    overrides.attempt === undefined
      ? makeAttempt('attempt-runtime-ui', [900, 901])
      : overrides.attempt
  const snapshot = attempt?.questions[attempt.currentIndex]
  const requiredPickCount = snapshot?.type === 'multi' ? snapshot.correctAnswer.length : 1
  const runtime: MockExamRuntime = {
    attempt,
    remainingSeconds: 7800,
    timerWarning: false,
    isLocked: false,
    currentPicks: snapshot?.userPicks ?? [],
    requiredPickCount,
    multiSelectionComplete:
      snapshot?.type !== 'multi' || (snapshot?.userPicks.length ?? 0) === requiredPickCount,
    lastError: null,
    pick: vi.fn(async () => {}),
    toggleFlag: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    saveExit: vi.fn(async () => {}),
    discard: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    ...overrides,
  }
  runtimeMocks.value = runtime
  return runtime
}

function makeBank(): Question[] {
  return [
    ...Array.from({ length: 25 }, (_, index) => makeQuestion(index + 1, 'Development')),
    ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 101, 'Security')),
    ...Array.from({ length: 18 }, (_, index) => makeQuestion(index + 201, 'Deployment')),
    ...Array.from({ length: 14 }, (_, index) => makeQuestion(index + 301, 'Troubleshooting')),
  ]
}

function makeQuestion(id: number, topic: string, type: Question['type'] = 'single'): Question {
  const base = {
    id,
    cert: 'DVA-C02',
    topic,
    en: { question: `Question ${id}`, options: { A: 'A', B: 'B', C: 'C' }, explanation: 'Explain' },
    zh: { question: `题目 ${id}`, options: { A: 'A', B: 'B', C: 'C' }, explanation: '解释' },
  } as const
  if (type === 'multi') {
    return {
      ...base,
      type,
      answer_count: 2,
      correct_answer: ['A', 'B'],
      vote_distribution: {},
    }
  }
  return {
    ...base,
    type,
    correct_answer: ['A'],
    vote_distribution: {},
  }
}

function makeAttempt(id: string, qids: number[]): MockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    draftStatus: 'active',
    currentIndex: 0,
    questionCount: qids.length,
    timeLimitSeconds: 7800,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    questions: qids.map((qid) => ({
      qid,
      domain: 'Development with AWS Services',
      topic: 'Development',
      correctAnswer: qid === 900 ? ['A', 'B'] : ['A'],
      type: qid === 900 ? 'multi' : 'single',
      userPicks: [],
      correct: null,
      flagged: false,
      answered: false,
    })),
  }
}

function makeSubmittedAttempt(id: string, score = 850, passed = true): SubmittedMockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    submittedAt: Date.now() - 60_000,
    questions: makeAttempt(`${id}-draft`, [901]).questions,
    summary: {
      score,
      passed,
      correctCount: 1,
      totalCount: 1,
      unansweredCount: 0,
      accuracy: 1,
      timeUsedSeconds: 60,
      autoSubmitted: false,
      domains: [],
    },
  }
}
