import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from '../src/app/(tabbed)/settings/page'
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

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
  signIn: authMocks.signIn,
  signOut: authMocks.signOut,
}))

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderSettings(client = createQueryClient()) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  return { client, ...render(<SettingsPage />, { wrapper: Wrapper }) }
}

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  authMocks.signIn.mockClear()
  authMocks.signOut.mockClear()
  usePrefsStore.setState({ locale: 'en', theme: 'light' })
})

afterEach(cleanup)

describe('SettingsPage account UI', () => {
  it('shows GitHub login while signed out', () => {
    renderSettings()

    expect(screen.getByText('Account')).not.toBeNull()
    expect(screen.getByText('Sign in with GitHub')).not.toBeNull()
    expect(
      screen.getByText('Anonymous progress stays local and is not imported yet.'),
    ).not.toBeNull()
  })

  it('starts GitHub sign-in from the account card', () => {
    renderSettings()

    fireEvent.click(screen.getByText('Sign in with GitHub'))

    expect(authMocks.signIn).toHaveBeenCalledWith('github')
  })

  it('shows signed-in GitHub identity and sync placeholder', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        image: null,
        githubUsername: 'alice-gh',
      },
      expires: '2099-01-01T00:00:00.000Z',
    }

    renderSettings()

    expect(screen.getByText('Alice')).not.toBeNull()
    expect(screen.getByText('@alice-gh')).not.toBeNull()
    expect(screen.getByText('Sync coming soon')).not.toBeNull()
  })

  it('clears account progress before signing out', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null, githubUsername: 'alice-gh' },
      expires: '2099-01-01T00:00:00.000Z',
    }
    new LocalProgressRepository('account').recordAnswer(1, ['B'], false, 'DVA-C02')
    authMocks.signOut.mockImplementationOnce(() => {
      expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    })

    renderSettings()
    fireEvent.click(screen.getByText('Sign out'))

    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/settings' })
  })

  it('removes cached account progress before signing out', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null, githubUsername: 'alice-gh' },
      expires: '2099-01-01T00:00:00.000Z',
    }
    const client = createQueryClient()
    const queryKey = ['progress', 'account', 'question', 'DVA-C02', 1]
    client.setQueryData(queryKey, { qid: 1, lastPicks: ['B'] })

    renderSettings(client)
    fireEvent.click(screen.getByText('Sign out'))

    expect(client.getQueryData(queryKey)).toBeUndefined()
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/settings' })
  })

  it('still signs out when clearing account progress throws', () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: null, image: null, githubUsername: 'alice-gh' },
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

      expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/settings' })
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })
})
