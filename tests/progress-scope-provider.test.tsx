import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProgressScopeProvider,
  useProgressScope,
} from '../src/components/providers/progress-scope-provider'
import {
  ACCOUNT_PROGRESS_OWNER_KEY,
  LocalProgressRepository,
} from '../src/repositories/local-progress-repository'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <ProgressScopeProvider>{children}</ProgressScopeProvider>
    </QueryClientProvider>
  )
}

describe('ProgressScopeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    authMocks.status = 'unauthenticated'
    authMocks.session = null
  })

  it('uses anonymous scope without a session', () => {
    const { result } = renderHook(() => useProgressScope(), { wrapper })

    expect(result.current.scope).toBe('anonymous')
  })

  it('uses account scope with an authenticated session', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }

    const { result } = renderHook(() => useProgressScope(), { wrapper })

    await waitFor(() => expect(result.current.scope).toBe('account'))

    result.current.repository.recordAnswer(1, ['B'], false, 'DVA-C02')

    expect(result.current.scope).toBe('account')
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')?.lastPicks).toEqual([
      'B',
    ])
    expect(new LocalProgressRepository('anonymous').getProgress(1, 'DVA-C02')).toBeNull()
  })

  it('clears an existing account mirror owned by another user before exposing account scope', async () => {
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-2' }, expires: '2099-01-01T00:00:00.000Z' }
    const seenScopes: string[] = []

    const { result } = renderHook(
      () => {
        const value = useProgressScope()
        seenScopes.push(value.scope)
        return value
      },
      { wrapper },
    )

    expect(seenScopes[0]).toBe('anonymous')
    await waitFor(() => expect(result.current.scope).toBe('account'))
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()

    result.current.repository.recordAnswer(2, ['C'], false, 'DVA-C02')

    expect(new LocalProgressRepository('account').getProgress(2, 'DVA-C02')?.lastPicks).toEqual([
      'C',
    ])
    expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-2')
  })

  it('preserves account mirror progress when the owner matches the authenticated user', async () => {
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    new LocalProgressRepository('account').recordAnswer(1, ['D'], true, 'DVA-C02')
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }

    const { result } = renderHook(() => useProgressScope(), { wrapper })

    await waitFor(() => expect(result.current.scope).toBe('account'))

    expect(result.current.repository.getProgress(1, 'DVA-C02')?.lastPicks).toEqual(['D'])
    expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-1')
  })
})
