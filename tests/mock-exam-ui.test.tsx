import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockExamHistoryPage from '../src/app/(immersive)/mock-exam/[cert]/history/page'
import MockExamIntroPage from '../src/app/(immersive)/mock-exam/[cert]/page'
import MockExamAttemptQuestionPage from '../src/app/(immersive)/mock-exam/attempt/[attemptId]/[index]/page'
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
  repositoryMocks.getHistory.mockReset()
  repositoryMocks.getHistory.mockResolvedValue([])
  repositoryMocks.getMockExamDraftRepository.mockReset()
  repositoryMocks.getMockExamDraftRepository.mockReturnValue({
    getDraft: repositoryMocks.getDraft,
    getHistory: repositoryMocks.getHistory,
  })
  accountSyncMocks.enqueueDirtySync.mockReset()
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'DVA-C02' })
})

afterEach(() => {
  cleanup()
})

describe('Mock Exam intro page render layer', () => {
  it('renders the history card from the mock exam history query cache', async () => {
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

    expect(await screen.findByRole('button', { name: /Exam history/i })).toBeTruthy()
    expect(screen.getByText('1 attempts')).toBeTruthy()
    expect(screen.getByText('850')).toBeTruthy()
    expect(screen.queryByText('Your first mock exam')).toBeNull()
    expect(repositoryMocks.getDraft).not.toHaveBeenCalled()
  })
})

describe('Mock Exam history page render layer', () => {
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
  it('renders the current question from the runtime snapshot and loads bank text separately', async () => {
    const attempt = makeAttempt('attempt-question-render', [901, 902])
    setMockExamRuntime({ attempt })
    vi.mocked(loadBank).mockResolvedValue([
      makeQuestion(901, 'Development'),
      makeQuestion(902, 'Development'),
    ])
    paramsMock.value = { attemptId: attempt.id, index: '0' }

    render(<MockExamAttemptQuestionPage />)

    expect(await screen.findByText('02:10:00')).toBeTruthy()
    expect(screen.getByText(byTextContent('Question 1 of 2'))).toBeTruthy()
    expect(screen.getByText('Question 901')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Prev' }).getAttribute('disabled')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('disabled')).toBeNull()
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

    const view = render(<MockExamAttemptQuestionPage />)

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
    view.rerender(<MockExamAttemptQuestionPage />)

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

    render(<MockExamAttemptQuestionPage />)

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

    render(<MockExamAttemptQuestionPage />)

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

    render(<MockExamAttemptQuestionPage />)

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

    render(<MockExamAttemptQuestionPage />)
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

    render(<MockExamAttemptQuestionPage />)

    expect(
      await screen.findByText('Could not load the mock exam question. Try again.'),
    ).toBeTruthy()
  })
})

describe('Mock Exam answer sheet render layer', () => {
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

function byTextContent(expected: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === expected &&
    Array.from(element.children).every((child) => child.textContent !== expected)
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

function makeSubmittedAttempt(id: string): SubmittedMockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    submittedAt: Date.now() - 60_000,
    questions: makeAttempt(`${id}-draft`, [901]).questions,
    summary: {
      score: 850,
      passed: true,
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
