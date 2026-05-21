import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CertCode, QuestionProgress } from '../src/data/types'
import type { ProgressSyncResult } from '../src/lib/account-progress-sync-client'
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

function createAdapter() {
  const baselines = new Map<string, { revision: number; lastSyncedAt: number }>()
  const dirty = new Map<CertCode, QuestionProgress[]>()
  const accountProgress = new Map<CertCode, QuestionProgress[]>()
  const dismissedImports = new Set<string>()
  const anonymous = new Map<CertCode, QuestionProgress[]>()
  const owner = { userId: 'user-1' }
  const syncResponses: Array<
    | ProgressSyncResult
    | Error
    | ((cert: CertCode, baseRevision: number, records: QuestionProgress[]) => ProgressSyncResult)
  > = []
  const snapshotErrors: Error[] = []
  const snapshotResponses = new Map<CertCode, QuestionProgress[]>()
  const notices: ProgressSyncNotice[] = []
  const syncCalls: Array<{ cert: CertCode; baseRevision: number; progress: QuestionProgress[] }> =
    []
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
    readyCerts: ['DVA-C02', 'CLF-C02'],
    accountProgress: {
      isOwner: (userId) => owner.userId === userId,
      clearScope: vi.fn(),
      listDirty: (cert) => dirty.get(cert) ?? [],
      clearCert: (userId, cert) => {
        accountProgress.delete(cert)
        baselines.delete(baselineKey(userId, cert))
      },
      replaceCertFromSnapshot: (userId, cert, revision, records) => {
        accountProgress.set(cert, records)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
        dirty.delete(cert)
      },
      refreshCertFromSnapshotKeepingDirty: (userId, cert, revision, records) => {
        keepingDirtySnapshotCalls.push({
          userId,
          cert,
          revision,
          progress: records,
        })
        accountProgress.set(cert, records)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
      recoverCertFromSnapshotAfterSync: (userId, cert, revision, records, uploaded) => {
        afterSyncSnapshotCalls.push({
          userId,
          cert,
          revision,
          progress: records,
          uploaded,
        })
        accountProgress.set(cert, records)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
      applyAcceptedSync: (userId, cert, revision, accepted) => {
        accountProgress.set(cert, accepted)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
        dirty.delete(cert)
      },
      applyImportedSync: (userId, cert, revision, accepted) => {
        accountProgress.set(cert, accepted)
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
    },
    progressRevision: {
      getBaseline: (userId, cert) => baselines.get(baselineKey(userId, cert)) ?? null,
      clearBaseline: (userId, cert) => baselines.delete(baselineKey(userId, cert)),
      markChecked: (userId, cert, revision) => {
        baselines.set(baselineKey(userId, cert), { revision, lastSyncedAt: Date.now() })
      },
      getLastSyncedAt: (userId) => {
        const values = Array.from(baselines.entries())
          .filter(([key]) => key.startsWith(`${userId}:`))
          .map(([, baseline]) => baseline.lastSyncedAt)
        return values.length === 0 ? null : Math.max(...values)
      },
    },
    progressSync: {
      post: async (cert, baseRevision, records) => {
        syncCalls.push({ cert, baseRevision, progress: records })
        const next = syncResponses.shift()
        if (next instanceof Error) throw next
        if (typeof next === 'function') return next(cert, baseRevision, records)
        if (next) return next
        return {
          cert,
          revision: baseRevision + 1,
          accepted: records,
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
        return { cert, revision: 10, progress: snapshotResponses.get(cert) ?? [progress(99)] }
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
        const certs = Array.from(anonymous.entries())
          .filter(([, records]) => records.length > 0)
          .map(([cert]) => cert)
        const recordCount = certs.reduce(
          (total, cert) => total + (anonymous.get(cert)?.length ?? 0),
          0,
        )
        return { certs, certCount: certs.length, recordCount }
      },
      listImportProgress: (cert) => anonymous.get(cert) ?? [],
      clearImportCert: (cert) => anonymous.delete(cert),
      hasDismissedImport: (userId) => dismissedImports.has(userId),
      dismissImport: (userId) => {
        dismissedImports.add(userId)
      },
      clearImportDismissal: (userId) => {
        dismissedImports.delete(userId)
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
    accountProgress,
    anonymous,
    syncResponses,
    snapshotErrors,
    snapshotResponses,
    owner,
    notices,
    syncCalls,
    snapshotCalls,
    invalidations,
    keepingDirtySnapshotCalls,
    afterSyncSnapshotCalls,
    baselineKey,
  }
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

  it('blocks on missing baseline until the current progress snapshot is installed', async () => {
    const ctx = createAdapter()
    ctx.snapshotResponses.set('DVA-C02', [progress(3)])
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
