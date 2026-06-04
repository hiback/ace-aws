import { describe, expect, it, vi } from 'vitest'
import type { CertCode } from '../src/data/types'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import { READY_CERTS } from '../src/lib/cert-catalog'
import {
  getAccountMockExamSyncLedger,
  syncDirtyMockExam,
} from '../src/lib/mock-exam/account-sync-ledger'
import {
  getLocalMockExamDraft,
  getLocalMockExamHistory,
  saveLocalMockExamAttempt,
  saveLocalMockExamSubmittedAttempt,
} from '../src/lib/mock-exam/local-repository'
import { getMockExamDraftRepository } from '../src/lib/mock-exam/repository'
import { type MockExamAttempt, startMockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'
import {
  createProgressSyncController,
  type ProgressSyncControllerAdapter,
} from '../src/lib/progress-sync-controller'
import { parseMockExamSyncPayload } from '../src/server/mock-exam-sync/contract'
import {
  resolveMockExamDraftSync,
  resolveMockExamHistorySync,
} from '../src/server/mock-exam-sync/service'

vi.mock('@/db', () => ({ db: { transaction: vi.fn() } }))

const updatedAt = '2026-01-01T00:00:00.000Z'

function draft(overrides: Record<string, unknown> = {}): MockExamAttempt {
  return {
    id: 'attempt-1',
    cert: 'DVA-C02',
    draftStatus: 'saved',
    currentIndex: 1,
    questionCount: 2,
    timeLimitSeconds: 120,
    startedAt: 1000,
    updatedAt: Date.parse(updatedAt),
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: ['A'],
        type: 'single',
        userPicks: ['B'],
        correct: false,
        flagged: true,
        answered: true,
      },
      {
        qid: 2,
        domain: 'Security',
        topic: 'Security',
        correctAnswer: ['A', 'C'],
        type: 'multi',
        userPicks: [],
        correct: null,
        flagged: false,
        answered: false,
      },
    ],
    ...overrides,
  } as MockExamAttempt
}

function hasDirtyMockExam(cert: CertCode): boolean {
  return getAccountMockExamSyncLedger().hasDirty(cert)
}

describe('Mock Exam Sync contract', () => {
  it('accepts a freshly started active draft for account-backed create sync', async () => {
    const attempt = startMockExamAttempt({
      cert: 'DVA-C02',
      bank: makeFullDvaBank(),
      random: () => 0,
      now: () => 1000,
      id: () => 'new-active-attempt',
    })

    expect(parseMockExamSyncPayload('DVA-C02', { baseRevision: 0, draft: attempt })).toMatchObject({
      cert: 'DVA-C02',
      baseRevision: 0,
      draft: { id: 'new-active-attempt', draftStatus: 'active', updatedAt: 1000 },
    })
  })

  it('parses a scoped account-backed draft sync payload without using Progress Revision', () => {
    const parsed = parseMockExamSyncPayload('DVA-C02', {
      baseRevision: 3,
      draft: draft(),
    })

    expect(parsed).toEqual({
      cert: 'DVA-C02',
      baseRevision: 3,
      draft: draft(),
    })
  })

  it('accepts multi-answer partial picks as an account-backed draft intermediate state', async () => {
    localStorage.clear()
    const partialDraft = draft({
      id: 'multi-partial-draft',
      questions: [
        snapshot({
          qid: 1,
          type: 'multi',
          correctAnswer: ['A', 'C'],
          userPicks: ['A'],
          answered: false,
          correct: null,
        }),
        snapshot({ qid: 2 }),
      ],
    })

    expect(parseMockExamSyncPayload('DVA-C02', { baseRevision: 0, draft: partialDraft })).toEqual({
      cert: 'DVA-C02',
      baseRevision: 0,
      draft: partialDraft,
    })
  })

  it('accepts SAA-C03 draft payloads with F answer choices', () => {
    const saaDraft = draft({
      id: 'saa-draft-with-f',
      cert: 'SAA-C03',
      questions: [
        snapshot({
          qid: 450,
          domain: 'Design Secure Architectures',
          topic: 'Design Secure Architectures',
          type: 'multi',
          correctAnswer: ['C', 'E', 'F'],
          userPicks: ['C', 'E', 'F'],
          answered: true,
          correct: true,
        }),
        snapshot({
          qid: 336,
          domain: 'Design Resilient Architectures',
          topic: 'Design Resilient Architectures',
        }),
      ],
    })

    expect(parseMockExamSyncPayload('SAA-C03', { baseRevision: 0, draft: saaDraft })).toEqual({
      cert: 'SAA-C03',
      baseRevision: 0,
      draft: saaDraft,
    })
  })

  it('rejects malformed drafts and drafts for a different certification', () => {
    expect(
      parseMockExamSyncPayload('DVA-C02', { baseRevision: 0, draft: draft({ cert: 'CLF-C02' }) }),
    ).toEqual({
      error: {
        code: 'cert_mismatch',
        message: 'Draft certification does not match route certification',
      },
    })
    expect(
      parseMockExamSyncPayload('DVA-C02', { baseRevision: 0, draft: draft({ updatedAt: -1 }) }),
    ).toEqual({
      error: { code: 'invalid_draft', message: 'Invalid Mock Exam Draft' },
    })
  })

  it('rejects internally inconsistent draft snapshots', () => {
    for (const badDraft of [
      draft({ questions: [snapshot({ qid: 0 }), snapshot({ qid: 2 })] }),
      draft({
        questions: [snapshot({ type: 'single', correctAnswer: ['A', 'B'] }), snapshot({ qid: 2 })],
      }),
      draft({ questions: [snapshot({ answered: false, userPicks: ['A'] }), snapshot({ qid: 2 })] }),
      draft({
        questions: [
          snapshot({ answered: true, userPicks: [], correct: true }),
          snapshot({ qid: 2 }),
        ],
      }),
      draft({
        questions: [snapshot({ type: 'single', userPicks: ['A', 'B'] }), snapshot({ qid: 2 })],
      }),
      draft({
        questions: [
          snapshot({ type: 'multi', correctAnswer: ['A', 'B'], userPicks: ['A', 'B', 'C'] }),
          snapshot({ qid: 2 }),
        ],
      }),
    ]) {
      expect(parseMockExamSyncPayload('DVA-C02', { baseRevision: 0, draft: badDraft })).toEqual({
        error: { code: 'invalid_draft', message: 'Invalid Mock Exam Draft' },
      })
    }
  })
})

describe('Mock Exam sync controller adapter integration', () => {
  it('flushes locally saved dirty account-backed Mock Exam Drafts on the next controller cycle', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const dirtyDraft = draft({ id: 'dirty-controller-draft' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          draft: dirtyDraft,
          snapshotRequired: false,
        }),
      } as Response),
    )

    await expect(
      getMockExamDraftRepository('account').saveDraft(dirtyDraft),
    ).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)

    const controller = createProgressSyncController(createMockExamHelperAdapter(), {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, draft: dirtyDraft }),
      }),
    )
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('flushes locally deleted dirty account-backed Mock Exam Drafts on the next controller cycle', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    ledger.writeDraft(draft({ id: 'clean-draft-before-delete' }))
    ledger.settleDraft('DVA-C02')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          draft: null,
          snapshotRequired: false,
        }),
      } as Response),
    )

    await expect(repository.deleteDraft('DVA-C02')).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)

    const controller = createProgressSyncController(createMockExamHelperAdapter(), {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, draft: null }),
      }),
    )
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('flushes dirty account-backed submitted Mock Exam Attempts on the next controller cycle', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const dirtyAttempt = submitted('dirty-controller-submitted', 4000, 850)
    ledger.appendSubmittedAttempt(dirtyAttempt)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          submittedAttempts: [dirtyAttempt],
        }),
      } as Response),
    )

    const controller = createProgressSyncController(createMockExamHelperAdapter(), {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/history/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, submittedAttempts: [dirtyAttempt] }),
      }),
    )
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('clears only the current account mock exam owner when account sync state is discarded', () => {
    localStorage.clear()
    const ledger = getAccountMockExamSyncLedger()
    BrowserProgressModule.prepareAccountOwner('user-a')
    ledger.writeDraft(draft({ id: 'user-a-draft' }))
    ledger.settleDraft('DVA-C02')
    BrowserProgressModule.prepareAccountOwner('user-b')
    ledger.writeDraft(draft({ id: 'user-b-draft' }))
    ledger.settleDraft('DVA-C02')
    BrowserProgressModule.prepareAccountOwner('user-a')
    const controller = createProgressSyncController(createMockExamHelperAdapter(), {
      authStatus: 'authenticated',
      userId: 'user-a',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.discardAccountSyncState()

    expect(ledger.readDraft('DVA-C02')).toBeNull()
    BrowserProgressModule.prepareAccountOwner('user-b')
    expect(ledger.readDraft('DVA-C02')?.id).toBe('user-b-draft')
  })

  it('imports anonymous mock exam history without overwriting an existing account draft', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const accountDraft = draft({ id: 'account-existing-draft' })
    const accountHistory = submitted('account-existing-history', 1000, 760)
    const anonymousDraft = draft({ id: 'anonymous-import-draft' })
    const anonymousHistory = submitted('anonymous-import-history', 4000, 850)
    saveLocalMockExamAttempt(anonymousDraft)
    saveLocalMockExamSubmittedAttempt(anonymousHistory)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 4,
            submittedAttempts: [accountHistory],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 5,
            submittedAttempts: [anonymousHistory, accountHistory],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 5,
            draft: accountDraft,
          }),
        } as Response),
    )
    const controller = createProgressSyncController(createMockExamHelperAdapter(), {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    await expect(controller.importAnonymousProgress()).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/history/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 4, submittedAttempts: [anonymousHistory] }),
      }),
    )
    expect(fetch).not.toHaveBeenCalledWith('/api/mock-exam/dva-c02/draft/sync', expect.anything())
    expect(ledger.readDraft('DVA-C02')?.id).toBe('account-existing-draft')
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'anonymous-import-history',
      'account-existing-history',
    ])
    expect(getLocalMockExamDraft('DVA-C02')).toBeNull()
    expect(getLocalMockExamHistory('DVA-C02')).toEqual([])
    vi.unstubAllGlobals()
  })
})

describe('Mock Exam account sync repository integration', () => {
  it('returns the dirty local draft when a stale account snapshot is fetched after saving', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const repository = getMockExamDraftRepository('account')
    const dirtyDraft = draft({ id: 'dirty-local-after-save', updatedAt: 3000 })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          draft: null,
        }),
      } as Response),
    )

    await expect(repository.saveDraft(dirtyDraft)).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()

    await expect(repository.getDraft('DVA-C02')).resolves.toMatchObject({
      id: 'dirty-local-after-save',
    })
    expect(fetch).toHaveBeenCalledWith('/api/mock-exam/dva-c02/draft/snapshot', expect.any(Object))
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('returns and caches the account snapshot when no dirty local draft exists', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const serverDraft = draft({ id: 'server-snapshot-draft', updatedAt: 4000 })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          draft: serverDraft,
        }),
      } as Response),
    )

    await expect(repository.getDraft('DVA-C02')).resolves.toMatchObject({
      id: 'server-snapshot-draft',
    })

    expect(ledger.readDraft('DVA-C02')?.id).toBe('server-snapshot-draft')
    expect(ledger.getRevision('DVA-C02')).toBe(3)
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('returns ledger-merged history when an account snapshot arrives while local history is dirty', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const dirtyAttempt = submitted('dirty-local-history-during-snapshot', 5000, 850)
    ledger.appendSubmittedAttempt(dirtyAttempt)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          submittedAttempts: [],
        }),
      } as Response),
    )

    await expect(repository.getHistory('DVA-C02')).resolves.toEqual([dirtyAttempt])

    expect(ledger.readHistory('DVA-C02')).toEqual([dirtyAttempt])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([
      'dirty-local-history-during-snapshot',
    ])
    vi.unstubAllGlobals()
  })

  it('ignores stale account history snapshots that resolve after a newer history sync', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const staleServerAttempt = submitted('stale-history-snapshot-server', 1000, 760)
    const syncedAttempt = submitted('history-synced-before-stale-snapshot', 5000, 900)
    let resolveSnapshot: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSnapshot = resolve
            }),
        )
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 3,
            submittedAttempts: [syncedAttempt],
          }),
        } as Response),
    )

    const snapshotRead = repository.getHistory('DVA-C02')
    ledger.appendSubmittedAttempt(syncedAttempt)
    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(ledger.getRevision('DVA-C02')).toBe(3)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-synced-before-stale-snapshot',
    ])

    resolveSnapshot?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 1,
        submittedAttempts: [staleServerAttempt],
      }),
    } as Response)

    await expect(snapshotRead).resolves.toEqual([syncedAttempt])
    expect(ledger.getRevision('DVA-C02')).toBe(3)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-synced-before-stale-snapshot',
    ])
    vi.unstubAllGlobals()
  })

  it('stores submitted attempts in the ledger without posting immediately', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const attempt = submitted('dirty-submitted-without-post', 5000, 850)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          submittedAttempts: [attempt],
        }),
      } as Response),
    )

    await expect(repository.saveSubmittedAttempt(attempt)).resolves.toBeUndefined()

    expect(fetch).not.toHaveBeenCalled()
    expect(ledger.readHistory('DVA-C02').map((item) => item.id)).toEqual([
      'dirty-submitted-without-post',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['dirty-submitted-without-post'])
    vi.unstubAllGlobals()
  })

  it('keeps the newer revision when an older draft sync response returns after a newer sync settles', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const draftA = draft({ id: 'draft-a', updatedAt: 2000 })
    const draftB = draft({ id: 'draft-b', updatedAt: 3000 })
    const serverDraftFromA = draft({ id: 'server-from-draft-a', updatedAt: 2500 })
    let resolveSaveA: ((response: Response) => void) | null = null
    let resolveSaveB: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSaveA = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSaveB = resolve
            }),
        )
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 3,
            draft: null,
            snapshotRequired: false,
          }),
        } as Response),
    )

    ledger.writeDraft(draftA)
    const syncA = syncDirtyMockExam('DVA-C02')
    ledger.writeDraft(draftB)
    const syncB = syncDirtyMockExam('DVA-C02')
    resolveSaveB?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 2,
        draft: draftB,
        snapshotRequired: false,
      }),
    } as Response)
    await expect(syncB).resolves.toEqual({ ok: true })
    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)

    resolveSaveA?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 1,
        draft: serverDraftFromA,
        snapshotRequired: true,
      }),
    } as Response)
    await expect(syncA).resolves.toEqual({ ok: true })

    expect(ledger.readDraft('DVA-C02')?.id).toBe('draft-b')
    expect(ledger.getRevision('DVA-C02')).toBe(2)

    await expect(repository.deleteDraft('DVA-C02')).resolves.toBeUndefined()
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)
    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 2, draft: null }),
      }),
    )
    vi.unstubAllGlobals()
  })

  it('pushes dirty submitted attempts through the ledger sync helper', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const historyAttempt = submitted('history-sync-through-helper', 4000, 850)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 2,
          submittedAttempts: [historyAttempt],
        }),
      } as Response),
    )

    await expect(repository.saveSubmittedAttempt(historyAttempt)).resolves.toBeUndefined()
    expect(ledger.getRevision('DVA-C02')).toBe(0)
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['history-sync-through-helper'])

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/history/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, submittedAttempts: [historyAttempt] }),
      }),
    )
    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('ignores stale out-of-order history sync responses after a newer history sync settles', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const firstAttempt = submitted('history-out-of-order-first', 4000, 850)
    const secondAttempt = submitted('history-out-of-order-second', 5000, 900)
    let resolveFirstSync: ((response: Response) => void) | null = null
    let resolveSecondSync: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveFirstSync = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSecondSync = resolve
            }),
        ),
    )

    ledger.appendSubmittedAttempt(firstAttempt)
    const firstSync = syncDirtyMockExam('DVA-C02')
    ledger.appendSubmittedAttempt(secondAttempt)
    const secondSync = syncDirtyMockExam('DVA-C02')
    resolveSecondSync?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 2,
        submittedAttempts: [secondAttempt, firstAttempt],
      }),
    } as Response)
    await expect(secondSync).resolves.toEqual({ ok: true })

    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-out-of-order-second',
      'history-out-of-order-first',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])

    resolveFirstSync?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 1,
        submittedAttempts: [firstAttempt],
      }),
    } as Response)
    await expect(firstSync).resolves.toEqual({ ok: true })

    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-out-of-order-second',
      'history-out-of-order-first',
    ])
    vi.unstubAllGlobals()
  })

  it('retains dirty submitted attempts after revision conflict snapshots so they can retry', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const dirtyAttempt = submitted('history-revision-conflict-dirty', 4000, 850)
    const serverAttempt = submitted('history-revision-conflict-server', 5000, 760)
    ledger.setRevision('DVA-C02', 3)
    ledger.appendSubmittedAttempt(dirtyAttempt)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 2,
            submittedAttempts: [serverAttempt],
            rejected: [],
            snapshotRequired: true,
            error: {
              code: 'revision_conflict',
              message: 'Client base revision is ahead of the current Mock Exam Revision',
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 3,
            submittedAttempts: [serverAttempt, dirtyAttempt],
            rejected: [],
            snapshotRequired: false,
          }),
        } as Response),
    )

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({
      ok: false,
      reason: 'temporary',
    })

    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-revision-conflict-server',
      'history-revision-conflict-dirty',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([
      'history-revision-conflict-dirty',
    ])

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/mock-exam/dva-c02/history/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 2, submittedAttempts: [dirtyAttempt] }),
      }),
    )
    expect(ledger.getRevision('DVA-C02')).toBe(3)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'history-revision-conflict-server',
      'history-revision-conflict-dirty',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    vi.unstubAllGlobals()
  })

  it('retains dirty drafts after revision conflict snapshots so they can retry', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const dirtyDraft = draft({ id: 'draft-revision-conflict-dirty', updatedAt: 4000 })
    const serverDraft = draft({ id: 'draft-revision-conflict-server', updatedAt: 3000 })
    ledger.setRevision('DVA-C02', 3)
    ledger.writeDraft(dirtyDraft)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 2,
            draft: serverDraft,
            snapshotRequired: true,
            error: {
              code: 'revision_conflict',
              message: 'Client base revision is ahead of the current Mock Exam Revision',
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 3,
            draft: dirtyDraft,
            snapshotRequired: false,
          }),
        } as Response),
    )

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({
      ok: false,
      reason: 'temporary',
    })

    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(ledger.readDraft('DVA-C02')?.id).toBe('draft-revision-conflict-dirty')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(true)

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 2, draft: dirtyDraft }),
      }),
    )
    expect(ledger.getRevision('DVA-C02')).toBe(3)
    expect(ledger.readDraft('DVA-C02')?.id).toBe('draft-revision-conflict-dirty')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('keeps dirty submitted attempts when history sync reports a submitted-attempt conflict', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const dirtyAttempt = submitted('history-submitted-conflict', 4000, 850)
    const serverAttempt = submitted('history-submitted-conflict', 5000, 760)
    ledger.setRevision('DVA-C02', 1)
    ledger.appendSubmittedAttempt(dirtyAttempt)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          submittedAttempts: [serverAttempt],
          rejected: [
            {
              attemptId: 'history-submitted-conflict',
              code: 'submitted_attempt_conflict',
              message: 'Submitted Mock Exam Attempt already exists with different content',
            },
          ],
          snapshotRequired: true,
          error: {
            code: 'submitted_attempt_conflict',
            message: 'Submitted Mock Exam History contains conflicting attempts',
          },
        }),
      } as Response),
    )

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({
      ok: false,
      reason: 'temporary',
    })

    expect(ledger.getRevision('DVA-C02')).toBe(1)
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.summary.score)).toEqual([850])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['history-submitted-conflict'])
    vi.unstubAllGlobals()
  })

  it('keeps the newer revision when an older response has the same draft payload', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const draftPayload = draft({ id: 'same-draft-payload', updatedAt: 3000 })
    let resolveSaveA: ((response: Response) => void) | null = null
    let resolveSaveB: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSaveA = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSaveB = resolve
            }),
        ),
    )

    ledger.writeDraft(draftPayload)
    const syncA = syncDirtyMockExam('DVA-C02')
    const syncB = syncDirtyMockExam('DVA-C02')
    resolveSaveB?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 2,
        draft: draftPayload,
        snapshotRequired: false,
      }),
    } as Response)
    await expect(syncB).resolves.toEqual({ ok: true })
    resolveSaveA?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 1,
        draft: draftPayload,
        snapshotRequired: false,
      }),
    } as Response)
    await expect(syncA).resolves.toEqual({ ok: true })

    expect(ledger.getRevision('DVA-C02')).toBe(2)
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('keeps a newer dirty draft when an older draft sync response returns', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const draftA = draft({ id: 'draft-a', updatedAt: 2000 })
    const draftB = draft({ id: 'draft-b', updatedAt: 3000 })
    const serverDraftFromA = draft({ id: 'server-from-draft-a', updatedAt: 2500 })
    let resolveFirstSync: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstSync = resolve
          }),
      ),
    )

    ledger.writeDraft(draftA)
    const saveA = syncDirtyMockExam('DVA-C02')
    ledger.writeDraft(draftB)
    resolveFirstSync?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 2,
        draft: serverDraftFromA,
        snapshotRequired: true,
      }),
    } as Response)

    await expect(saveA).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith('/api/mock-exam/dva-c02/draft/sync', expect.any(Object))
    expect(ledger.readDraft('DVA-C02')?.id).toBe('draft-b')
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('keeps a newer dirty draft when an older delete response returns', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const repository = getMockExamDraftRepository('account')
    const draftB = draft({ id: 'draft-b-after-delete', updatedAt: 4000 })
    const serverDraftFromDelete = draft({ id: 'server-from-delete', updatedAt: 3500 })
    ledger.writeDraft(draft({ id: 'draft-before-delete', updatedAt: 2000 }))
    ledger.settleDraft('DVA-C02')
    let resolveDeleteSync: ((response: Response) => void) | null = null
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveDeleteSync = resolve
            }),
        )
        .mockImplementationOnce(() => new Promise<Response>(() => {})),
    )

    await expect(repository.deleteDraft('DVA-C02')).resolves.toBeUndefined()
    const deleteDraft = syncDirtyMockExam('DVA-C02')
    await repository.saveDraft(draftB)
    resolveDeleteSync?.({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 3,
        draft: serverDraftFromDelete,
        snapshotRequired: true,
      }),
    } as Response)

    await expect(deleteDraft).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, draft: null }),
      }),
    )
    expect(ledger.readDraft('DVA-C02')?.id).toBe('draft-b-after-delete')
    expect(hasDirtyMockExam('DVA-C02')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('applies a server-winning draft sync response before settling a dirty draft', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const localOlderDraft = draft({ id: 'client-older', updatedAt: 2000 })
    const serverNewerDraft = draft({ id: 'server-newer', updatedAt: 3000 })
    ledger.writeDraft(localOlderDraft)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 2,
          draft: serverNewerDraft,
          snapshotRequired: true,
        }),
      } as Response),
    )

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith('/api/mock-exam/dva-c02/draft/sync', expect.any(Object))
    expect(ledger.readDraft('DVA-C02')?.id).toBe('server-newer')
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('applies a server-winning draft sync response before settling a dirty delete', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ledger = getAccountMockExamSyncLedger()
    const serverNewerDraft = draft({ id: 'server-newer-after-delete', updatedAt: 4000 })
    ledger.writeDraft(draft({ id: 'draft-before-delete', updatedAt: 2000 }))
    ledger.settleDraft('DVA-C02')
    ledger.clearDraft('DVA-C02')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          draft: serverNewerDraft,
          snapshotRequired: true,
        }),
      } as Response),
    )

    await expect(syncDirtyMockExam('DVA-C02')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/draft/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, draft: null }),
      }),
    )
    expect(ledger.readDraft('DVA-C02')?.id).toBe('server-newer-after-delete')
    expect(hasDirtyMockExam('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })
})

function makeFullDvaBank() {
  return [
    ...Array.from({ length: 25 }, (_, index) => makeQuestion(index + 1, 'Development')),
    ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 101, 'Security')),
    ...Array.from({ length: 18 }, (_, index) => makeQuestion(index + 201, 'Deployment')),
    ...Array.from({ length: 14 }, (_, index) => makeQuestion(index + 301, 'Troubleshooting')),
  ]
}

function makeQuestion(id: number, topic: string) {
  return {
    id,
    cert: 'DVA-C02' as const,
    topic,
    type: 'single' as const,
    correct_answer: ['A' as const],
    en: { question: `Question ${id}`, options: { A: 'A', B: 'B' }, explanation: 'Explain' },
    zh: { question: `题目 ${id}`, options: { A: 'A', B: 'B' }, explanation: '解释' },
    vote_distribution: {},
  }
}

function createMockExamHelperAdapter(): ProgressSyncControllerAdapter {
  return {
    readyCerts: READY_CERTS,
    accountProgress: {
      isOwner: () => true,
      clearScope: () => {},
      listDirty: () => [],
      clearCert: () => {},
      replaceCertFromSnapshot: () => {},
      refreshCertFromSnapshotKeepingDirty: () => {},
      recoverCertFromSnapshotAfterSync: () => {},
      applyAcceptedSync: () => {},
      applyImportedSync: () => {},
    },
    progressRevision: {
      getBaseline: () => null,
      clearBaseline: () => {},
      markChecked: () => {},
    },
    progressSync: {
      post: async (cert, baseRevision) => ({
        cert,
        revision: baseRevision + 1,
        accepted: [],
        rejected: [],
        snapshotRequired: false,
      }),
    },
    progressSnapshot: {
      fetch: async (cert: CertCode) => ({ cert, revision: 1, progress: [] }),
    },
    questionProgress: {
      invalidateAccountProgress: async () => {},
      removeAccountProgressQueries: () => {},
    },
    anonymousProgress: {
      summarizeImport: () => ({ certs: [], certCount: 0, recordCount: 0 }),
      listImportProgress: () => [],
      clearImportCert: () => {},
      hasDismissedImport: () => false,
      dismissImport: () => {},
      clearImportDismissal: () => {},
    },
    mockExam: {
      hasDirty: hasDirtyMockExam,
      syncDirty: syncDirtyMockExam,
      summarizeImport: () => getAccountMockExamSyncLedger().summarizeAnonymousImport(),
      importAnonymousCert: importAnonymousMockExamCert,
      clearScope: () => getAccountMockExamSyncLedger().clearCurrentOwner(),
      invalidate: async () => {},
    },
    auth: {
      storeExpiredLoginMessage: () => {},
      signOut: () => {},
    },
    notices: {
      show: () => {},
    },
  }
}

async function importAnonymousMockExamCert(cert: CertCode) {
  return getAccountMockExamSyncLedger().importAnonymousCert(cert, {
    syncHistory: async (historyCert, history) => {
      if (history.length === 0) return
      await fetchAccountMockExamHistorySnapshot(historyCert)
      for (const attempt of history) getAccountMockExamSyncLedger().appendSubmittedAttempt(attempt)
      const result = await syncDirtyMockExam(historyCert)
      if (!result.ok) throw new Error('Failed to sync account-backed Mock Exam History')
    },
    fetchAccountDraft: fetchAccountMockExamDraftSnapshot,
    syncDraft: async (accountDraft) => {
      getAccountMockExamSyncLedger().writeDraft(accountDraft)
      const result = await syncDirtyMockExam(accountDraft.cert)
      if (!result.ok) throw new Error('Failed to sync account-backed Mock Exam Draft')
    },
  })
}

async function fetchAccountMockExamDraftSnapshot(cert: CertCode): Promise<MockExamAttempt | null> {
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/draft/snapshot`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam Draft')
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    draft: MockExamAttempt | null
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam Draft snapshot')
  }
  getAccountMockExamSyncLedger().setRevision(cert, body.revision)
  getAccountMockExamSyncLedger().setDraftSnapshot(cert, body.draft)
  return body.draft
}

async function fetchAccountMockExamHistorySnapshot(
  cert: CertCode,
): Promise<SubmittedMockExamAttempt[]> {
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/history/snapshot`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam History')
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    submittedAttempts: SubmittedMockExamAttempt[]
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam History snapshot')
  }
  getAccountMockExamSyncLedger().applyHistorySnapshot(cert, body.revision, body.submittedAttempts)
  return getAccountMockExamSyncLedger().readHistory(cert)
}

describe('Mock Exam Draft sync resolution', () => {
  it('advances Mock Exam Revision for create, update, and delete syncs', () => {
    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 0,
        serverRevision: 0,
        serverDraft: null,
        clientDraft: draft({ id: 'created', updatedAt: 1000 }),
      }),
    ).toMatchObject({ revision: 1, draft: { id: 'created' }, changed: true })

    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 1,
        serverRevision: 1,
        serverDraft: draft({ id: 'created', updatedAt: 1000 }),
        clientDraft: draft({ id: 'updated', updatedAt: 2000 }),
      }),
    ).toMatchObject({ revision: 2, draft: { id: 'updated' }, changed: true })

    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 2,
        serverRevision: 2,
        serverDraft: draft({ id: 'updated', updatedAt: 2000 }),
        clientDraft: null,
      }),
    ).toMatchObject({ revision: 3, draft: null, changed: true })
  })

  it('keeps the newest competing draft when a stale client syncs', () => {
    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 1,
        serverRevision: 2,
        serverDraft: draft({ id: 'server-newer', updatedAt: 3000 }),
        clientDraft: draft({ id: 'client-older', updatedAt: 2000 }),
      }),
    ).toEqual({
      status: 200,
      revision: 2,
      draft: draft({ id: 'server-newer', updatedAt: 3000 }),
      changed: false,
      snapshotRequired: true,
    })

    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 1,
        serverRevision: 2,
        serverDraft: draft({ id: 'server-older', updatedAt: 2000 }),
        clientDraft: draft({ id: 'client-newer', updatedAt: 3000 }),
      }),
    ).toEqual({
      status: 200,
      revision: 3,
      draft: draft({ id: 'client-newer', updatedAt: 3000 }),
      changed: true,
      snapshotRequired: true,
    })
  })

  it('rejects ahead revisions without rewriting the server draft', () => {
    expect(
      resolveMockExamDraftSync({
        cert: 'DVA-C02',
        baseRevision: 3,
        serverRevision: 2,
        serverDraft: draft({ id: 'server', updatedAt: 2000 }),
        clientDraft: draft({ id: 'client', updatedAt: 3000 }),
      }),
    ).toEqual({
      status: 409,
      revision: 2,
      draft: draft({ id: 'server', updatedAt: 2000 }),
      changed: false,
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Mock Exam Revision',
      },
    })
  })
})

describe('Mock Exam History sync resolution', () => {
  it('merges distinct submitted attempts and advances the independent Mock Exam Revision', () => {
    const clientNewer = submitted('submitted-newer', 3000, 850)
    const serverOlder = submitted('submitted-older', 1000, 650)

    expect(
      resolveMockExamHistorySync({
        cert: 'DVA-C02',
        baseRevision: 2,
        serverRevision: 2,
        serverHistory: [serverOlder],
        clientHistory: [clientNewer],
      }),
    ).toMatchObject({
      status: 200,
      revision: 3,
      changed: true,
      snapshotRequired: false,
      submittedAttempts: [clientNewer, serverOlder],
    })
  })

  it('accepts identical same-id submitted attempts idempotently without duplicates', () => {
    const existing = submitted('same-id', 3000, 850)

    expect(
      resolveMockExamHistorySync({
        cert: 'DVA-C02',
        baseRevision: 4,
        serverRevision: 4,
        serverHistory: [existing],
        clientHistory: [existing],
      }),
    ).toMatchObject({
      status: 200,
      revision: 4,
      changed: false,
      submittedAttempts: [existing],
      rejected: [],
    })
  })

  it('rejects different same-id submitted attempts without rewriting existing history', () => {
    const existing = submitted('same-id-conflict', 3000, 850)
    const rewritten = submitted('same-id-conflict', 3000, 650)

    expect(
      resolveMockExamHistorySync({
        cert: 'DVA-C02',
        baseRevision: 4,
        serverRevision: 4,
        serverHistory: [existing],
        clientHistory: [rewritten],
      }),
    ).toMatchObject({
      status: 409,
      revision: 4,
      changed: false,
      submittedAttempts: [existing],
      rejected: [{ attemptId: 'same-id-conflict', code: 'submitted_attempt_conflict' }],
    })
  })

  it('keeps no-op history syncs from advancing Mock Exam Revision', () => {
    expect(
      resolveMockExamHistorySync({
        cert: 'DVA-C02',
        baseRevision: 5,
        serverRevision: 5,
        serverHistory: [],
        clientHistory: [],
      }),
    ).toMatchObject({ status: 200, revision: 5, changed: false, submittedAttempts: [] })
  })
})

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    qid: 1,
    domain: 'Development with AWS Services',
    topic: 'Development',
    correctAnswer: ['A'],
    type: 'single',
    userPicks: [],
    correct: null,
    flagged: false,
    answered: false,
    ...overrides,
  }
}

function submitted(
  id: string,
  submittedAt: number,
  score: number,
  cert: SubmittedMockExamAttempt['cert'] = 'DVA-C02',
): SubmittedMockExamAttempt {
  return {
    id,
    cert,
    submittedAt,
    questions: draft({ id }).questions,
    summary: {
      score,
      passed: score >= 720,
      correctCount: 1,
      totalCount: 2,
      unansweredCount: 1,
      accuracy: 0.5,
      timeUsedSeconds: 600,
      autoSubmitted: false,
      domains: [
        {
          name: 'Development with AWS Services',
          correctCount: 1,
          totalCount: 2,
          accuracy: 0.5,
          weight: 32,
        },
      ],
    },
  }
}
