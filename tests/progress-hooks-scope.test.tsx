import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProgressScopeProvider,
  useProgressScope,
} from '../src/components/providers/progress-scope-provider'
import { useQuestionProgress } from '../src/hooks/use-answer'
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

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function createWrapper(client = createQueryClient()) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>{children}</ProgressScopeProvider>
      </QueryClientProvider>
    )
  }

  return Wrapper
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <ProgressScopeProvider>{children}</ProgressScopeProvider>
    </QueryClientProvider>
  )
}

describe('progress hooks scope', () => {
  beforeEach(() => {
    localStorage.clear()
    authMocks.status = 'unauthenticated'
    authMocks.session = null
  })

  it('reads anonymous progress when signed out', async () => {
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    new LocalProgressRepository('account').recordAnswer(1, ['B'], false, 'DVA-C02')

    const { result } = renderHook(() => useQuestionProgress(1, 'DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data?.lastPicks).toEqual(['A']))
  })

  it('reads account progress when signed in', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    new LocalProgressRepository('account').recordAnswer(1, ['B'], false, 'DVA-C02')

    const { result } = renderHook(() => useQuestionProgress(1, 'DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data?.lastPicks).toEqual(['B']))
  })

  it('does not expose cached account progress when switching owners', async () => {
    const client = createQueryClient()
    const queryKey = ['progress', 'account', 'question', 'DVA-C02', 1]
    client.setQueryData(queryKey, { qid: 1, lastPicks: ['A'] })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-2' }, expires: '2099-01-01T00:00:00.000Z' }
    const seenAccountPicks: unknown[] = []

    const { result } = renderHook(
      () => {
        const scope = useProgressScope().scope
        const progress = useQuestionProgress(1, 'DVA-C02')
        if (scope === 'account') {
          seenAccountPicks.push(progress.data?.lastPicks ?? null)
        }
        return { progress, scope }
      },
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => expect(result.current.scope).toBe('account'))
    await waitFor(() => expect(result.current.progress.data).toBeNull())

    expect(seenAccountPicks).not.toContainEqual(['A'])
  })
})
