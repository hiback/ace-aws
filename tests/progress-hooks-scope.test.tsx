import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProgressScopeProvider,
  useProgressScope,
} from '../src/components/providers/progress-scope-provider'
import { useQuestionProgress, useRecordAnswer } from '../src/hooks/use-answer'
import { useWrongList, useWrongRedoCount } from '../src/hooks/use-progress-stats'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import { findNextInPracticeSet } from '../src/lib/practice-flow'
import { buildWrongRedoSessionQids } from '../src/lib/wrong-redo-session'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/data/loaders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/loaders')>()
  return {
    ...actual,
    loadBank: vi.fn(async () => [{ id: 1 }, { id: 2 }, { id: 3 }]),
  }
})

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
    new BrowserProgressModule('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    new BrowserProgressModule('account').recordAnswer(1, ['B'], false, 'DVA-C02')

    const { result } = renderHook(() => useQuestionProgress(1, 'DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data?.lastPicks).toEqual(['A']))
  })

  it('reads account progress when signed in', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    BrowserProgressModule.prepareAccountOwner('user-1')
    new BrowserProgressModule('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    new BrowserProgressModule('account').recordAnswer(1, ['B'], false, 'DVA-C02')

    const { result } = renderHook(() => useQuestionProgress(1, 'DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data?.lastPicks).toEqual(['B']))
  })

  it('does not expose cached account progress when switching owners', async () => {
    const client = createQueryClient()
    const queryKey = ['progress', 'account', 'question', 'DVA-C02', 1]
    client.setQueryData(queryKey, { qid: 1, lastPicks: ['A'] })
    BrowserProgressModule.prepareAccountOwner('user-1')
    new BrowserProgressModule('account').recordAnswer(1, ['A'], true, 'DVA-C02')
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

  it('counts only current-bank wrong redo questions', async () => {
    const progress = new BrowserProgressModule('anonymous')
    progress.recordAnswer(1, ['A'], false, 'DVA-C02')
    progress.recordAnswer(999_999, ['A'], false, 'DVA-C02')

    const { result } = renderHook(() => useWrongRedoCount('DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data).toBe(1), { timeout: 3000 })
  })

  it('lists only current-bank wrong questions', async () => {
    const progress = new BrowserProgressModule('anonymous')
    progress.recordAnswer(1, ['A'], false, 'DVA-C02')
    progress.recordAnswer(999_999, ['A'], false, 'DVA-C02')

    const { result } = renderHook(() => useWrongList('DVA-C02'), { wrapper })

    await waitFor(() => expect(result.current.data?.map((entry) => entry.qid)).toEqual([1]), {
      timeout: 3000,
    })
  })

  it('recovers a wrong redo question after a correct answer without changing the current session set', async () => {
    const progress = new BrowserProgressModule('anonymous')
    progress.recordAnswer(1, ['B'], false, 'DVA-C02')
    progress.recordAnswer(2, ['B'], false, 'DVA-C02')
    const capturedWrongRedoQuestions = [1, 2]

    const { result } = renderHook(
      () => ({
        answer: useRecordAnswer('DVA-C02'),
        wrongRedoCount: useWrongRedoCount('DVA-C02'),
        wrongQuestions: useWrongList('DVA-C02'),
      }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.wrongRedoCount.data).toBe(2), { timeout: 3000 })

    result.current.answer.mutate({ qid: 1, picks: ['A'], correct: true })

    await waitFor(() => expect(result.current.answer.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.wrongRedoCount.data).toBe(1), { timeout: 3000 })
    await waitFor(() =>
      expect(result.current.wrongQuestions.data?.map((entry) => entry.qid).toSorted()).toEqual([
        1, 2,
      ]),
    )

    const wrongQuestions = progress.listWrong('DVA-C02').map((entry) => entry.qid)
    const recoveredWrongQuestions = progress
      .listWrong('DVA-C02')
      .filter((entry) => entry.lastCorrect === true)
      .map((entry) => entry.qid)
    const nextWrongRedoQuestions = buildWrongRedoSessionQids(
      [1, 2, 3],
      progress.listProgress('DVA-C02'),
      () => 0,
    )

    expect(wrongQuestions.toSorted()).toEqual([1, 2])
    expect(recoveredWrongQuestions).toEqual([1])
    expect(nextWrongRedoQuestions).toEqual([2])
    expect(capturedWrongRedoQuestions).toEqual([1, 2])
    expect(findNextInPracticeSet(1, capturedWrongRedoQuestions)).toBe(2)
  })

  it('keeps an incorrectly reanswered wrong redo question eligible for the next session', async () => {
    const progress = new BrowserProgressModule('anonymous')
    progress.recordAnswer(1, ['B'], false, 'DVA-C02')
    progress.recordAnswer(2, ['B'], false, 'DVA-C02')

    const { result } = renderHook(
      () => ({
        answer: useRecordAnswer('DVA-C02'),
        wrongRedoCount: useWrongRedoCount('DVA-C02'),
      }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.wrongRedoCount.data).toBe(2), { timeout: 3000 })

    result.current.answer.mutate({ qid: 1, picks: ['C'], correct: false })

    await waitFor(() => expect(result.current.answer.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.wrongRedoCount.data).toBe(2), { timeout: 3000 })

    const wrongRedoQuestions = buildWrongRedoSessionQids(
      [1, 2, 3],
      progress.listProgress('DVA-C02'),
      () => 0,
    )

    expect(
      progress
        .listWrong('DVA-C02')
        .map((entry) => entry.qid)
        .toSorted(),
    ).toEqual([1, 2])
    expect(wrongRedoQuestions.toSorted()).toEqual([1, 2])
    expect(progress.getProgress(1, 'DVA-C02')).toMatchObject({ wrongCount: 2, lastCorrect: false })
  })
})
