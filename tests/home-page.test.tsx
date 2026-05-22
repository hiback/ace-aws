import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../src/app/(tabbed)/page'
import { loadBank } from '../src/data/loaders'
import { findNextUnansweredQid } from '../src/hooks/use-answer'
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

function openCertSwitcher() {
  fireEvent.click(screen.getByLabelText('Switch certification'))
}

beforeEach(() => {
  localStorage.clear()
  routerMocks.push.mockClear()
  routerMocks.replace.mockClear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  accountPreferenceMocks.saveCurrentCert.mockReset()
  accountPreferenceMocks.saveCurrentCert.mockImplementation(
    async (cert: 'DVA-C02' | 'CLF-C02') => cert,
  )
  progressScopeMocks.progress.getStats.mockReturnValue({ answered: 0, correct: 0, total: 0 })
  progressScopeMocks.progress.listProgress.mockReturnValue([
    makeProgress(1, false),
    makeProgress(2, true),
    makeProgress(3, false),
  ])
  progressStatsMocks.wrongRedoCount = { data: 2, isPending: false }
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

    render(<HomePage />)

    expect(screen.getByText('Good morning, Ada Lovelace')).toBeTruthy()
  })

  it('falls back to email for signed-in users without a name', () => {
    setLocalHour(14)
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    }

    render(<HomePage />)

    expect(screen.getByText('Good afternoon, ada@example.com')).toBeTruthy()
  })

  it('falls back to email when the signed-in user name is blank', () => {
    setLocalHour(19)
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: '   ', email: 'ada@example.com' },
      expires: '2099-01-01T00:00:00.000Z',
    }

    render(<HomePage />)

    expect(screen.getByText('Good evening, ada@example.com')).toBeTruthy()
  })

  it('uses the local night greeting when no signed-in display name is available', () => {
    setLocalHour(23)
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }

    render(<HomePage />)

    expect(screen.getByText('Good night, CloudLearner')).toBeTruthy()
  })

  it('uses the local greeting for guests', () => {
    setLocalHour(0)
    render(<HomePage />)

    expect(screen.getByText('Good night, CloudLearner')).toBeTruthy()
  })
})

describe('HomePage cert switcher', () => {
  it('switches cert locally for guests without saving account preferences', async () => {
    render(<HomePage />)
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
    render(<HomePage />)
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
    render(<HomePage />)
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
    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(findNextUnansweredQid).toHaveBeenCalledWith(0, 'DVA-C02', progressScopeMocks.progress)
      expect(routerMocks.push).toHaveBeenCalledWith('/practice/dva-c02/3?from=%2F')
    })
  })

  it('keeps the all-answered route when no unanswered question remains', async () => {
    vi.mocked(findNextUnansweredQid).mockResolvedValueOnce(null)
    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(findNextUnansweredQid).toHaveBeenCalledWith(0, 'DVA-C02', progressScopeMocks.progress)
      expect(routerMocks.push).toHaveBeenCalledWith('/list/wrong')
    })
  })
})

describe('HomePage quick actions', () => {
  it('orders wrong redo, list, and bookmarks while enabling wrong redo when count is positive', () => {
    render(<HomePage />)

    const quickStart = screen.getByText('Quick start')
    const cards = Array.from(quickStart.nextElementSibling?.children ?? [])

    expect(quickStart.nextElementSibling?.className).toContain('grid-cols-2')
    expect(cards.map((card) => card.textContent)).toEqual([
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

  it('disables wrong redo while the count is loading', () => {
    progressStatsMocks.wrongRedoCount = { data: undefined, isPending: true }

    render(<HomePage />)

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Wrong redo/ }).disabled).toBe(
      true,
    )
  })

  it('disables wrong redo when there are no wrong redo questions', () => {
    progressStatsMocks.wrongRedoCount = { data: 0, isPending: false }

    render(<HomePage />)

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

    render(<HomePage />)

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

    render(<HomePage />)

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
      const firstView = render(<HomePage />)

      fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))
      await waitFor(() => expect(routerMocks.push).toHaveBeenCalledTimes(1))
      firstView.unmount()

      render(<HomePage />)
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
    render(<HomePage />)

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
    render(<HomePage />)

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

    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: /Wrong redo/ }))

    await waitFor(() => expect(loadBank).toHaveBeenCalledWith('DVA-C02'))
    expect(routerMocks.push).not.toHaveBeenCalled()
  })
})
