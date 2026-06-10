import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CertCode, QuestionProgress } from '../src/data/types'
import type {
  DailyQuestionStatsSyncBucket,
  ProgressSyncResult,
} from '../src/lib/account-progress-sync-client'
import { BrowserProgressModule, type DailyQuestionStats } from '../src/lib/browser-progress-module'
import { READY_CERTS } from '../src/lib/cert-catalog'
import {
  getAccountMockExamSyncLedger,
  syncDirtyMockExam,
} from '../src/lib/mock-exam/account-sync-ledger'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'
import {
  createProgressSyncController,
  type ProgressSyncControllerAdapter,
  ProgressSyncControllerError,
  type ProgressSyncNotice,
} from '../src/lib/progress-sync-controller'

function progress(qid: number, overrides: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    qid,
    correctCount: 1,
    wrongCount: 0,
    lastPicks: ['A'],
    lastCorrect: true,
    lastAnsweredAt: 1_700_000_000_000,
    bookmarked: false,
    bookmarkUpdatedAt: null,
    ...overrides,
  }
}

function mockExamDraft(id: string, cert: CertCode = 'DVA-C02'): MockExamAttempt {
  return {
    id,
    cert,
    draftStatus: 'saved',
    currentIndex: 0,
    questionCount: 1,
    timeLimitSeconds: 120,
    startedAt: 1000,
    updatedAt: 2000,
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: ['A'],
        type: 'single',
        userPicks: ['A'],
        correct: true,
        flagged: false,
        answered: true,
      },
    ],
  }
}

function mockExamSubmitted(
  id: string,
  cert: CertCode = 'DVA-C02',
  submittedAt = 3000,
): SubmittedMockExamAttempt {
  return {
    id,
    cert,
    submittedAt,
    questions: mockExamDraft(`${id}-draft`, cert).questions,
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

function createAdapter() {
  const baselines = new Map<string, { revision: number; lastSyncedAt: number }>()
  const dirty = new Map<CertCode, QuestionProgress[]>()
  const dirtyDailyStats = new Map<CertCode, DailyQuestionStatsSyncBucket[]>()
  const accountProgress = new Map<CertCode, QuestionProgress[]>()
  const accountDailyStats = new Map<CertCode, DailyQuestionStats[]>()
  const dismissedImports = new Set<string>()
  const anonymous = new Map<CertCode, QuestionProgress[]>()
  const anonymousDailyStats = new Map<CertCode, DailyQuestionStatsSyncBucket[]>()
  const anonymousMockExam = new Set<CertCode>()
  const dirtyMockExam = new Set<CertCode>()
  const owner = { userId: 'user-1' }
  const syncResponses: Array<
    | ProgressSyncResult
    | Promise<ProgressSyncResult>
    | Error
    | ((
        cert: CertCode,
        baseRevision: number,
        records: QuestionProgress[],
        dailyStats?: DailyQuestionStatsSyncBucket[],
      ) => ProgressSyncResult | Promise<ProgressSyncResult>)
  > = []
  const snapshotErrors: Error[] = []
  const snapshotResponses = new Map<CertCode, QuestionProgress[]>()
  const notices: ProgressSyncNotice[] = []
  const syncCalls: Array<{ cert: CertCode; baseRevision: number; progress: QuestionProgress[] }> =
    []
  const dailySyncCalls: Array<{
    cert: CertCode
    baseRevision: number
    dailyStats: DailyQuestionStatsSyncBucket[]
  }> = []
  const mockExamImportCalls: CertCode[] = []
  const mockExamSyncCalls: CertCode[] = []
  const mockExamInvalidations: string[] = []
  const snapshotCalls: CertCode[] = []
  const invalidations: string[] = []
  const keepingDirtySnapshotCalls: Array<{
    userId: string
    cert: CertCode
    revision: number
    progress: QuestionProgress[]
  }> = []
  const afterSyncSnapshotCalls: Array<{
    userId: string
    cert: CertCode
    revision: number
    progress: QuestionProgress[]
    uploaded: QuestionProgress[]
  }> = []

  const baselineKey = (userId: string, cert: CertCode) => `${userId}:${cert}`
  const adapter: ProgressSyncControllerAdapter = {
    readyCerts: READY_CERTS,
    accountProgress: {
      isOwner: (userId) => owner.userId === userId,
      clearScope: vi.fn(),
      listDirty: (cert) => dirty.get(cert) ?? [],
      listDirtyDailyStats: (cert) => dirtyDailyStats.get(cert) ?? [],
      clearCert: (userId, cert) => {
        accountProgress.delete(cert)
        accountDailyStats.delete(cert)
        baselines.delete(baselineKey(userId, cert))
      },
      replaceCertFromSnapshot: (userId, cert, revision, records, dailyStats) => {
        accountProgress.set(cert, records)
        accountDailyStats.set(cert, dailyStats)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
        dirty.delete(cert)
        dirtyDailyStats.delete(cert)
      },
      refreshCertFromSnapshotKeepingDirty: (userId, cert, revision, records, dailyStats) => {
        keepingDirtySnapshotCalls.push({
          userId,
          cert,
          revision,
          progress: records,
        })
        accountProgress.set(cert, records)
        accountDailyStats.set(cert, dailyStats)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
      recoverCertFromSnapshotAfterSync: (userId, cert, revision, records, dailyStats, uploaded) => {
        afterSyncSnapshotCalls.push({
          userId,
          cert,
          revision,
          progress: records,
          uploaded,
        })
        accountProgress.set(cert, records)
        accountDailyStats.set(cert, dailyStats)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
      applyAcceptedSync: (userId, cert, revision, accepted, _uploaded, dailyStats = []) => {
        accountProgress.set(cert, accepted)
        accountDailyStats.set(cert, dailyStats)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
        dirty.delete(cert)
        dirtyDailyStats.delete(cert)
      },
      applyImportedSync: (userId, cert, revision, accepted, _uploaded, dailyStats = []) => {
        accountProgress.set(cert, accepted)
        accountDailyStats.set(cert, dailyStats)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
    },
    progressRevision: {
      getBaseline: (userId, cert) => baselines.get(baselineKey(userId, cert)) ?? null,
      clearBaseline: (userId, cert) => baselines.delete(baselineKey(userId, cert)),
      markChecked: (userId, cert, revision) => {
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
    },
    progressSync: {
      post: async (cert, baseRevision, records, dailyStats = []) => {
        syncCalls.push({ cert, baseRevision, progress: records })
        dailySyncCalls.push({ cert, baseRevision, dailyStats })
        const next = syncResponses.shift()
        if (next instanceof Error) throw next
        if (typeof next === 'function') return next(cert, baseRevision, records, dailyStats)
        if (next) return next
        return {
          cert,
          revision: baseRevision + 1,
          accepted: records,
          dailyStats: [],
          rejected: [],
          snapshotRequired: false,
        }
      },
    },
    progressSnapshot: {
      fetch: async (cert) => {
        snapshotCalls.push(cert)
        const error = snapshotErrors.shift()
        if (error) throw error
        return {
          cert,
          revision: 10,
          progress: snapshotResponses.get(cert) ?? [progress(99)],
          dailyStats: [],
        }
      },
    },
    questionProgress: {
      invalidateAccountProgress: async () => {
        invalidations.push('account')
      },
      removeAccountProgressQueries: vi.fn(),
    },
    anonymousProgress: {
      summarizeImport: () => {
        const certs = Array.from(
          new Set([...anonymous.keys(), ...anonymousDailyStats.keys()]),
        ).filter(
          (cert) =>
            (anonymous.get(cert)?.length ?? 0) > 0 ||
            (anonymousDailyStats.get(cert)?.length ?? 0) > 0,
        )
        const recordCount = certs.reduce(
          (total, cert) =>
            total +
            (anonymous.get(cert)?.length ?? 0) +
            (anonymousDailyStats.get(cert)?.length ?? 0),
          0,
        )
        return { certs, certCount: certs.length, recordCount }
      },
      listImportProgress: (cert) => anonymous.get(cert) ?? [],
      listImportDailyStats: (cert) => anonymousDailyStats.get(cert) ?? [],
      clearImportCert: (cert) => {
        anonymous.delete(cert)
        anonymousDailyStats.delete(cert)
      },
      hasDismissedImport: (userId) => dismissedImports.has(userId),
      dismissImport: (userId) => {
        dismissedImports.add(userId)
      },
      clearImportDismissal: (userId) => {
        dismissedImports.delete(userId)
      },
    },
    mockExam: {
      hasDirty: (cert) => dirtyMockExam.has(cert),
      syncDirty: async (cert) => {
        mockExamSyncCalls.push(cert)
        dirtyMockExam.delete(cert)
        return { ok: true }
      },
      summarizeImport: () => {
        const certs = Array.from(anonymousMockExam)
        return { certs, certCount: certs.length, recordCount: certs.length }
      },
      importAnonymousCert: async (cert) => {
        mockExamImportCalls.push(cert)
        anonymousMockExam.delete(cert)
        return { ok: true }
      },
      clearScope: vi.fn(),
      invalidate: async () => {
        mockExamInvalidations.push('mock-exam')
      },
    },
    auth: {
      storeExpiredLoginMessage: vi.fn(),
      signOut: vi.fn(),
    },
    notices: {
      show: (notice) => notices.push(notice),
    },
  }

  return {
    adapter,
    baselines,
    dirty,
    dirtyDailyStats,
    accountProgress,
    accountDailyStats,
    anonymous,
    anonymousDailyStats,
    anonymousMockExam,
    dirtyMockExam,
    syncResponses,
    snapshotErrors,
    snapshotResponses,
    owner,
    notices,
    syncCalls,
    dailySyncCalls,
    mockExamImportCalls,
    mockExamSyncCalls,
    mockExamInvalidations,
    snapshotCalls,
    invalidations,
    keepingDirtySnapshotCalls,
    afterSyncSnapshotCalls,
    baselineKey,
  }
}

function useLedgerBackedMockExamAdapter(ctx: ReturnType<typeof createAdapter>) {
  if (!ctx.adapter.mockExam) throw new Error('mock exam adapter missing')
  ctx.adapter.mockExam = {
    hasDirty: (cert) => getAccountMockExamSyncLedger().hasDirty(cert),
    syncDirty: async (cert) => {
      ctx.mockExamSyncCalls.push(cert)
      return syncDirtyMockExam(cert)
    },
    summarizeImport: () => getAccountMockExamSyncLedger().summarizeAnonymousImport(),
    importAnonymousCert: async () => ({ ok: true }),
    clearScope: () => getAccountMockExamSyncLedger().clearCurrentOwner(),
    invalidate: async () => {
      ctx.mockExamInvalidations.push('mock-exam')
    },
  }
  return ctx
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Progress Sync controller', () => {
  it('manual sync flushes dirty account progress, refreshes the current snapshot, and emits success', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(1)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 3, progress: [dirtyProgress] }])
    expect(ctx.snapshotCalls).toEqual(['DVA-C02'])
    expect(ctx.notices).toEqual(['manual-success'])
    expect(ctx.invalidations).toEqual(['account', 'account'])
    expect(controller.getState().status).toBe('synced')
  })

  it('derives visible sync state from the current cert only', () => {
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 9,
      lastSyncedAt: 1_800_000_000_000,
    })
    ctx.dirty.set('CLF-C02', [progress(13)])

    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    expect(controller.getState()).toMatchObject({
      hasDirtyProgress: false,
      lastSyncedAt: 1_700_000_000_000,
      status: 'synced',
    })
  })

  it('manual sync uploads dirty progress for the current cert only', async () => {
    const ctx = createAdapter()
    const currentDirty = progress(14)
    const otherDirty = progress(15)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('DVA-C02', [currentDirty])
    ctx.dirty.set('CLF-C02', [otherDirty])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 3, progress: [currentDirty] }])
    expect(ctx.dirty.get('DVA-C02')).toBeUndefined()
    expect(ctx.dirty.get('CLF-C02')).toEqual([otherDirty])
    expect(ctx.snapshotCalls).toEqual(['DVA-C02'])
    expect(ctx.notices).toEqual(['manual-success'])
  })

  it('manual sync uploads dirty daily question stats even when question progress is clean', async () => {
    const ctx = createAdapter()
    const dailyStats: DailyQuestionStatsSyncBucket = {
      date: '2026-01-01',
      sourceId: 'client:device-1',
      correctCount: 2,
      wrongCount: 1,
      updatedAt: 1_767_225_600_000,
    }
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirtyDailyStats.set('DVA-C02', [dailyStats])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    expect(controller.getState().status).toBe('dirty')
    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 3, progress: [] }])
    expect(ctx.dailySyncCalls).toEqual([
      { cert: 'DVA-C02', baseRevision: 3, dailyStats: [dailyStats] },
    ])
  })

  it('manual sync without a current cert is a silent no-op', async () => {
    const ctx = createAdapter()
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([])
    expect(ctx.snapshotCalls).toEqual([])
    expect(ctx.notices).toEqual([])
    expect(controller.getState().status).toBe('synced')
  })

  it('before-sign-out sync flushes dirty progress without refreshing the current snapshot or emitting success', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(2)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 4, progress: [dirtyProgress] }])
    expect(ctx.snapshotCalls).toEqual([])
    expect(ctx.notices).toEqual([])
  })

  it('does not attribute before-sign-out failures from non-current certs to the current cert', async () => {
    const ctx = createAdapter()
    const otherDirty = progress(19)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('CLF-C02', [otherDirty])
    ctx.syncResponses.push(new ProgressSyncControllerError('temporary'))
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({
      ok: false,
      reason: 'temporary',
    })

    expect(ctx.syncCalls).toEqual([{ cert: 'CLF-C02', baseRevision: 4, progress: [otherDirty] }])
    expect(controller.getState().status).toBe('synced')
  })

  it('blocks on missing baseline until the current progress snapshot is installed', async () => {
    const ctx = createAdapter()
    ctx.snapshotResponses.set('DVA-C02', [progress(3)])
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 0,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'SAA-C03'), {
      revision: 0,
      lastSyncedAt: 1_700_000_000_000,
    })
    const input = {
      authStatus: 'authenticated' as const,
      userId: 'user-1',
      currentCert: 'DVA-C02' as const,
      scope: 'account' as const,
    }
    const controller = createProgressSyncController(ctx.adapter, input)

    expect(controller.getState()).toMatchObject({ view: 'blocking', status: 'syncing' })

    controller.update(input)
    await flushPromises()
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(ctx.snapshotCalls).toEqual(['DVA-C02'])
    expect(ctx.accountProgress.get('DVA-C02')).toEqual([progress(3)])
    expect(controller.getState()).toMatchObject({ view: 'ready', status: 'synced' })
  })

  it('keeps dirty progress and retries temporary dirty sync failures with backoff', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    const dirtyProgress = progress(4)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push(new ProgressSyncControllerError('temporary'))
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('DVA-C02')
    await vi.advanceTimersByTimeAsync(750)

    expect(ctx.syncCalls).toHaveLength(1)
    expect(ctx.notices).toEqual(['temporary'])
    expect(ctx.dirty.get('DVA-C02')).toEqual([dirtyProgress])
    expect(controller.getState().status).toBe('failed')

    await vi.advanceTimersByTimeAsync(5_000)

    expect(ctx.syncCalls).toHaveLength(2)
    expect(ctx.dirty.get('DVA-C02')).toBeUndefined()
    expect(controller.getState().status).toBe('synced')
  })

  it('enqueueDirtySync flushes dirty mock exam state without dirty question progress', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirtyMockExam.add('DVA-C02')
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('DVA-C02')
    await vi.advanceTimersByTimeAsync(750)

    expect(ctx.syncCalls).toEqual([])
    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)
    expect(controller.getState().status).toBe('synced')
  })

  it('enqueueDirtySync invalidates mock exam queries after dirty mock exam sync succeeds', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirtyMockExam.add('DVA-C02')
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('DVA-C02')
    await vi.advanceTimersByTimeAsync(750)
    await flushPromises()

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.mockExamInvalidations).toEqual(['mock-exam'])
  })

  it('manual sync flushes ledger-backed dirty mock exam drafts through the mockExam sub-adapter', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ctx = useLedgerBackedMockExamAdapter(createAdapter())
    const dirtyDraft = mockExamDraft('ledger-backed-controller-draft')
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    getAccountMockExamSyncLedger().writeDraft(dirtyDraft)
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
    const controller = createProgressSyncController(ctx.adapter, {
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
    expect(getAccountMockExamSyncLedger().hasDirty('DVA-C02')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('manual sync flushes ledger-backed dirty submitted mock exam attempts through the mockExam sub-adapter', async () => {
    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-1')
    const ctx = useLedgerBackedMockExamAdapter(createAdapter())
    const submitted = mockExamSubmitted('ledger-backed-controller-submitted')
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    getAccountMockExamSyncLedger().appendSubmittedAttempt(submitted)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 1,
          submittedAttempts: [submitted],
        }),
      } as Response),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/mock-exam/dva-c02/history/sync',
      expect.objectContaining({
        body: JSON.stringify({ baseRevision: 0, submittedAttempts: [submitted] }),
      }),
    )
    expect(getAccountMockExamSyncLedger().listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    vi.unstubAllGlobals()
  })

  it('does not invalidate mock exam queries when no dirty mock exam state is flushed', async () => {
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.mockExamSyncCalls).toEqual([])
    expect(ctx.mockExamInvalidations).toEqual([])
  })

  it('startup revision check flushes dirty mock exam state without dirty question progress', async () => {
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirtyMockExam.add('DVA-C02')
    const controller = createProgressSyncController(ctx.adapter)

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })
    await flushPromises()
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 2, progress: [] }])
    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)
    expect(controller.getState().status).toBe('synced')
  })

  it('startup revision check continues after a dirty mock exam retry succeeds', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirtyMockExam.add('DVA-C02')
    if (!ctx.adapter.mockExam) throw new Error('mock exam adapter missing')
    ctx.adapter.mockExam.syncDirty = async (cert) => {
      ctx.mockExamSyncCalls.push(cert)
      if (ctx.mockExamSyncCalls.length === 1) return { ok: false, reason: 'temporary' }
      ctx.dirtyMockExam.delete(cert)
      return { ok: true }
    }
    const controller = createProgressSyncController(ctx.adapter)

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.syncCalls).toEqual([])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(true)

    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()
    await flushPromises()
    await flushPromises()

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02', 'DVA-C02'])
    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 2, progress: [] }])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)
    expect(controller.getState().status).toBe('synced')
  })

  it('keeps visible state stable while a non-current cert sync is in flight', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    const otherDirty = progress(16)
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('CLF-C02', [otherDirty])
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('CLF-C02')
    await vi.advanceTimersByTimeAsync(750)

    expect(ctx.syncCalls).toEqual([{ cert: 'CLF-C02', baseRevision: 4, progress: [otherDirty] }])
    expect(controller.getState().status).toBe('synced')

    resolveSync({
      cert: 'CLF-C02',
      revision: 5,
      accepted: [otherDirty],
      rejected: [],
      snapshotRequired: false,
    })
    await flushPromises()
    await flushPromises()

    expect(controller.getState().status).toBe('synced')
  })

  it('does not surface non-current dirty sync failures as current cert failures', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    const otherDirty = progress(17)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('CLF-C02', [otherDirty])
    ctx.syncResponses.push(new ProgressSyncControllerError('temporary'))
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('CLF-C02')
    await vi.advanceTimersByTimeAsync(750)

    expect(ctx.syncCalls).toEqual([{ cert: 'CLF-C02', baseRevision: 4, progress: [otherDirty] }])
    expect(controller.getState().status).toBe('synced')
    expect(ctx.dirty.get('CLF-C02')).toEqual([otherDirty])
  })

  it('does not keep showing manual syncing after switching away from the syncing cert', async () => {
    const ctx = createAdapter()
    const currentDirty = progress(18)
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('DVA-C02', [currentDirty])
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    const syncPromise = controller.sync('manual')
    await flushPromises()
    expect(controller.getState().status).toBe('syncing')

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'CLF-C02',
      scope: 'account',
    })

    expect(controller.getState().status).toBe('synced')

    resolveSync({
      cert: 'DVA-C02',
      revision: 5,
      accepted: [currentDirty],
      rejected: [],
      snapshotRequired: false,
    })
    await syncPromise
  })

  it('starts background dirty sync for the previous cert when switching certs', async () => {
    const ctx = createAdapter()
    const previousDirty = progress(22)
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('DVA-C02', [previousDirty])
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'CLF-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 3, progress: [previousDirty] }])
    expect(controller.getState()).toMatchObject({
      currentCert: 'CLF-C02',
      gateState: 'ready',
      hasDirtyProgress: false,
      lastSyncedAt: 1_700_000_001_000,
      status: 'synced',
      view: 'ready',
    })

    resolveSync({
      cert: 'DVA-C02',
      revision: 4,
      accepted: [previousDirty],
      rejected: [],
      snapshotRequired: false,
    })
    await flushPromises()

    expect(ctx.dirty.get('DVA-C02')).toBeUndefined()
    expect(ctx.baselines.get(ctx.baselineKey('user-1', 'DVA-C02'))?.revision).toBe(4)
  })

  it('starts background mock exam sync for the previous cert when switching certs', async () => {
    const ctx = createAdapter()
    let resolveCurrentSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirtyMockExam.add('DVA-C02')
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveCurrentSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'CLF-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.syncCalls.filter((call) => call.cert === 'DVA-C02')).toEqual([])
    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)

    resolveCurrentSync({
      cert: 'CLF-C02',
      revision: 5,
      accepted: [],
      rejected: [],
      snapshotRequired: false,
    })
    await flushPromises()
  })

  it('keeps previous cert dirty progress when switch background sync fails', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    const previousDirty = progress(23)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('DVA-C02', [previousDirty])
    ctx.syncResponses.push(new ProgressSyncControllerError('temporary'))
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'CLF-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 3, progress: [previousDirty] }])
    expect(ctx.dirty.get('DVA-C02')).toEqual([previousDirty])
    expect(controller.getState()).toMatchObject({
      currentCert: 'CLF-C02',
      gateState: 'ready',
      hasDirtyProgress: false,
      lastSyncedAt: 1_700_000_001_000,
      status: 'synced',
      view: 'ready',
    })
    expect(ctx.notices).toEqual([])
  })

  it('does not start previous cert background sync when the previous cert is clean', async () => {
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'CLF-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.syncCalls.filter((call) => call.cert === 'DVA-C02')).toEqual([])
    expect(ctx.mockExamSyncCalls).toEqual([])
  })

  it('does not start previous cert background sync when the account user changes', async () => {
    const ctx = createAdapter()
    const previousDirty = progress(24)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-2', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.dirty.set('DVA-C02', [previousDirty])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-2',
      currentCert: 'CLF-C02',
      scope: 'account',
    })
    await flushPromises()

    expect(ctx.syncCalls.filter((call) => call.cert === 'DVA-C02')).toEqual([])
    expect(ctx.dirty.get('DVA-C02')).toEqual([previousDirty])
  })

  it('recovers revision conflicts by replacing the cert from a fresh snapshot', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(5)
    const snapshotProgress = progress(55)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 7,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push({
      cert: 'DVA-C02',
      revision: 8,
      accepted: [],
      rejected: [],
      snapshotRequired: false,
      errorCode: 'revision_conflict',
    })
    ctx.snapshotResponses.set('DVA-C02', [snapshotProgress])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({ ok: true })

    expect(ctx.snapshotCalls).toEqual(['DVA-C02'])
    expect(ctx.accountProgress.get('DVA-C02')).toEqual([snapshotProgress])
    expect(ctx.dirty.get('DVA-C02')).toBeUndefined()
  })

  it('does not apply a sync response after the account owner changes', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(6)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push((cert, baseRevision, records) => {
      ctx.owner.userId = 'user-2'
      return {
        cert,
        revision: baseRevision + 1,
        accepted: records,
        rejected: [],
        snapshotRequired: false,
      }
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({ ok: true })

    expect(ctx.accountProgress.get('DVA-C02')).toBeUndefined()
    expect(ctx.dirty.get('DVA-C02')).toEqual([dirtyProgress])
  })

  it('flushes account dirty progress before importing anonymous progress for that cert', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(7)
    const anonymousProgress = progress(8)
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('CLF-C02', [dirtyProgress])
    ctx.anonymous.set('CLF-C02', [anonymousProgress])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    await expect(controller.importAnonymousProgress()).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls.map((call) => call.progress)).toEqual([
      [dirtyProgress],
      [anonymousProgress],
    ])
    expect(ctx.anonymous.get('CLF-C02')).toBeUndefined()
  })

  it('imports anonymous daily question stats even when that cert has no question progress', async () => {
    const ctx = createAdapter()
    const dailyStats: DailyQuestionStatsSyncBucket = {
      date: '2026-01-01',
      sourceId: 'anon-import:device-1',
      correctCount: 2,
      wrongCount: 1,
      updatedAt: 1_767_225_600_000,
    }
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.anonymousDailyStats.set('CLF-C02', [dailyStats])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    await expect(controller.importAnonymousProgress()).resolves.toEqual({ ok: true })

    expect(ctx.syncCalls).toEqual([{ cert: 'CLF-C02', baseRevision: 2, progress: [] }])
    expect(ctx.dailySyncCalls).toEqual([
      { cert: 'CLF-C02', baseRevision: 2, dailyStats: [dailyStats] },
    ])
    expect(ctx.anonymousDailyStats.get('CLF-C02')).toBeUndefined()
  })

  it('imports anonymous mock exam data after flushing dirty account mock exam state for that cert', async () => {
    const ctx = createAdapter()
    ctx.anonymousMockExam.add('DVA-C02')
    ctx.dirtyMockExam.add('DVA-C02')
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    await expect(controller.importAnonymousProgress()).resolves.toEqual({ ok: true })

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.mockExamImportCalls).toEqual(['DVA-C02'])
    expect(ctx.anonymousMockExam.has('DVA-C02')).toBe(false)
  })

  it('shows the existing anonymous import action when only anonymous mock exam data exists', () => {
    const ctx = createAdapter()
    ctx.anonymousMockExam.add('DVA-C02')
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })

    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    expect(controller.getState()).toMatchObject({
      view: 'anonymous-import',
      anonymousImportAvailable: true,
      anonymousImportSummary: { certCount: 1, recordCount: 1 },
    })
  })

  it('marks the current cert dirty and manual sync clears dirty mock exam state', async () => {
    const ctx = createAdapter()
    ctx.dirtyMockExam.add('DVA-C02')
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    expect(controller.getState()).toMatchObject({ status: 'dirty', hasDirtyProgress: true })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)
    expect(controller.getState()).toMatchObject({ status: 'synced', hasDirtyProgress: false })
  })

  it('manual sync flushes current cert mock exam dirty state without clearing other certs', async () => {
    const ctx = createAdapter()
    ctx.dirtyMockExam.add('DVA-C02')
    ctx.dirtyMockExam.add('CLF-C02')
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 3,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'CLF-C02'), {
      revision: 4,
      lastSyncedAt: 1_700_000_001_000,
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: true })

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02'])
    expect(ctx.dirtyMockExam.has('DVA-C02')).toBe(false)
    expect(ctx.dirtyMockExam.has('CLF-C02')).toBe(true)
  })

  it('before-sign-out flushes dirty mock exam data for all ready certifications', async () => {
    const ctx = createAdapter()
    ctx.dirtyMockExam.add('DVA-C02')
    ctx.dirtyMockExam.add('CLF-C02')
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({ ok: true })

    expect(ctx.mockExamSyncCalls).toEqual(['DVA-C02', 'CLF-C02'])
    expect(ctx.dirtyMockExam.size).toBe(0)
  })

  it('blocks before-sign-out when dirty account-backed mock exam data cannot sync', async () => {
    const ctx = createAdapter()
    ctx.dirtyMockExam.add('CLF-C02')
    if (!ctx.adapter.mockExam) throw new Error('mock exam adapter missing')
    ctx.adapter.mockExam.syncDirty = async (cert) => {
      ctx.mockExamSyncCalls.push(cert)
      return { ok: false, reason: 'temporary' }
    }
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({
      ok: false,
      reason: 'temporary',
    })

    expect(ctx.mockExamSyncCalls).toEqual(['CLF-C02'])
    expect(ctx.dirtyMockExam.has('CLF-C02')).toBe(true)
  })

  it('clears account progress and hides UI when sync auth expires', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(9)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 5,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push(new ProgressSyncControllerError('auth'))
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('manual')).resolves.toEqual({ ok: false, reason: 'fatal' })

    expect(ctx.adapter.auth.storeExpiredLoginMessage).toHaveBeenCalledOnce()
    expect(ctx.adapter.accountProgress.clearScope).toHaveBeenCalledOnce()
    expect(ctx.adapter.questionProgress.removeAccountProgressQueries).toHaveBeenCalledOnce()
    expect(ctx.adapter.auth.signOut).toHaveBeenCalledOnce()
    expect(controller.getState().view).toBe('hidden')
  })

  it('passes bookmark tombstones into snapshot recovery so dirty removals are preserved', async () => {
    const ctx = createAdapter()
    const bookmarkTombstone = progress(10, {
      correctCount: 0,
      lastPicks: [],
      lastCorrect: null,
      lastAnsweredAt: null,
      bookmarked: false,
      bookmarkUpdatedAt: 1_700_000_001_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 1,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [bookmarkTombstone])
    ctx.syncResponses.push({
      cert: 'DVA-C02',
      revision: 2,
      accepted: [],
      rejected: [{ index: 0, qid: 10, code: 'invalid' }],
      snapshotRequired: true,
    })
    ctx.snapshotResponses.set('DVA-C02', [])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    await expect(controller.sync('before-sign-out')).resolves.toEqual({ ok: true })

    expect(ctx.afterSyncSnapshotCalls).toEqual([
      {
        userId: 'user-1',
        cert: 'DVA-C02',
        revision: 10,
        progress: [],
        uploaded: [bookmarkTombstone],
      },
    ])
  })

  it('retryGate reruns a failed baseline snapshot and opens the ready view', async () => {
    const ctx = createAdapter()
    const input = {
      authStatus: 'authenticated' as const,
      userId: 'user-1',
      currentCert: 'DVA-C02' as const,
      scope: 'account' as const,
    }
    ctx.snapshotErrors.push(new ProgressSyncControllerError('temporary'))
    const controller = createProgressSyncController(ctx.adapter, input)

    controller.update(input)
    await flushPromises()

    expect(controller.getState()).toMatchObject({ view: 'blocking', gateState: 'error' })

    controller.retryGate()
    await flushPromises()

    expect(ctx.snapshotCalls).toEqual(['DVA-C02', 'DVA-C02'])
    expect(controller.getState()).toMatchObject({ view: 'ready', gateState: 'ready' })
  })

  it('handleOnline runs a background revision check for the current cert', async () => {
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 5,
      lastSyncedAt: 1_700_000_000_000,
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.handleOnline()
    await flushPromises()

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 5, progress: [] }])
  })

  it('shows syncing while the current cert revision check is in flight', async () => {
    const ctx = createAdapter()
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 5,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.handleOnline()
    await flushPromises()

    expect(ctx.syncCalls).toEqual([{ cert: 'DVA-C02', baseRevision: 5, progress: [] }])
    expect(controller.getState().status).toBe('syncing')

    resolveSync({
      cert: 'DVA-C02',
      revision: 5,
      accepted: [],
      rejected: [],
      snapshotRequired: false,
    })
    await flushPromises()
    await flushPromises()

    expect(controller.getState().status).toBe('synced')
  })

  it('clears in-flight revision state when the account user changes', async () => {
    const ctx = createAdapter()
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 5,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.baselines.set(ctx.baselineKey('user-2', 'DVA-C02'), {
      revision: 7,
      lastSyncedAt: 1_700_000_001_000,
    })
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.handleOnline()
    await flushPromises()
    expect(controller.getState().status).toBe('syncing')

    controller.update({
      authStatus: 'authenticated',
      userId: 'user-2',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    expect(controller.getState().status).toBe('synced')

    resolveSync({
      cert: 'DVA-C02',
      revision: 5,
      accepted: [],
      rejected: [],
      snapshotRequired: false,
    })
    await flushPromises()
  })

  it('dismissAnonymousImport hides the prompt for the current account', () => {
    const ctx = createAdapter()
    ctx.anonymous.set('DVA-C02', [progress(11)])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    expect(controller.getState().view).toBe('anonymous-import')

    controller.dismissAnonymousImport()

    expect(controller.getState().view).toBe('ready')
    expect(ctx.adapter.anonymousProgress.hasDismissedImport('user-1')).toBe(true)
  })

  it('discardAccountSyncState clears account progress state and query cache', () => {
    const ctx = createAdapter()
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: null,
      scope: 'account',
    })

    controller.discardAccountSyncState()

    expect(ctx.adapter.accountProgress.clearScope).toHaveBeenCalledOnce()
    expect(ctx.adapter.questionProgress.removeAccountProgressQueries).toHaveBeenCalledOnce()
  })

  it('discardAccountSyncState clears failed sync state', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    const dirtyProgress = progress(20)
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push(new ProgressSyncControllerError('temporary'))
    vi.mocked(ctx.adapter.accountProgress.clearScope).mockImplementation(() => {
      ctx.dirty.clear()
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('DVA-C02')
    await vi.advanceTimersByTimeAsync(750)
    expect(controller.getState().status).toBe('failed')

    controller.discardAccountSyncState()

    expect(controller.getState().status).toBe('synced')
  })

  it('discardAccountSyncState clears in-flight sync state', async () => {
    const ctx = createAdapter()
    const dirtyProgress = progress(21)
    let resolveSync: (result: ProgressSyncResult) => void = () => {}
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [dirtyProgress])
    ctx.syncResponses.push(
      () =>
        new Promise<ProgressSyncResult>((resolve) => {
          resolveSync = resolve
        }),
    )
    vi.mocked(ctx.adapter.accountProgress.clearScope).mockImplementation(() => {
      ctx.dirty.clear()
    })
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    const syncPromise = controller.sync('manual')
    await flushPromises()
    expect(controller.getState().status).toBe('syncing')

    controller.discardAccountSyncState()

    expect(controller.getState().status).toBe('synced')

    resolveSync({
      cert: 'DVA-C02',
      revision: 3,
      accepted: [dirtyProgress],
      rejected: [],
      snapshotRequired: false,
    })
    await syncPromise
  })

  it('dispose cancels scheduled dirty sync and makes commands inert', async () => {
    vi.useFakeTimers()
    const ctx = createAdapter()
    ctx.baselines.set(ctx.baselineKey('user-1', 'DVA-C02'), {
      revision: 2,
      lastSyncedAt: 1_700_000_000_000,
    })
    ctx.dirty.set('DVA-C02', [progress(12)])
    const controller = createProgressSyncController(ctx.adapter, {
      authStatus: 'authenticated',
      userId: 'user-1',
      currentCert: 'DVA-C02',
      scope: 'account',
    })

    controller.enqueueDirtySync('DVA-C02')
    controller.dispose()
    await vi.advanceTimersByTimeAsync(750)

    expect(ctx.syncCalls).toEqual([])
    await expect(controller.sync('manual')).resolves.toEqual({ ok: false, reason: 'temporary' })
  })
})
