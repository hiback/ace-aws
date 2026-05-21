import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../src/app/(tabbed)/page'
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

vi.mock('@/hooks/use-progress-stats', () => ({
  useProgressStats: () => ({ data: { answered: 0, total: 557, correct: 0 } }),
  useWrongRedoCount: () => ({ data: 2 }),
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
  vi.mocked(findNextUnansweredQid).mockReset()
  vi.mocked(findNextUnansweredQid).mockResolvedValue(3)
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'DVA-C02' })
})

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
  it('orders wrong redo, list, and bookmarks while keeping wrong redo disabled', () => {
    render(<HomePage />)

    const quickStart = screen.getByText('Quick start')
    const cards = Array.from(quickStart.nextElementSibling?.children ?? [])

    expect(quickStart.nextElementSibling?.className).toContain('grid-cols-2')
    expect(cards.map((card) => card.textContent)).toEqual([
      'Wrong redo2',
      'Question list',
      'Bookmarks0',
    ])
    expect(screen.getByText('Wrong redo').closest('a')).toBeNull()
    expect(screen.getByText('Wrong redo').closest('[aria-disabled="true"]')?.textContent).toContain(
      '2',
    )
    expect(screen.getByText('Question list').closest('a')?.getAttribute('href')).toBe('/list')
    expect(screen.getByText('Bookmarks').closest('a')?.getAttribute('href')).toBe('/list/bookmarks')
  })
})
