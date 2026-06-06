import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressScopeProvider } from '../src/components/providers/progress-scope-provider'
import type { CertCode, ProgressScope } from '../src/data/types'
import {
  useDeleteMockExamDraft,
  useMockExamDraft,
  useMockExamHistory,
  useSaveMockExamDraft,
  useSubmitMockExamAttempt,
  useSubmittedMockExamAttempt,
} from '../src/hooks/use-mock-exam'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const repositoryMocks = vi.hoisted(() => ({
  getMockExamDraftRepository: vi.fn(),
}))

const ledgerMocks = vi.hoisted(() => ({
  readDraft: vi.fn(),
  syncDirtyMockExam: vi.fn(),
}))

const accountSyncMocks = vi.hoisted(() => ({
  enqueueDirtySync: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/components/providers/account-progress-sync-provider', () => ({
  useAccountProgressSync: () => accountSyncMocks,
}))

vi.mock('@/lib/mock-exam/repository', () => ({
  getMockExamDraftRepository: repositoryMocks.getMockExamDraftRepository,
}))

vi.mock('@/lib/mock-exam/account-sync-ledger', () => ({
  getAccountMockExamSyncLedger: () => ledgerMocks,
  syncDirtyMockExam: ledgerMocks.syncDirtyMockExam,
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

function useRepositories(
  repositories: Record<
    ProgressScope,
    {
      getDraft: (cert: 'DVA-C02' | 'CLF-C02') => Promise<MockExamAttempt | null>
      getSubmittedAttempt?: (attemptId: string) => Promise<SubmittedMockExamAttempt | null>
      getHistory?: (cert: 'DVA-C02' | 'CLF-C02') => Promise<SubmittedMockExamAttempt[]>
      saveDraft?: (draft: MockExamAttempt) => Promise<void>
      saveSubmittedAttempt?: (attempt: SubmittedMockExamAttempt) => Promise<void>
      deleteDraft?: (cert: 'DVA-C02' | 'CLF-C02') => Promise<void>
    }
  >,
) {
  repositoryMocks.getMockExamDraftRepository.mockImplementation(
    (scope: ProgressScope) => repositories[scope],
  )
}

function makeAttempt(id: string, cert: 'DVA-C02' | 'CLF-C02' = 'DVA-C02'): MockExamAttempt {
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

function makeSubmitted(
  id: string,
  cert: 'DVA-C02' | 'CLF-C02' = 'DVA-C02',
  submittedAt = 3000,
): SubmittedMockExamAttempt {
  return {
    id,
    cert,
    submittedAt,
    questions: makeAttempt(`${id}-draft`, cert).questions,
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

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  accountSyncMocks.enqueueDirtySync.mockReset()
  repositoryMocks.getMockExamDraftRepository.mockReset()
  ledgerMocks.readDraft.mockReset()
  ledgerMocks.readDraft.mockReturnValue(null)
  ledgerMocks.syncDirtyMockExam.mockReset()
  ledgerMocks.syncDirtyMockExam.mockResolvedValue({ ok: true })
})

describe('useMockExamDraft', () => {
  it('returns the anonymous draft from the repository', async () => {
    const draft = makeAttempt('anonymous-draft')
    const anonymousRepository = { getDraft: vi.fn(async () => draft) }
    const accountRepository = { getDraft: vi.fn(async () => null) }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useMockExamDraft('DVA-C02'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data?.id).toBe('anonymous-draft'))

    expect(repositoryMocks.getMockExamDraftRepository).toHaveBeenCalledWith('anonymous')
    expect(anonymousRepository.getDraft).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.getDraft).not.toHaveBeenCalled()
  })

  it('refetches the draft when Progress Scope changes', async () => {
    const anonymousRepository = { getDraft: vi.fn(async () => makeAttempt('anonymous-draft')) }
    const accountRepository = { getDraft: vi.fn(async () => makeAttempt('account-draft')) }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result, rerender } = renderHook(() => useMockExamDraft('DVA-C02'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data?.id).toBe('anonymous-draft'))

    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    rerender()

    await waitFor(() => expect(result.current.data?.id).toBe('account-draft'))

    expect(anonymousRepository.getDraft).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.getDraft).toHaveBeenCalledWith('DVA-C02')
  })

  it('keeps anonymous and account draft caches isolated', async () => {
    let resolveAccountDraft: (draft: MockExamAttempt | null) => void = () => {}
    const anonymousRepository = { getDraft: vi.fn(async () => makeAttempt('anonymous-draft')) }
    const accountRepository = {
      getDraft: vi.fn(
        () =>
          new Promise<MockExamAttempt | null>((resolve) => {
            resolveAccountDraft = resolve
          }),
      ),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result, rerender } = renderHook(() => useMockExamDraft('DVA-C02'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data?.id).toBe('anonymous-draft'))

    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    rerender()

    await waitFor(() => expect(accountRepository.getDraft).toHaveBeenCalledWith('DVA-C02'))
    expect(result.current.data).toBeUndefined()

    resolveAccountDraft(makeAttempt('account-draft'))
    await waitFor(() => expect(result.current.data?.id).toBe('account-draft'))
  })
})

describe('useMockExamHistory', () => {
  it('returns the anonymous history from the repository', async () => {
    const history = [makeSubmitted('anonymous-history')]
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => history),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useMockExamHistory('DVA-C02'), {
      wrapper: createWrapper(),
    })

    await waitFor(() =>
      expect(result.current.data?.map((attempt) => attempt.id)).toEqual(['anonymous-history']),
    )

    expect(repositoryMocks.getMockExamDraftRepository).toHaveBeenCalledWith('anonymous')
    expect(anonymousRepository.getHistory).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.getHistory).not.toHaveBeenCalled()
  })

  it('refetches history when Progress Scope changes and keeps caches isolated', async () => {
    let resolveAccountHistory: (history: SubmittedMockExamAttempt[]) => void = () => {}
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => [makeSubmitted('anonymous-history')]),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(
        () =>
          new Promise<SubmittedMockExamAttempt[]>((resolve) => {
            resolveAccountHistory = resolve
          }),
      ),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result, rerender } = renderHook(() => useMockExamHistory('DVA-C02'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('anonymous-history'))

    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    rerender()

    await waitFor(() => expect(accountRepository.getHistory).toHaveBeenCalledWith('DVA-C02'))
    expect(result.current.data).toBeUndefined()

    resolveAccountHistory([makeSubmitted('account-history')])
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('account-history'))
  })
})

describe('useSubmittedMockExamAttempt', () => {
  it('derives a submitted attempt from an existing history cache', async () => {
    const client = createQueryClient()
    const submitted = makeSubmitted('cached-submitted')
    client.setQueryData(['mock-exam', 'anonymous', 'history', 'DVA-C02'], [submitted])
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmittedMockExamAttempt('cached-submitted'), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => expect(result.current.data?.id).toBe('cached-submitted'))

    expect(anonymousRepository.getHistory).not.toHaveBeenCalled()
    expect(accountRepository.getHistory).not.toHaveBeenCalled()
  })

  it('updates when the matching history cache changes', async () => {
    const client = createQueryClient()
    const submitted = makeSubmitted('live-submitted')
    client.setQueryData(['mock-exam', 'anonymous', 'history', 'DVA-C02'], [submitted])
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmittedMockExamAttempt('live-submitted'), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => expect(result.current.data?.summary.score).toBe(850))

    act(() => {
      client.setQueryData(
        ['mock-exam', 'anonymous', 'history', 'DVA-C02'],
        [{ ...submitted, summary: { ...submitted.summary, score: 910 } }],
      )
    })

    await waitFor(() => expect(result.current.data?.summary.score).toBe(910))
    expect(anonymousRepository.getHistory).not.toHaveBeenCalled()
  })

  it('confirms a cached history miss before returning a submitted attempt as missing', async () => {
    const client = createQueryClient()
    const submitted = makeSubmitted('fresh-submitted', 'DVA-C02')
    client.setQueryData(
      ['mock-exam', 'anonymous', 'history', 'DVA-C02'],
      [makeSubmitted('stale-submitted', 'DVA-C02')],
    )
    let resolveHistory: (history: SubmittedMockExamAttempt[]) => void = () => {}
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(
        () =>
          new Promise<SubmittedMockExamAttempt[]>((resolve) => {
            resolveHistory = resolve
          }),
      ),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmittedMockExamAttempt('fresh-submitted'), {
      wrapper: createWrapper(client),
    })

    expect(result.current.data).toBeNull()
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(anonymousRepository.getHistory).toHaveBeenCalledWith('DVA-C02'))

    act(() => {
      resolveHistory([submitted])
    })

    await waitFor(() => expect(result.current.data?.id).toBe('fresh-submitted'))
    expect(result.current.isPending).toBe(false)
  })

  it('walks ready certification histories and refetches cached histories that miss the attempt', async () => {
    const client = createQueryClient()
    const submitted = makeSubmitted('found-by-walk', 'DVA-C02')
    client.setQueryData(['mock-exam', 'anonymous', 'history', 'CLF-C02'], [])
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async (cert: CertCode) => (cert === 'DVA-C02' ? [submitted] : [])),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmittedMockExamAttempt('found-by-walk'), {
      wrapper: createWrapper(client),
    })

    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data?.id).toBe('found-by-walk'))

    expect(anonymousRepository.getHistory).toHaveBeenCalledTimes(4)
    expect(anonymousRepository.getHistory).toHaveBeenCalledWith('CLF-C02')
    expect(anonymousRepository.getHistory).toHaveBeenCalledWith('SAA-C03')
    expect(anonymousRepository.getHistory).toHaveBeenCalledWith('SAP-C02')
    expect(anonymousRepository.getHistory).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.getHistory).not.toHaveBeenCalled()
  })

  it('returns null until the matching history resolves', async () => {
    const submitted = makeSubmitted('eventual-submitted', 'DVA-C02')
    const historyResolvers: Partial<
      Record<CertCode, (history: SubmittedMockExamAttempt[]) => void>
    > = {}
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(
        (cert: CertCode) =>
          new Promise<SubmittedMockExamAttempt[]>((resolve) => {
            historyResolvers[cert] = resolve
          }),
      ),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmittedMockExamAttempt('eventual-submitted'), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeNull()
    expect(result.current.isPending).toBe(true)

    act(() => {
      historyResolvers['CLF-C02']?.([])
      historyResolvers['SAA-C03']?.([])
      historyResolvers['SAP-C02']?.([])
      historyResolvers['DVA-C02']?.([submitted])
    })

    await waitFor(() => expect(result.current.data?.id).toBe('eventual-submitted'))
    expect(result.current.isPending).toBe(false)
  })
})

describe('useSaveMockExamDraft', () => {
  it('saves account-scoped drafts, refetches draft observers, and enqueues dirty sync', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    let accountDraft: MockExamAttempt | null = makeAttempt('account-old-draft')
    const savedDraft = makeAttempt('account-new-draft')
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => accountDraft),
      saveDraft: vi.fn(async (draft: MockExamAttempt) => {
        accountDraft = draft
      }),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        saveDraft: useSaveMockExamDraft(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('account-old-draft'))

    await act(async () => {
      await result.current.saveDraft.mutateAsync(savedDraft)
    })

    await waitFor(() => expect(result.current.draft.data?.id).toBe('account-new-draft'))
    expect(accountRepository.saveDraft).toHaveBeenCalledWith(savedDraft)
    expect(anonymousRepository.saveDraft).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).toHaveBeenCalledWith('DVA-C02')
  })

  it('saves anonymous drafts without enqueueing dirty sync', async () => {
    let anonymousDraft: MockExamAttempt | null = makeAttempt('anonymous-old-draft')
    const savedDraft = makeAttempt('anonymous-new-draft')
    const anonymousRepository = {
      getDraft: vi.fn(async () => anonymousDraft),
      saveDraft: vi.fn(async (draft: MockExamAttempt) => {
        anonymousDraft = draft
      }),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        saveDraft: useSaveMockExamDraft(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('anonymous-old-draft'))

    await act(async () => {
      await result.current.saveDraft.mutateAsync(savedDraft)
    })

    await waitFor(() => expect(result.current.draft.data?.id).toBe('anonymous-new-draft'))
    expect(anonymousRepository.saveDraft).toHaveBeenCalledWith(savedDraft)
    expect(accountRepository.saveDraft).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })

  it('rejects when the local draft write fails', async () => {
    const savedDraft = makeAttempt('failing-draft')
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {
        throw new Error('local write failed')
      }),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSaveMockExamDraft(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.mutateAsync(savedDraft)).rejects.toThrow('local write failed')
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })
})

describe('useDeleteMockExamDraft', () => {
  it('deletes account-scoped drafts, refetches draft observers, and enqueues dirty sync', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    let accountDraft: MockExamAttempt | null = makeAttempt('account-draft-to-delete')
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      deleteDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => accountDraft),
      deleteDraft: vi.fn(async () => {
        accountDraft = null
      }),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        deleteDraft: useDeleteMockExamDraft(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('account-draft-to-delete'))

    await act(async () => {
      await result.current.deleteDraft.mutateAsync('DVA-C02')
    })

    await waitFor(() => expect(result.current.draft.data).toBeNull())
    expect(accountRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(anonymousRepository.deleteDraft).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).toHaveBeenCalledWith('DVA-C02')
  })

  it('deletes anonymous drafts without enqueueing dirty sync', async () => {
    let anonymousDraft: MockExamAttempt | null = makeAttempt('anonymous-draft-to-delete')
    const anonymousRepository = {
      getDraft: vi.fn(async () => anonymousDraft),
      deleteDraft: vi.fn(async () => {
        anonymousDraft = null
      }),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      deleteDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        deleteDraft: useDeleteMockExamDraft(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('anonymous-draft-to-delete'))

    await act(async () => {
      await result.current.deleteDraft.mutateAsync('DVA-C02')
    })

    await waitFor(() => expect(result.current.draft.data).toBeNull())
    expect(anonymousRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.deleteDraft).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })
})

describe('useSubmitMockExamAttempt', () => {
  it('submits account-scoped attempts, waits for draft sync, and refetches draft and history observers', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    let accountDraft: MockExamAttempt | null = makeAttempt('account-draft-before-submit')
    let accountHistory = [makeSubmitted('account-history-old', 'DVA-C02', 1000)]
    const submitted = makeSubmitted('account-submitted', 'DVA-C02', 4000)
    let resolveDraftSync: (result: { ok: true }) => void = () => {}
    ledgerMocks.syncDirtyMockExam.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveDraftSync = resolve
        }),
    )
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => accountDraft),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => accountHistory),
      saveSubmittedAttempt: vi.fn(async (attempt: SubmittedMockExamAttempt) => {
        accountHistory = [attempt, ...accountHistory]
      }),
      deleteDraft: vi.fn(async () => {
        accountDraft = null
      }),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        history: useMockExamHistory('DVA-C02'),
        submitAttempt: useSubmitMockExamAttempt(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('account-draft-before-submit'))
    await waitFor(() => expect(result.current.history.data?.[0]?.id).toBe('account-history-old'))

    let submitPromise: Promise<SubmittedMockExamAttempt> | undefined
    let mutationResolved = false
    await act(async () => {
      submitPromise = result.current.submitAttempt.mutateAsync(submitted)
      submitPromise.then(() => {
        mutationResolved = true
      })
      await Promise.resolve()
    })

    expect(accountRepository.saveSubmittedAttempt).toHaveBeenCalledWith(submitted)
    expect(accountRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(ledgerMocks.syncDirtyMockExam).toHaveBeenCalledWith('DVA-C02')
    expect(ledgerMocks.readDraft).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
    expect(mutationResolved).toBe(false)

    await act(async () => {
      resolveDraftSync({ ok: true })
      await submitPromise
    })

    await waitFor(() => expect(result.current.draft.data).toBeNull())
    await waitFor(() =>
      expect(result.current.history.data?.map((attempt) => attempt.id)).toEqual([
        'account-submitted',
        'account-history-old',
      ]),
    )
    expect(anonymousRepository.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(anonymousRepository.deleteDraft).not.toHaveBeenCalled()
    expect(ledgerMocks.readDraft).toHaveBeenCalledWith('DVA-C02')
  })

  it('rejects account-scoped submissions when the draft sync succeeds but leaves a draft cached', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    const accountDraft: MockExamAttempt | null = makeAttempt('server-winning-after-delete')
    let accountHistory = [makeSubmitted('account-history-old', 'DVA-C02', 1000)]
    const submitted = makeSubmitted('account-submitted-server-draft-wins', 'DVA-C02', 4000)
    ledgerMocks.readDraft.mockImplementation(() => accountDraft)
    ledgerMocks.syncDirtyMockExam.mockResolvedValueOnce({ ok: true })
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => accountDraft),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => accountHistory),
      saveSubmittedAttempt: vi.fn(async (attempt: SubmittedMockExamAttempt) => {
        accountHistory = [attempt, ...accountHistory]
      }),
      deleteDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        history: useMockExamHistory('DVA-C02'),
        submitAttempt: useSubmitMockExamAttempt(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('server-winning-after-delete'))
    await waitFor(() => expect(result.current.history.data?.[0]?.id).toBe('account-history-old'))
    vi.mocked(accountRepository.getDraft).mockClear()
    vi.mocked(accountRepository.getHistory).mockClear()

    await expect(result.current.submitAttempt.mutateAsync(submitted)).rejects.toThrow(
      'Failed to clear account-backed Mock Exam Draft',
    )

    expect(accountRepository.saveSubmittedAttempt).toHaveBeenCalledWith(submitted)
    expect(accountRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(ledgerMocks.syncDirtyMockExam).toHaveBeenCalledWith('DVA-C02')
    expect(ledgerMocks.readDraft).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.getDraft).not.toHaveBeenCalled()
    expect(accountRepository.getHistory).not.toHaveBeenCalled()
    expect(result.current.submitAttempt.isSuccess).toBe(false)
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })

  it('reuses an existing account-scoped submission when retrying after draft clear fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    let persistedSubmitted: SubmittedMockExamAttempt | null = null
    const firstSubmitted = makeSubmitted('account-submit-retry-idempotent', 'DVA-C02', 4000)
    const retrySubmitted = {
      ...makeSubmitted('account-submit-retry-idempotent', 'DVA-C02', 9000),
      summary: {
        ...firstSubmitted.summary,
        score: 700,
        timeUsedSeconds: 119,
      },
    }
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => persistedSubmitted),
      saveSubmittedAttempt: vi.fn(async (attempt: SubmittedMockExamAttempt) => {
        persistedSubmitted = attempt
      }),
      deleteDraft: vi
        .fn()
        .mockRejectedValueOnce(new Error('draft clear failed'))
        .mockResolvedValueOnce(undefined),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmitMockExamAttempt(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.mutateAsync(firstSubmitted)).rejects.toThrow('draft clear failed')
    const retryResult = await result.current.mutateAsync(retrySubmitted)

    expect(retryResult).toBe(firstSubmitted)
    expect(accountRepository.getSubmittedAttempt).toHaveBeenCalledTimes(2)
    expect(accountRepository.getSubmittedAttempt).toHaveBeenCalledWith(
      'account-submit-retry-idempotent',
    )
    expect(accountRepository.saveSubmittedAttempt).toHaveBeenCalledTimes(1)
    expect(accountRepository.saveSubmittedAttempt).toHaveBeenCalledWith(firstSubmitted)
    expect(accountRepository.deleteDraft).toHaveBeenCalledTimes(2)
    expect(ledgerMocks.syncDirtyMockExam).toHaveBeenCalledTimes(1)
    expect(ledgerMocks.readDraft).toHaveBeenCalledWith('DVA-C02')
    expect(anonymousRepository.saveSubmittedAttempt).not.toHaveBeenCalled()
  })

  it('rejects account-scoped submissions when the synchronous draft sync fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    const submitted = makeSubmitted('account-submit-sync-fails')
    ledgerMocks.syncDirtyMockExam.mockResolvedValueOnce({
      ok: false,
      reason: 'temporary',
    })
    const anonymousRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(() => useSubmitMockExamAttempt(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.mutateAsync(submitted)).rejects.toThrow(
      'Failed to sync account-backed Mock Exam submission',
    )
    expect(accountRepository.saveSubmittedAttempt).toHaveBeenCalledWith(submitted)
    expect(accountRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(ledgerMocks.syncDirtyMockExam).toHaveBeenCalledWith('DVA-C02')
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })

  it('submits anonymous attempts locally and refetches draft and history observers', async () => {
    let anonymousDraft: MockExamAttempt | null = makeAttempt('anonymous-draft-before-submit')
    let anonymousHistory = [makeSubmitted('anonymous-history-old', 'DVA-C02', 1000)]
    const submitted = makeSubmitted('anonymous-submitted', 'DVA-C02', 4000)
    const anonymousRepository = {
      getDraft: vi.fn(async () => anonymousDraft),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => anonymousHistory),
      saveSubmittedAttempt: vi.fn(async (attempt: SubmittedMockExamAttempt) => {
        anonymousHistory = [attempt, ...anonymousHistory]
      }),
      deleteDraft: vi.fn(async () => {
        anonymousDraft = null
      }),
    }
    const accountRepository = {
      getDraft: vi.fn(async () => null),
      getSubmittedAttempt: vi.fn(async () => null),
      getHistory: vi.fn(async () => []),
      saveSubmittedAttempt: vi.fn(async () => {}),
      deleteDraft: vi.fn(async () => {}),
    }
    useRepositories({ anonymous: anonymousRepository, account: accountRepository })

    const { result } = renderHook(
      () => ({
        draft: useMockExamDraft('DVA-C02'),
        history: useMockExamHistory('DVA-C02'),
        submitAttempt: useSubmitMockExamAttempt(),
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.draft.data?.id).toBe('anonymous-draft-before-submit'))
    await waitFor(() => expect(result.current.history.data?.[0]?.id).toBe('anonymous-history-old'))

    await act(async () => {
      await result.current.submitAttempt.mutateAsync(submitted)
    })

    await waitFor(() => expect(result.current.draft.data).toBeNull())
    await waitFor(() =>
      expect(result.current.history.data?.map((attempt) => attempt.id)).toEqual([
        'anonymous-submitted',
        'anonymous-history-old',
      ]),
    )
    expect(anonymousRepository.saveSubmittedAttempt).toHaveBeenCalledWith(submitted)
    expect(anonymousRepository.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(accountRepository.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(accountRepository.deleteDraft).not.toHaveBeenCalled()
    expect(ledgerMocks.syncDirtyMockExam).not.toHaveBeenCalled()
    expect(accountSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
  })
})
