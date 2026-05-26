import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProgressScopeProvider,
  useProgressScope,
} from '../src/components/providers/progress-scope-provider'
import type { CertCode } from '../src/data/types'
import { useQuestionProgress, useRecordAnswer } from '../src/hooks/use-answer'
import { useMockExamDraft } from '../src/hooks/use-mock-exam'
import { useWrongList, useWrongRedoCount } from '../src/hooks/use-progress-stats'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import { findNextInPracticeSet } from '../src/lib/practice-flow'
import { buildWrongRedoSessionQids } from '../src/lib/wrong-redo-session'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const repositoryMocks = vi.hoisted(() => ({
  accountGetDraft: vi.fn(),
  anonymousGetDraft: vi.fn(),
  getMockExamDraftRepository: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/lib/mock-exam/repository', () => ({
  getMockExamDraftRepository: repositoryMocks.getMockExamDraftRepository,
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

function makeMockExamAttempt(id: string, cert: CertCode = 'DVA-C02'): MockExamAttempt {
  return {
    id,
    cert,
    draftStatus: 'saved',
    currentIndex: 0,
    questionCount: 1,
    timeLimitSeconds: 120,
    startedAt: 1000,
    elapsedSeconds: 0,
    updatedAt: 2000,
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: ['A'],
        type: 'single',
        userPicks: [],
        correct: null,
        flagged: false,
        answered: false,
      },
    ],
  }
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
    repositoryMocks.accountGetDraft.mockReset()
    repositoryMocks.anonymousGetDraft.mockReset()
    repositoryMocks.anonymousGetDraft.mockResolvedValue(null)
    repositoryMocks.getMockExamDraftRepository.mockReset()
    repositoryMocks.getMockExamDraftRepository.mockImplementation(
      (scope: 'anonymous' | 'account') =>
        scope === 'account'
          ? { getDraft: repositoryMocks.accountGetDraft }
          : { getDraft: repositoryMocks.anonymousGetDraft },
    )
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

  it('does not expose cached account mock exam draft when switching owners', async () => {
    const client = createQueryClient()
    const queryKey = ['mock-exam', 'account', 'draft', 'DVA-C02']
    client.setQueryData(queryKey, makeMockExamAttempt('user-a-draft'))
    repositoryMocks.accountGetDraft.mockResolvedValue(makeMockExamAttempt('user-b-draft'))
    BrowserProgressModule.prepareAccountOwner('user-a')
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-b' }, expires: '2099-01-01T00:00:00.000Z' }
    const seenAccountDraftIds: unknown[] = []

    const { result } = renderHook(
      () => {
        const scope = useProgressScope().scope
        const draft = useMockExamDraft('DVA-C02')
        if (scope === 'account') {
          seenAccountDraftIds.push(draft.data?.id ?? null)
        }
        return { draft, scope }
      },
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => expect(result.current.scope).toBe('account'))
    await waitFor(() => expect(result.current.draft.data?.id).toBe('user-b-draft'))

    expect(repositoryMocks.accountGetDraft).toHaveBeenCalledWith('DVA-C02')
    expect(seenAccountDraftIds).not.toContain('user-a-draft')
  })

  it('clears cached account mock exam draft queries when signing out', async () => {
    const client = createQueryClient()
    const queryKey = ['mock-exam', 'account', 'draft', 'DVA-C02']
    client.setQueryData(queryKey, makeMockExamAttempt('signed-in-draft'))
    BrowserProgressModule.prepareAccountOwner('user-a')
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-a' }, expires: '2099-01-01T00:00:00.000Z' }

    const { rerender } = renderHook(() => useProgressScope().scope, {
      wrapper: createWrapper(client),
    })

    authMocks.status = 'unauthenticated'
    authMocks.session = null
    rerender()

    await waitFor(() => expect(client.getQueryState(queryKey)).toBeUndefined())
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
