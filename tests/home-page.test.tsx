import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../src/app/(tabbed)/page'
import { loadBank } from '../src/data/loaders'
import { findNextUnansweredQid } from '../src/hooks/use-answer'
import {
  getLocalMockExamAttempt,
  saveLocalMockExamAttempt,
} from '../src/lib/mock-exam/local-repository'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const accountPreferenceMocks = vi.hoisted(() => ({
  saveCurrentCert: vi.fn(),
}))

const progressScopeMocks = vi.hoisted(() => ({
  scope: 'anonymous' as 'anonymous' | 'account',
  progress: {
    getProgress: vi.fn(),
    recordAnswer: vi.fn(),
    listProgress: vi.fn(),
    listAnswered: vi.fn(),
    listWrong: vi.fn(),
    toggleBookmark: vi.fn(),
    isBookmarked: vi.fn(),
    listBookmarks: vi.fn(),
    getStats: vi.fn(),
  },
}))

const progressStatsMocks = vi.hoisted(() => ({
  wrongRedoCount: { data: 2 as number | undefined, isPending: false },
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/components/providers/account-preferences-provider', () => ({
  useAccountPreferences: () => accountPreferenceMocks,
}))

vi.mock('@/components/providers/progress-scope-provider', () => ({
  useProgressScope: () => ({
    scope: progressScopeMocks.scope,
    progress: progressScopeMocks.progress,
  }),
  useProgressModule: () => progressScopeMocks.progress,
}))

vi.mock('@/hooks/use-answer', () => ({
  findNextUnansweredQid: vi.fn(),
}))

vi.mock('@/data/loaders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/loaders')>()
  return {
    ...actual,
    loadBank: vi.fn(),
  }
})

vi.mock('@/hooks/use-progress-stats', () => ({
  useProgressStats: () => ({ data: { answered: 0, total: 557, correct: 0 } }),
  useWrongRedoCount: () => progressStatsMocks.wrongRedoCount,
  useBookmarksList: () => ({ data: [] }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => toastMocks,
}))

function openCertSwitcher() {
  fireEvent.click(screen.getByLabelText('Switch certification'))
}

function createHomeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderHome(client = createHomeQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  routerMocks.push.mockClear()
  routerMocks.replace.mockClear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  progressScopeMocks.scope = 'anonymous'
  accountPreferenceMocks.saveCurrentCert.mockReset()
  accountPreferenceMocks.saveCurrentCert.mockImplementation(
    async (cert: 'DVA-C02' | 'CLF-C02') => cert,
  )
  progressScopeMocks.progress.getStats.mockReturnValue({ answered: 0, correct: 0, total: 0 })
  progressScopeMocks.progress.listProgress.mockReset()
  progressScopeMocks.progress.listProgress.mockReturnValue([
    makeProgress(1, false),
    makeProgress(2, true),
    makeProgress(3, false),
  ])
  progressStatsMocks.wrongRedoCount = { data: 2, isPending: false }
  toastMocks.toast.mockClear()
  vi.mocked(loadBank).mockReset()
  vi.mocked(loadBank).mockResolvedValue([makeQuestion(1), makeQuestion(2), makeQuestion(3)])
  vi.mocked(findNextUnansweredQid).mockReset()
  vi.mocked(findNextUnansweredQid).mockResolvedValue(3)
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'DVA-C02' })
})

function makeQuestion(id: number) {
  return {
    id,
    cert: 'DVA-C02' as const,
    topic: 'Domain',
    type: 'single' as const,
    correct_answer: ['A' as const],
    en: { question: `Question ${id}`, options: { A: 'A' }, explanation: 'Explain' },
    zh: { question: `题目 ${id}`, options: { A: 'A' }, explanation: '解释' },
    vote_distribution: {},
  }
}

function makeProgress(qid: number, lastCorrect: boolean | null) {
  return {
    qid,
    correctCount: lastCorrect ? 1 : 0,
    wrongCount: lastCorrect === false ? 1 : 0,
    lastPicks: ['A' as const],
    lastCorrect,
    lastAnsweredAt: 1,
    bookmarked: false,
    bookmarkUpdatedAt: null,
  }
}

function makeMockExamAttempt(id: string): MockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    draftStatus: 'active',
    currentIndex: 0,
    questionCount: 2,
    timeLimitSeconds: 7800,
    startedAt: Date.now(),
    questions: [1, 2].map((qid) => ({
      qid,
      domain: 'Development with AWS Services',
      topic: 'Development',
      correctAnswer: ['A'],
      type: 'single',
      userPicks: [],
      correct: null,
      flagged: false,
      answered: false,
    })),
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setLocalHour(hour: number) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, hour))
}

describe('HomePage greeting', () => {
  it('greets signed-in users by name', () => {
    setLocalHour(6)
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderHome()

    expect(screen.getByText('Good morning, Ada Lovelace')).toBeTruthy()
  })

  it('falls back to email for signed-in users without a name', () => {
    setLocalHour(14)
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderHome()

    expect(screen.getByText('Good afternoon, ada@example.com')).toBeTruthy()
  })

  it('falls back to email when the signed-in user name is blank', () => {
    setLocalHour(19)
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: '   ', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderHome()

    expect(screen.getByText('Good evening, ada@example.com')).toBeTruthy()
  })

  it('uses the local night greeting when no signed-in display name is available', () => {
    setLocalHour(23)
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }

    renderHome()

    expect(screen.getByText('Good night, CloudLearner')).toBeTruthy()
  })

  it('uses the local greeting for guests', () => {
    setLocalHour(0)
    renderHome()

    expect(screen.getByText('Good night, CloudLearner')).toBeTruthy()
  })
})

describe('HomePage cert switcher', () => {
  it('switches cert locally for guests without saving account preferences', async () => {
    renderHome()
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    await waitFor(() => expect(usePrefsStore.getState().currentCert).toBe('CLF-C02'))
    expect(accountPreferenceMocks.saveCurrentCert).not.toHaveBeenCalled()
  })

  it('saves account preferences before switching local cert for signed-in users', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    let resolveSave: (cert: 'DVA-C02' | 'CLF-C02') => void = () => {}
    accountPreferenceMocks.saveCurrentCert.mockImplementationOnce(
      () =>
        new Promise<'DVA-C02' | 'CLF-C02'>((resolve) => {
          resolveSave = resolve
        }),
    )
    renderHome()
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    expect(accountPreferenceMocks.saveCurrentCert).toHaveBeenCalledWith('CLF-C02')
    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')

    resolveSave('CLF-C02')
    await waitFor(() => {
      expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
    })
  })

  it('keeps the old cert selected and shows an error when signed-in save fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    accountPreferenceMocks.saveCurrentCert.mockRejectedValueOnce(new Error('failed'))
    renderHome()
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not save your selection. Try again.',
    )
    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
  })
})

describe('HomePage continue practice', () => {
  it('finds the next unanswered question with the active progress module', async () => {
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(findNextUnansweredQid).toHaveBeenCalledWith(0, 'DVA-C02', progressScopeMocks.progress)
      expect(routerMocks.push).toHaveBeenCalledWith('/practice/dva-c02/3?from=%2F')
    })
    expect(loadBank).not.toHaveBeenCalled()
    expect(progressScopeMocks.progress.listProgress).not.toHaveBeenCalled()
  })

  it('keeps the all-answered route when no unanswered question remains', async () => {
    vi.mocked(findNextUnansweredQid).mockResolvedValueOnce(null)
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(findNextUnansweredQid).toHaveBeenCalledWith(0, 'DVA-C02', progressScopeMocks.progress)
      expect(routerMocks.push).toHaveBeenCalledWith('/list/wrong')
    })
  })
})

describe('HomePage quick actions', () => {
  it('shows the normal mock exam start entry for the selected certification', async () => {
    renderHome()

    expect(await screen.findByRole('heading', { name: 'Mock Exam' })).toBeTruthy()
    expect(screen.getByText('DVA-C02')).toBeTruthy()
    expect(screen.getByText('130 min')).toBeTruthy()
    expect(screen.getByText('65 Qs')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Start/ }))

    expect(routerMocks.push).toHaveBeenCalledWith('/mock-exam/dva-c02')
  })

  it('shows a mock exam resume card for a deliberately saved draft', async () => {
    const attempt = makeMockExamAttempt('attempt-saved-home')
    saveLocalMockExamAttempt({
      ...attempt,
      draftStatus: 'saved',
      currentIndex: 1,
      timeLimitSeconds: 3600,
      questions: attempt.questions.map((question, index) =>
        index === 0
          ? { ...question, userPicks: ['A'], answered: true, correct: true, flagged: true }
          : question,
      ),
    })

    renderHome()

    expect(await screen.findByRole('heading', { name: 'Mock Exam' })).toBeTruthy()
    expect(screen.queryByText('Resume draft')).toBeNull()
    expect(screen.getByText('Paused')).toBeTruthy()
    expect(screen.getByText('DVA-C02')).toBeTruthy()
    expect(screen.getByText('01:00:00')).toBeTruthy()
    expect(screen.getByText('left')).toBeTruthy()
    expect(screen.getByText('1/2 Answered')).toBeTruthy()
    expect(screen.getByText('Time left saved')).toBeTruthy()

    const savedCard = screen.getByTestId('mock-exam-saved-entry')
    expect(savedCard).toBeTruthy()

    const primaryPauseIcon = savedCard.querySelector('svg')
    expect(primaryPauseIcon).not.toBeNull()
    expect(primaryPauseIcon?.querySelector('circle')).toBeNull()

    const progressbar = screen.getByRole('progressbar', { name: 'Mock exam answered progress' })
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0')
    expect(progressbar.getAttribute('aria-valuemax')).toBe('2')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: /Resume/ }))

    await waitFor(() =>
      expect(routerMocks.push).toHaveBeenCalledWith('/mock-exam/attempt/attempt-saved-home/1'),
    )
    await waitFor(() =>
      expect(getLocalMockExamAttempt('attempt-saved-home')).toMatchObject({
        draftStatus: 'active',
      }),
    )
  })

  it('updates the saved mock exam card from the draft query cache', async () => {
    const client = createHomeQueryClient()
    const draftQueryKey = ['mock-exam', 'anonymous', 'draft', 'DVA-C02']
    const draft = {
      ...makeMockExamAttempt('attempt-saved-query-home'),
      draftStatus: 'saved' as const,
      currentIndex: 1,
      timeLimitSeconds: 3600,
    }

    renderHome(client)

    expect(screen.queryByTestId('mock-exam-saved-entry')).toBeNull()
    await waitFor(() => expect(client.getQueryState(draftQueryKey)?.status).toBe('success'))

    act(() => {
      client.setQueryData(draftQueryKey, draft)
    })

    expect(await screen.findByTestId('mock-exam-saved-entry')).toBeTruthy()
    expect(screen.getByText('Paused')).toBeTruthy()
    expect(screen.getByText('01:00:00')).toBeTruthy()
  })

  it('recovers an interrupted active mock exam draft directly at the last question', async () => {
    saveLocalMockExamAttempt({
      ...makeMockExamAttempt('attempt-active-home'),
      draftStatus: 'active',
      currentIndex: 1,
    })

    renderHome()

    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith('/mock-exam/attempt/attempt-active-home/1')
    })
  })

  it('uses only the selected certification draft after switching certifications', async () => {
    saveLocalMockExamAttempt({
      ...makeMockExamAttempt('attempt-saved-dva-home'),
      draftStatus: 'saved',
      timeLimitSeconds: 3600,
    })

    renderHome()

    expect(await screen.findByTestId('mock-exam-saved-entry')).toBeTruthy()
    expect(screen.getByText('Paused')).toBeTruthy()

    openCertSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    await waitFor(() => {
      expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
    })
    expect(screen.queryByText('Resume draft')).toBeNull()
    expect(await screen.findByText('CLF-C02')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Start/ }))

    expect(routerMocks.push).toHaveBeenCalledWith('/mock-exam/clf-c02')
  })

  it('orders smart practice before wrong redo, list, and bookmarks while enabling wrong redo when count is positive', () => {
    renderHome()

    const quickStart = screen.getByText('Quick start')
    const cards = Array.from(quickStart.nextElementSibling?.children ?? [])

    expect(quickStart.nextElementSibling?.className).toContain('grid-cols-2')
    expect(cards.map((card) => card.textContent)).toEqual([
      'Smart practice10 questions',
      'Wrong redo2',
      'Question list',
      'Bookmarks0',
    ])
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
      false,
    )
    expect(screen.getByText('Question list').closest('a')?.getAttribute('href')).toBe('/list')
    expect(screen.getByText('Bookmarks').closest('a')?.getAttribute('href')).toBe('/list/bookmarks')
  })

  it('starts a smart practice session with a fixed current-bank set', async () => {
    vi.mocked(loadBank).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => makeQuestion(index + 1)),
    )
    progressScopeMocks.progress.listProgress.mockReturnValue([makeProgress(99, false)])

    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))

    await waitFor(() => {
      expect(loadBank).toHaveBeenCalledWith('DVA-C02')
      expect(progressScopeMocks.progress.listProgress).toHaveBeenCalledWith('DVA-C02')
      expect(routerMocks.push).toHaveBeenCalledTimes(1)
    })
    const href = routerMocks.push.mock.calls[0][0] as string
    const query = new URLSearchParams(href.split('?')[1])
    const set = query.get('set')?.split(',').map(Number) ?? []

    expect(query.get('from')).toBe('/smart-practice')
    expect(set).toHaveLength(10)
    expect(new Set(set).size).toBe(10)
    expect(set.every((qid) => qid >= 1 && qid <= 12)).toBe(true)
    expect(href).toContain(`/practice/dva-c02/${set[0]}?`)
  })

  it('starts smart practice from the active progress module for the selected certification only', async () => {
    usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'CLF-C02' })
    vi.mocked(loadBank).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        ...makeQuestion(index + 101),
        cert: 'CLF-C02' as const,
      })),
    )
    progressScopeMocks.progress.listProgress.mockImplementation((cert: 'DVA-C02' | 'CLF-C02') => {
      if (cert === 'DVA-C02') return [makeProgress(1, false), makeProgress(2, false)]
      return [makeProgress(101, false), makeProgress(102, true)]
    })

    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
    expect(loadBank).toHaveBeenCalledWith('CLF-C02')
    expect(progressScopeMocks.progress.listProgress).toHaveBeenCalledWith('CLF-C02')
    expect(progressScopeMocks.progress.listProgress).not.toHaveBeenCalledWith('DVA-C02')

    const href = routerMocks.push.mock.calls[0][0] as string
    const query = new URLSearchParams(href.split('?')[1])
    const set = query.get('set')?.split(',').map(Number) ?? []
    expect(href).toMatch(/^\/practice\/clf-c02\/\d+\?from=%2Fsmart-practice&set=/)
    expect(set).toHaveLength(10)
    expect(set.every((qid) => qid >= 101 && qid <= 112)).toBe(true)
    expect(set).not.toEqual(expect.arrayContaining([1, 2]))
  })

  it('disables smart practice while generating and ignores duplicate taps', async () => {
    let resolveBank: (value: Awaited<ReturnType<typeof loadBank>>) => void = () => {}
    vi.mocked(loadBank).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBank = resolve
        }),
    )
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: /Smart practice/ }).disabled,
      ).toBe(true)
    })
    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))
    expect(loadBank).toHaveBeenCalledTimes(1)

    resolveBank([makeQuestion(1), makeQuestion(2), makeQuestion(3)])
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
  })

  it('stays on home and shows a toast when smart practice generation fails', async () => {
    vi.mocked(loadBank).mockRejectedValueOnce(new Error('failed'))
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))

    await waitFor(() => {
      expect(routerMocks.push).not.toHaveBeenCalled()
      expect(toastMocks.toast).toHaveBeenCalledWith('Could not start smart practice. Try again.')
    })
  })

  it('stays on home and shows a toast when smart practice has no questions', async () => {
    vi.mocked(loadBank).mockResolvedValueOnce([])
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Smart practice/ }))

    await waitFor(() => {
      expect(routerMocks.push).not.toHaveBeenCalled()
      expect(toastMocks.toast).toHaveBeenCalledWith('Could not start smart practice. Try again.')
    })
  })

  it('disables wrong redo while the count is loading', () => {
    progressStatsMocks.wrongRedoCount = { data: undefined, isPending: true }

    renderHome()

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
      true,
    )
  })

  it('disables wrong redo when there are no wrong redo questions', () => {
    progressStatsMocks.wrongRedoCount = { data: 0, isPending: false }

    renderHome()

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
      true,
    )
  })

  it('starts a wrong redo session from the current-bank latest incorrect answers', async () => {
    progressScopeMocks.progress.listProgress.mockReturnValue([
      makeProgress(1, false),
      makeProgress(2, false),
      makeProgress(3, true),
      makeProgress(4, false),
    ])
    vi.mocked(loadBank).mockResolvedValue([makeQuestion(1), makeQuestion(2), makeQuestion(3)])

    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    await waitFor(() => {
      expect(loadBank).toHaveBeenCalledWith('DVA-C02')
      expect(progressScopeMocks.progress.listProgress).toHaveBeenCalledWith('DVA-C02')
      expect(routerMocks.push).toHaveBeenCalledTimes(1)
    })
    const href = routerMocks.push.mock.calls[0][0] as string
    expect(href).toMatch(/^\/practice\/dva-c02\/[12]\?/)
    const query = new URLSearchParams(href.split('?')[1])
    const set = query.get('set')?.split(',').map(Number)
    expect(query.get('from')).toBe('/wrong-redo')
    expect(set?.toSorted()).toEqual([1, 2])
    expect(href).toContain(`/practice/dva-c02/${set?.[0]}?`)
  })

  it('starts the next wrong redo session from home without recovered wrong questions', async () => {
    const wrongQuestionsAfterRecovery = [
      {
        ...makeProgress(1, true),
        wrongCount: 1,
        lastPicks: ['A' as const],
        lastAnsweredAt: 2,
      },
      makeProgress(2, false),
    ]
    progressScopeMocks.progress.listProgress.mockReturnValue(wrongQuestionsAfterRecovery)
    progressStatsMocks.wrongRedoCount = { data: 1, isPending: false }
    vi.mocked(loadBank).mockResolvedValue([makeQuestion(1), makeQuestion(2), makeQuestion(3)])

    renderHome()

    expect(screen.getByText('Wrong redo').parentElement?.textContent).toContain('1')

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
    const href = routerMocks.push.mock.calls[0][0] as string
    const query = new URLSearchParams(href.split('?')[1])

    expect(query.get('from')).toBe('/wrong-redo')
    expect(query.get('set')?.split(',').map(Number)).toEqual([2])
    expect(href).toBe('/practice/dva-c02/2?from=%2Fwrong-redo&set=2')
  })

  it('creates a fresh random order on each wrong redo start', async () => {
    progressScopeMocks.progress.listProgress.mockReturnValue([
      makeProgress(1, false),
      makeProgress(2, false),
      makeProgress(3, false),
    ])
    const random = vi.spyOn(Math, 'random')
    try {
      random
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.99)
      const firstView = renderHome()

      fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))
      await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
      firstView.unmount()

      renderHome()
      fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))
      await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(2))

      const firstHref = routerMocks.push.mock.calls[0][0] as string
      const secondHref = routerMocks.push.mock.calls[1][0] as string
      const firstSet = new URLSearchParams(firstHref.split('?')[1])
        .get('set')
        ?.split(',')
        .map(Number)
      const secondSet = new URLSearchParams(secondHref.split('?')[1])
        .get('set')
        ?.split(',')
        .map(Number)
      expect(firstSet?.toSorted()).toEqual([1, 2, 3])
      expect(secondSet?.toSorted()).toEqual([1, 2, 3])
      expect(firstHref).not.toBe(secondHref)
    } finally {
      random.mockRestore()
    }
  })

  it('disables wrong redo while generating the session', async () => {
    let resolveBank: (value: Awaited<ReturnType<typeof loadBank>>) => void = () => {}
    vi.mocked(loadBank).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBank = resolve
        }),
    )
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
        true,
      )
    })
    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))
    expect(loadBank).toHaveBeenCalledTimes(1)

    resolveBank([makeQuestion(1), makeQuestion(2), makeQuestion(3)])
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
  })

  it('keeps wrong redo disabled after navigation starts to prevent duplicate sessions', async () => {
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    expect(loadBank).toHaveBeenCalledTimes(1)
    expect(routerMocks.push).toHaveBeenCalledTimes(1)
  })

  it('stays on home when click-time capture is empty', async () => {
    progressScopeMocks.progress.listProgress.mockReturnValue([makeProgress(1, true)])

    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    await waitFor(() => expect(loadBank).toHaveBeenCalledWith('DVA-C02'))
    expect(routerMocks.push).not.toHaveBeenCalled()
  })
})
