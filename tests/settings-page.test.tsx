import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from '../src/app/(tabbed)/settings/page'
import { ToastHost } from '../src/hooks/use-toast'
import { LocalProgressRepository } from '../src/repositories/local-progress-repository'
import { usePrefsStore } from '../src/stores/prefs-store'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

const routerMocks = vi.hoisted(() => ({
  back: vi.fn(),
}))

const onboardingMocks = vi.hoisted(() => ({
  resetOnboarding: vi.fn(),
}))

const syncMocks = vi.hoisted(() => ({
  value: {
    enqueueDirtySync: vi.fn(),
    status: 'synced' as 'syncing' | 'failed' | 'dirty' | 'synced',
    lastSyncedAt: null as number | null,
    hasDirtyProgress: false,
    isImporting: false,
    anonymousImportAvailable: false,
    importAnonymousProgress: vi.fn(async () => ({ ok: true as const })),
    syncNow: vi.fn(async () => ({ ok: true as const })),
    syncBeforeSignOut: vi.fn(async () => ({ ok: true as const })),
    discardAccountSyncState: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
  usePathname: () => '/settings',
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
  signIn: authMocks.signIn,
  signOut: authMocks.signOut,
}))

vi.mock('@/lib/onboarding-client', () => ({
  resetOnboarding: onboardingMocks.resetOnboarding,
}))

vi.mock('@/components/providers/account-progress-sync-provider', () => ({
  useAccountProgressSync: () => syncMocks.value,
}))

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderSettings(client = createQueryClient()) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  return {
    client,
    ...render(
      <>
        <SettingsPage />
        <ToastHost />
      </>,
      { wrapper: Wrapper },
    ),
  }
}

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  authMocks.signIn.mockClear()
  authMocks.signOut.mockClear()
  onboardingMocks.resetOnboarding.mockReset()
  onboardingMocks.resetOnboarding.mockResolvedValue(undefined)
  syncMocks.value.status = 'synced'
  syncMocks.value.lastSyncedAt = null
  syncMocks.value.hasDirtyProgress = false
  syncMocks.value.isImporting = false
  syncMocks.value.anonymousImportAvailable = false
  syncMocks.value.importAnonymousProgress.mockClear()
  syncMocks.value.importAnonymousProgress.mockResolvedValue({ ok: true })
  syncMocks.value.syncNow.mockClear()
  syncMocks.value.syncNow.mockResolvedValue({ ok: true })
  syncMocks.value.syncBeforeSignOut.mockClear()
  syncMocks.value.syncBeforeSignOut.mockResolvedValue({ ok: true })
  syncMocks.value.discardAccountSyncState.mockClear()
  usePrefsStore.setState({ locale: 'en', theme: 'light' })
})

afterEach(cleanup)

describe('SettingsPage account UI', () => {
  it('shows GitHub login while signed out', () => {
    renderSettings()

    expect(screen.getByText('Account')).not.toBeNull()
    expect(screen.getByText('Sign in with GitHub')).not.toBeNull()
  })

  it('starts GitHub sign-in from the account card', () => {
    renderSettings()

    fireEvent.click(screen.getByText('Sign in with GitHub'))

    expect(authMocks.signIn).toHaveBeenCalledWith('github')
  })

  it('shows signed-in GitHub identity and cert sync status', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: {
        id: 'user-1',
        name: 'hiback',
        email: 'alice@example.com',
        image: null,
      },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderSettings()

    expect(screen.getByText('hiback')).not.toBeNull()
    expect(screen.getByText('alice@example.com')).not.toBeNull()
    expect(screen.queryByText('Signed in')).toBeNull()
    expect(screen.getByText('Synced')).not.toBeNull()
    expect(screen.getByText(/Not synced yet/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeNull()
  })

  it('shows sync state and short last synced time from the sync provider', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.status = 'dirty'
    syncMocks.value.lastSyncedAt = Date.parse('2026-05-17T12:34:00.000Z')

    renderSettings()

    expect(screen.getByText('Unsynced progress')).not.toBeNull()
    expect(screen.getByText(/Last synced: /)?.textContent).toMatch(
      /Last synced: \d{2}\/\d{2} \d{2}:\d{2}/,
    )
  })

  it('runs manual sync from Settings', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(syncMocks.value.syncNow).toHaveBeenCalledTimes(1))
  })

  it('shows and runs manual anonymous progress import when valid anonymous progress exists', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.anonymousImportAvailable = true

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Import anonymous progress' }))

    await waitFor(() => expect(syncMocks.value.importAnonymousProgress).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Certifications:/)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Anonymous progress imported.')
  })

  it('does not show manual anonymous progress import when no valid anonymous progress exists', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderSettings()

    expect(screen.queryByRole('button', { name: 'Import anonymous progress' })).toBeNull()
  })

  it('disables manual anonymous progress import while import is running', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.anonymousImportAvailable = true
    syncMocks.value.isImporting = true

    renderSettings()

    expect(screen.getByRole('button', { name: 'Import anonymous progress' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('shows concise failure feedback when manual anonymous progress import fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.anonymousImportAvailable = true
    syncMocks.value.importAnonymousProgress.mockResolvedValueOnce({
      ok: false,
      reason: 'temporary',
    } as never)

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Import anonymous progress' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Anonymous progress could not import right now. It is still saved here.',
      ),
    )
  })

  it('disables sync and sign-out controls while anonymous progress import is running', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.isImporting = true

    renderSettings()

    expect(screen.getByRole('button', { name: 'Sync now' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveProperty('disabled', true)
  })

  it('clears account progress before signing out', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    new LocalProgressRepository('account').recordAnswer(1, ['B'], false, 'DVA-C02')
    authMocks.signOut.mockImplementationOnce(() => {
      expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    })

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
    })
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
  })

  it('flushes dirty progress before signing out', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.hasDirtyProgress = true

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(syncMocks.value.syncBeforeSignOut).toHaveBeenCalledTimes(1))
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })

  it('asks the sync provider to flush before sign-out even when rendered state has no dirty progress', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.hasDirtyProgress = false

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(syncMocks.value.syncBeforeSignOut).toHaveBeenCalledTimes(1))
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })

  it('keeps sign-out disabled while the redirect sign-out call is pending', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    authMocks.signOut.mockImplementationOnce(() => new Promise(() => {}))

    renderSettings()
    const signOutButton = screen.getByRole('button', { name: 'Sign out' })
    fireEvent.click(signOutButton)
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledTimes(1))

    expect(signOutButton).toHaveProperty('disabled', true)
    fireEvent.click(signOutButton)
    expect(authMocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('shows retry and still-sign-out actions when dirty sign-out sync temporarily fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.hasDirtyProgress = true
    syncMocks.value.syncBeforeSignOut.mockResolvedValueOnce({
      ok: false,
      reason: 'temporary',
    } as never)

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(screen.getByText('Unsynced progress remains')).not.toBeNull())
    expect(authMocks.signOut).not.toHaveBeenCalled()

    syncMocks.value.syncBeforeSignOut.mockResolvedValueOnce({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }))
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }))
  })

  it('clears account mirror and sync metadata when still signing out', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.hasDirtyProgress = true
    syncMocks.value.syncBeforeSignOut.mockResolvedValueOnce({
      ok: false,
      reason: 'temporary',
    } as never)

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(screen.getByText('Unsynced progress remains')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Still sign out' }))

    expect(syncMocks.value.discardAccountSyncState).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }))
  })

  it('disables sign-out confirmation actions while anonymous progress import is running', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    syncMocks.value.hasDirtyProgress = true
    syncMocks.value.syncBeforeSignOut.mockResolvedValueOnce({
      ok: false,
      reason: 'temporary',
    } as never)
    const view = renderSettings()
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(screen.getByText('Unsynced progress remains')).not.toBeNull())

    syncMocks.value.isImporting = true
    view.rerender(<SettingsPage />)

    expect(screen.getByRole('button', { name: 'Retry sync' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Still sign out' })).toHaveProperty('disabled', true)
  })

  it('removes cached account progress before signing out', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    const client = createQueryClient()
    const queryKey = ['progress', 'account', 'question', 'DVA-C02', 1]
    client.setQueryData(queryKey, { qid: 1, lastPicks: ['B'] })
    authMocks.signOut.mockImplementationOnce(() => {
      expect(client.getQueryData(queryKey)).toBeUndefined()
    })

    renderSettings(client)
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
    })
    expect(client.getQueryData(queryKey)).toBeUndefined()
  })

  it('still signs out when clearing account progress throws', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    renderSettings()

    const originalLocalStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        ...originalLocalStorage,
        removeItem: vi.fn(() => {
          throw new DOMException('localStorage disabled', 'SecurityError')
        }),
      },
    })

    try {
      fireEvent.click(screen.getByText('Sign out'))

      await waitFor(() => {
        expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
      })
      expect(onboardingMocks.resetOnboarding).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })

  it('still signs out when resetting onboarding throws', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }
    onboardingMocks.resetOnboarding.mockRejectedValueOnce(new Error('cookie reset failed'))

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
    })
    expect(onboardingMocks.resetOnboarding).toHaveBeenCalledTimes(1)
  })
})
