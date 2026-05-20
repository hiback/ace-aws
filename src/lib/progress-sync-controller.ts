import type { CertCode, ProgressScope, QuestionProgress } from '@/data/types'
import type { ProgressSnapshot, ProgressSyncResult } from '@/lib/account-progress-sync-client'
import type {
  AccountSyncBaseline,
  AnonymousImportSummary,
} from '@/repositories/local-progress-repository'

type GateState = 'syncing' | 'ready' | 'error'
type FlushCertResult = 'clean' | 'synced' | 'temporary-failure' | 'fatal-failure' | 'auth-signout'
type TimerId = ReturnType<typeof setTimeout>

export type AccountProgressSyncStatus = 'syncing' | 'failed' | 'dirty' | 'synced'
export type AccountProgressSyncResult = { ok: true } | { ok: false; reason: 'temporary' | 'fatal' }
export type AnonymousImportResult = AccountProgressSyncResult
export type ProgressSyncIntent = 'manual' | 'before-sign-out'
export type ProgressSyncNotice =
  | 'manual-success'
  | 'manual-failure'
  | 'partial'
  | 'temporary'
  | 'payload'
  | 'unknown-cert'
export type ProgressSyncControllerErrorKind = 'auth' | 'payload' | 'unknown-cert' | 'temporary'

export class ProgressSyncControllerError extends Error {
  constructor(readonly kind: ProgressSyncControllerErrorKind) {
    super('Progress sync controller operation failed')
    this.name = 'ProgressSyncControllerError'
  }
}

export interface ProgressSyncControllerInput {
  authStatus: 'authenticated' | 'unauthenticated' | 'loading'
  userId: string | null
  currentCert: CertCode | null
  scope: ProgressScope
}

export interface ProgressSyncControllerState {
  view: 'ready' | 'blocking' | 'anonymous-import' | 'hidden'
  gateState: GateState
  status: AccountProgressSyncStatus
  lastSyncedAt: number | null
  hasDirtyProgress: boolean
  isImporting: boolean
  anonymousImportAvailable: boolean
  anonymousImportSummary: AnonymousImportSummary
  globalImportFailed: boolean
  currentCert: CertCode | null
}

export interface ProgressSyncController {
  getState(): ProgressSyncControllerState
  subscribe(listener: (state: ProgressSyncControllerState) => void): () => void
  update(input: ProgressSyncControllerInput): void
  enqueueDirtySync(cert: CertCode): void
  retryGate(): void
  handleOnline(): void
  sync(intent: ProgressSyncIntent): Promise<AccountProgressSyncResult>
  importAnonymousProgress(): Promise<AnonymousImportResult>
  dismissAnonymousImport(): void
  discardAccountSyncState(): void
  dispose(): void
}

export interface ProgressSyncControllerAdapter {
  readyCerts: readonly CertCode[]
  accountProgress: {
    isOwner(userId: string): boolean
    clearScope(): void
    listDirty(cert: CertCode): QuestionProgress[]
    clearCert(userId: string, cert: CertCode): void
    replaceCertFromSnapshot(
      userId: string,
      cert: CertCode,
      revision: number,
      progress: QuestionProgress[],
    ): void
    refreshCertFromSnapshotKeepingDirty(
      userId: string,
      cert: CertCode,
      revision: number,
      progress: QuestionProgress[],
    ): void
    recoverCertFromSnapshotAfterSync(
      userId: string,
      cert: CertCode,
      revision: number,
      progress: QuestionProgress[],
      uploaded: QuestionProgress[],
    ): void
    applyAcceptedSync(
      userId: string,
      cert: CertCode,
      revision: number,
      accepted: QuestionProgress[],
      uploaded?: QuestionProgress[],
    ): void
    applyImportedSync(
      userId: string,
      cert: CertCode,
      revision: number,
      accepted: QuestionProgress[],
      uploaded?: QuestionProgress[],
    ): void
  }
  progressRevision: {
    getBaseline(userId: string, cert: CertCode): AccountSyncBaseline | null
    clearBaseline(userId: string, cert: CertCode): void
    markChecked(userId: string, cert: CertCode, revision: number): void
    getLastSyncedAt(userId: string): number | null
  }
  progressSync: {
    post(
      cert: CertCode,
      baseRevision: number,
      progress: QuestionProgress[],
    ): Promise<ProgressSyncResult>
  }
  progressSnapshot: {
    fetch(cert: CertCode): Promise<ProgressSnapshot>
  }
  questionProgress: {
    invalidateAccountProgress(): Promise<void>
    removeAccountProgressQueries(): void
  }
  anonymousProgress: {
    summarizeImport(): AnonymousImportSummary
    listImportProgress(cert: CertCode): QuestionProgress[]
    clearImportCert(cert: CertCode): void
    hasDismissedImport(userId: string): boolean
    dismissImport(userId: string): void
    clearImportDismissal(userId: string): void
  }
  auth: {
    storeExpiredLoginMessage(): void
    signOut(): void | Promise<void>
  }
  notices: {
    show(notice: ProgressSyncNotice): void
  }
}

const FIRST_BASELINE_BACKOFF_MS = 15_000
const MAX_BASELINE_BACKOFF_MS = 300_000
const DIRTY_SYNC_DEBOUNCE_MS = 750
const FIRST_DIRTY_RETRY_BACKOFF_MS = 5_000
const MAX_DIRTY_RETRY_BACKOFF_MS = 60_000

const EMPTY_INPUT: ProgressSyncControllerInput = {
  authStatus: 'loading',
  userId: null,
  currentCert: null,
  scope: 'anonymous',
}

const EMPTY_ANONYMOUS_IMPORT_SUMMARY: AnonymousImportSummary = {
  certs: [],
  certCount: 0,
  recordCount: 0,
}

function sameState(a: ProgressSyncControllerState, b: ProgressSyncControllerState): boolean {
  return (
    a.view === b.view &&
    a.gateState === b.gateState &&
    a.status === b.status &&
    a.lastSyncedAt === b.lastSyncedAt &&
    a.hasDirtyProgress === b.hasDirtyProgress &&
    a.isImporting === b.isImporting &&
    a.anonymousImportAvailable === b.anonymousImportAvailable &&
    a.globalImportFailed === b.globalImportFailed &&
    a.currentCert === b.currentCert &&
    a.anonymousImportSummary.certCount === b.anonymousImportSummary.certCount &&
    a.anonymousImportSummary.recordCount === b.anonymousImportSummary.recordCount &&
    a.anonymousImportSummary.certs.length === b.anonymousImportSummary.certs.length &&
    a.anonymousImportSummary.certs.every(
      (cert, index) => b.anonymousImportSummary.certs[index] === cert,
    )
  )
}

function isFatalControllerError(error: ProgressSyncControllerError): boolean {
  return error.kind === 'payload' || error.kind === 'unknown-cert'
}

function noticeForFatalError(error: ProgressSyncControllerError): ProgressSyncNotice {
  return error.kind === 'unknown-cert' ? 'unknown-cert' : 'payload'
}

class ProgressSyncControllerImpl implements ProgressSyncController {
  private input: ProgressSyncControllerInput = EMPTY_INPUT
  private state: ProgressSyncControllerState
  private readonly listeners = new Set<(state: ProgressSyncControllerState) => void>()
  private gateState: GateState = 'ready'
  private baselineAttempt = 0
  private baselineRunKey: string | null = null
  private baselineRetryTimer: TimerId | null = null
  private failureCount = 0
  private escapingSignOut = false
  private readonly conflictRecoveryCerts = new Set<CertCode>()
  private manualSyncing = false
  private isImporting = false
  private globalImportFailed = false
  private manualFailed = false
  private syncFailed = false
  private inFlightCount = 0
  private debounceTimer: TimerId | null = null
  private queue: Promise<void> = Promise.resolve()
  private readonly inFlightCerts = new Set<CertCode>()
  private readonly fatalCerts = new Set<CertCode>()
  private readonly dirtyFailureCounts = new Map<CertCode, number>()
  private readonly dirtyRetryTimers = new Map<CertCode, TimerId>()
  private readonly revisionCheckedCerts = new Set<string>()
  private readonly revisionCheckingCerts = new Set<string>()
  private recoveryOwner: string | null = null
  private disposed = false

  constructor(
    private readonly adapter: ProgressSyncControllerAdapter,
    initialInput: ProgressSyncControllerInput = EMPTY_INPUT,
  ) {
    this.state = this.computeState()
    this.applyInput(initialInput, false)
  }

  getState(): ProgressSyncControllerState {
    return this.state
  }

  subscribe(listener: (state: ProgressSyncControllerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(input: ProgressSyncControllerInput): void {
    this.applyInput(input, true)
  }

  enqueueDirtySync(cert: CertCode): void {
    if (this.disposed || this.input.authStatus !== 'authenticated' || this.input.userId === null) {
      return
    }
    this.clearDebounceTimer()
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.flushDirtyQueue(cert)
    }, DIRTY_SYNC_DEBOUNCE_MS)
    this.manualFailed = false
    this.syncFailed = false
    this.emitState()
  }

  retryGate(): void {
    if (this.disposed) return
    this.baselineAttempt += 1
    this.clearBaselineRetryTimer()
    this.baselineRunKey = null
    this.refreshGate(true)
  }

  handleOnline(): void {
    if (this.disposed) return
    const { authStatus, userId, currentCert } = this.input
    if (this.gateState === 'error' && (currentCert === null || !this.fatalCerts.has(currentCert))) {
      this.retryGate()
    }
    if (authStatus !== 'authenticated' || userId === null) return
    if (currentCert !== null && !this.fatalCerts.has(currentCert)) {
      this.enqueueRevisionCheck(currentCert)
    }
    this.flushDirtyQueue(currentCert ?? undefined)
  }

  async sync(intent: ProgressSyncIntent): Promise<AccountProgressSyncResult> {
    if (this.disposed) return { ok: false, reason: 'temporary' }
    if (this.input.authStatus !== 'authenticated' || this.input.userId === null) {
      return intent === 'before-sign-out' ? { ok: true } : { ok: false, reason: 'temporary' }
    }
    const accountUserId = this.input.userId
    this.clearPendingDirtySyncWaits()
    this.manualSyncing = true
    this.manualFailed = false
    this.emitState()
    try {
      const dirtyResult = await this.flushAllDirtyNow(accountUserId)
      if (!dirtyResult.ok) {
        this.manualFailed = true
        if (intent === 'manual') this.adapter.notices.show('manual-failure')
        this.emitState()
        return dirtyResult
      }
      if (intent === 'manual' && this.input.currentCert !== null) {
        const snapshot = await this.adapter.progressSnapshot.fetch(this.input.currentCert)
        if (!this.adapter.accountProgress.isOwner(accountUserId)) {
          return { ok: false, reason: 'temporary' }
        }
        this.adapter.accountProgress.refreshCertFromSnapshotKeepingDirty(
          accountUserId,
          snapshot.cert,
          snapshot.revision,
          snapshot.progress,
        )
        await this.adapter.questionProgress.invalidateAccountProgress()
      }
      this.syncFailed = false
      this.emitState()
      if (intent === 'manual') this.adapter.notices.show('manual-success')
      return { ok: true }
    } catch (error) {
      if (error instanceof ProgressSyncControllerError && error.kind === 'auth') {
        this.handleAuthExpired()
        return { ok: false, reason: 'fatal' }
      }
      this.manualFailed = true
      this.emitState()
      if (intent === 'manual') this.adapter.notices.show('manual-failure')
      return {
        ok: false,
        reason:
          error instanceof ProgressSyncControllerError && isFatalControllerError(error)
            ? 'fatal'
            : 'temporary',
      }
    } finally {
      this.manualSyncing = false
      this.emitState()
    }
  }

  async importAnonymousProgress(): Promise<AnonymousImportResult> {
    if (this.disposed || this.input.authStatus !== 'authenticated' || this.input.userId === null) {
      return { ok: false, reason: 'temporary' }
    }
    const accountUserId = this.input.userId
    this.clearPendingDirtySyncWaits()
    this.isImporting = true
    this.globalImportFailed = false
    this.emitState()
    try {
      await this.queue.catch(() => {})
      if (!this.isCurrentAccount(accountUserId)) return { ok: false, reason: 'temporary' }
      let failed = false
      for (const cert of this.adapter.anonymousProgress.summarizeImport().certs) {
        const dirtyResult = await this.flushCert(accountUserId, cert, {
          scheduleRetry: false,
          showTemporaryNotice: false,
        })
        if (!this.isCurrentAccount(accountUserId)) return { ok: false, reason: 'temporary' }
        if (dirtyResult !== 'clean' && dirtyResult !== 'synced') {
          failed = true
          continue
        }

        const records = this.adapter.anonymousProgress.listImportProgress(cert)
        if (records.length === 0) continue
        try {
          const baseline = this.adapter.progressRevision.getBaseline(accountUserId, cert)
          const result = await this.adapter.progressSync.post(
            cert,
            baseline?.revision ?? 0,
            records,
          )
          if (!this.isCurrentAccount(accountUserId)) return { ok: false, reason: 'temporary' }
          const revisionConflict = result.errorCode === 'revision_conflict'
          if (revisionConflict || result.rejected.length > 0) failed = true
          if (result.snapshotRequired) {
            const snapshot = await this.adapter.progressSnapshot.fetch(cert)
            if (!this.isCurrentAccount(accountUserId)) return { ok: false, reason: 'temporary' }
            this.adapter.accountProgress.recoverCertFromSnapshotAfterSync(
              accountUserId,
              snapshot.cert,
              snapshot.revision,
              snapshot.progress,
              records,
            )
          } else if (result.rejected.length === 0) {
            this.adapter.accountProgress.applyImportedSync(
              accountUserId,
              cert,
              result.revision,
              result.accepted,
              records,
            )
          }
          if (!revisionConflict && result.rejected.length === 0) {
            this.adapter.anonymousProgress.clearImportCert(cert)
          }
          await this.adapter.questionProgress.invalidateAccountProgress()
        } catch (error) {
          if (error instanceof ProgressSyncControllerError && error.kind === 'auth') {
            if (!this.isCurrentAccount(accountUserId)) return { ok: false, reason: 'temporary' }
            this.handleAuthExpired()
            return { ok: false, reason: 'fatal' }
          }
          failed = true
        }
      }
      if (!failed) this.adapter.anonymousProgress.clearImportDismissal(accountUserId)
      const result: AnonymousImportResult = failed
        ? { ok: false, reason: 'temporary' }
        : { ok: true }
      this.globalImportFailed = !result.ok
      this.emitState()
      return result
    } finally {
      this.isImporting = false
      this.emitState()
    }
  }

  dismissAnonymousImport(): void {
    if (this.input.userId === null) return
    this.adapter.anonymousProgress.dismissImport(this.input.userId)
    this.globalImportFailed = false
    this.emitState()
  }

  discardAccountSyncState(): void {
    this.clearPendingDirtySyncWaits()
    this.adapter.accountProgress.clearScope()
    this.adapter.questionProgress.removeAccountProgressQueries()
    this.emitState()
  }

  dispose(): void {
    this.disposed = true
    this.clearPendingDirtySyncWaits()
    this.clearBaselineRetryTimer()
    this.listeners.clear()
  }

  private applyInput(input: ProgressSyncControllerInput, runEffects: boolean): void {
    if (this.disposed) return
    this.input = input
    if (this.recoveryOwner !== input.userId) {
      this.recoveryOwner = input.userId
      this.fatalCerts.clear()
      this.conflictRecoveryCerts.clear()
      this.dirtyFailureCounts.clear()
      for (const timer of this.dirtyRetryTimers.values()) clearTimeout(timer)
      this.dirtyRetryTimers.clear()
    }
    this.refreshGate(runEffects)
  }

  private refreshGate(runEffects: boolean): void {
    const { authStatus, userId, currentCert } = this.input
    if (authStatus !== 'authenticated' || userId === null || currentCert === null) {
      this.escapingSignOut = false
      this.setGateState('ready')
      this.baselineRunKey = null
      this.clearBaselineRetryTimer()
      this.emitState()
      return
    }

    if (this.escapingSignOut) {
      this.emitState()
      return
    }

    if (this.adapter.progressRevision.getBaseline(userId, currentCert)) {
      this.setGateState('ready')
      this.baselineRunKey = null
      this.clearBaselineRetryTimer()
      this.emitState()
      if (runEffects) this.enqueueRevisionCheck(currentCert)
      return
    }

    this.setGateState('syncing')
    this.emitState()
    if (!runEffects) return
    const runKey = `${userId}:${currentCert}:${this.baselineAttempt}`
    if (this.baselineRunKey === runKey) return
    this.baselineRunKey = runKey
    void this.syncBaseline(userId, currentCert, runKey)
  }

  private computeState(): ProgressSyncControllerState {
    const { authStatus, userId, currentCert, scope } = this.input
    const hasCurrentAccountCert =
      authStatus === 'authenticated' && userId !== null && currentCert !== null
    const needsBaselineSync =
      hasCurrentAccountCert && !this.adapter.progressRevision.getBaseline(userId, currentCert)
    const waitsForAccountScope = hasCurrentAccountCert && scope !== 'account'
    const currentCertInConflictRecovery =
      currentCert !== null && this.conflictRecoveryCerts.has(currentCert)
    const hasDirtyProgress =
      authStatus === 'authenticated' &&
      userId !== null &&
      this.adapter.readyCerts.some(
        (cert) => this.adapter.accountProgress.listDirty(cert).length > 0,
      )
    const lastSyncedAt =
      authStatus === 'authenticated' && userId !== null
        ? this.adapter.progressRevision.getLastSyncedAt(userId)
        : null
    const rawAnonymousImportSummary =
      authStatus === 'authenticated' && userId !== null
        ? this.adapter.anonymousProgress.summarizeImport()
        : EMPTY_ANONYMOUS_IMPORT_SUMMARY
    const anonymousImportSummary =
      authStatus === 'authenticated' &&
      userId !== null &&
      !this.adapter.anonymousProgress.hasDismissedImport(userId)
        ? rawAnonymousImportSummary
        : EMPTY_ANONYMOUS_IMPORT_SUMMARY
    const anonymousImportAvailable =
      authStatus === 'authenticated' && userId !== null && rawAnonymousImportSummary.certCount > 0
    const shouldPromptAnonymousImport =
      authStatus === 'authenticated' &&
      userId !== null &&
      anonymousImportSummary.certCount > 0 &&
      !needsBaselineSync &&
      !waitsForAccountScope &&
      !currentCertInConflictRecovery &&
      this.gateState === 'ready'
    const status: AccountProgressSyncStatus =
      this.gateState === 'syncing' || this.manualSyncing || this.inFlightCount > 0
        ? 'syncing'
        : this.gateState === 'error' || this.manualFailed || this.syncFailed
          ? 'failed'
          : hasDirtyProgress
            ? 'dirty'
            : 'synced'
    const view = this.escapingSignOut
      ? 'hidden'
      : shouldPromptAnonymousImport
        ? 'anonymous-import'
        : !needsBaselineSync &&
            !waitsForAccountScope &&
            !currentCertInConflictRecovery &&
            this.gateState === 'ready'
          ? 'ready'
          : 'blocking'

    return {
      view,
      gateState: this.gateState,
      status,
      lastSyncedAt,
      hasDirtyProgress,
      isImporting: this.isImporting,
      anonymousImportAvailable,
      anonymousImportSummary,
      globalImportFailed: this.globalImportFailed,
      currentCert,
    }
  }

  private emitState(): void {
    const next = this.computeState()
    if (sameState(this.state, next)) return
    this.state = next
    for (const listener of this.listeners) listener(next)
  }

  private setGateState(state: GateState): void {
    this.gateState = state
    if (state === 'ready') this.failureCount = 0
  }

  private revisionCheckedKey(userId: string, cert: CertCode): string {
    return `${userId}:${cert}`
  }

  private isCurrentAccount(accountUserId: string): boolean {
    return (
      this.input.userId === accountUserId && this.adapter.accountProgress.isOwner(accountUserId)
    )
  }

  private orderedReadyCerts(priorityCert?: CertCode): CertCode[] {
    const currentCert = this.input.currentCert
    return [
      ...(currentCert ? [currentCert] : []),
      ...(priorityCert && priorityCert !== currentCert ? [priorityCert] : []),
      ...this.adapter.readyCerts.filter((cert) => cert !== priorityCert && cert !== currentCert),
    ]
  }

  private orderedReadyCertsForManualSync(): CertCode[] {
    const currentCert = this.input.currentCert
    return [
      ...(currentCert ? [currentCert] : []),
      ...this.adapter.readyCerts.filter((cert) => cert !== currentCert),
    ]
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer === null) return
    clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  private clearPendingDirtySyncWaits(): void {
    this.clearDebounceTimer()
    for (const timer of this.dirtyRetryTimers.values()) clearTimeout(timer)
    this.dirtyRetryTimers.clear()
  }

  private clearBaselineRetryTimer(): void {
    if (this.baselineRetryTimer === null) return
    clearTimeout(this.baselineRetryTimer)
    this.baselineRetryTimer = null
  }

  private scheduleBaselineRetry(): void {
    const currentCert = this.input.currentCert
    if (currentCert !== null && this.fatalCerts.has(currentCert)) return
    this.clearBaselineRetryTimer()
    const backoffMs = Math.min(
      FIRST_BASELINE_BACKOFF_MS * 2 ** Math.max(0, this.failureCount - 1),
      MAX_BASELINE_BACKOFF_MS,
    )
    this.baselineRetryTimer = setTimeout(() => {
      this.baselineRetryTimer = null
      this.retryGate()
    }, backoffMs)
  }

  private markBaselineError(options: { fatal?: boolean } = {}): void {
    this.failureCount += 1
    this.setGateState('error')
    this.baselineRunKey = null
    this.emitState()
    if (!options.fatal) this.scheduleBaselineRetry()
  }

  private handleAuthExpired(): void {
    this.adapter.auth.storeExpiredLoginMessage()
    this.adapter.accountProgress.clearScope()
    this.adapter.questionProgress.removeAccountProgressQueries()
    this.escapingSignOut = true
    this.emitState()
    void this.adapter.auth.signOut()
  }

  private async syncBaseline(accountUserId: string, cert: CertCode, runKey: string): Promise<void> {
    try {
      const dirty = this.adapter.accountProgress.listDirty(cert)
      if (dirty.length > 0) {
        const result = await this.adapter.progressSync.post(cert, 0, dirty)
        if (!this.isActiveBaselineRun(runKey, accountUserId, cert)) return
        if (!this.isCurrentAccount(accountUserId)) {
          this.markBaselineError()
          return
        }
        if (result.errorCode === 'revision_conflict') {
          this.adapter.accountProgress.clearCert(accountUserId, cert)
          const snapshot = await this.adapter.progressSnapshot.fetch(cert)
          if (!this.isActiveBaselineRun(runKey, accountUserId, cert)) return
          if (!this.isCurrentAccount(accountUserId)) return
          this.adapter.accountProgress.replaceCertFromSnapshot(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
          )
        } else if (result.snapshotRequired || result.rejected.length > 0) {
          this.adapter.progressRevision.clearBaseline(accountUserId, cert)
          const snapshot = await this.adapter.progressSnapshot.fetch(cert)
          if (!this.isActiveBaselineRun(runKey, accountUserId, cert)) return
          if (!this.isCurrentAccount(accountUserId)) return
          this.adapter.accountProgress.refreshCertFromSnapshotKeepingDirty(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
          )
        } else {
          this.adapter.accountProgress.applyAcceptedSync(
            accountUserId,
            cert,
            result.revision,
            result.accepted,
            dirty,
          )
        }
        await this.adapter.questionProgress.invalidateAccountProgress()
        this.syncFailed = false
        this.setGateState('ready')
        this.baselineRunKey = null
        this.clearBaselineRetryTimer()
        this.emitState()
        this.enqueueRevisionCheck(cert)
        return
      }

      const snapshot = await this.adapter.progressSnapshot.fetch(cert)
      if (!this.isActiveBaselineRun(runKey, accountUserId, cert)) return
      if (!this.isCurrentAccount(accountUserId)) {
        this.markBaselineError()
        return
      }
      this.adapter.accountProgress.replaceCertFromSnapshot(
        accountUserId,
        snapshot.cert,
        snapshot.revision,
        snapshot.progress,
      )
      await this.adapter.questionProgress.invalidateAccountProgress()
      this.setGateState('ready')
      this.baselineRunKey = null
      this.clearBaselineRetryTimer()
      this.emitState()
      this.enqueueRevisionCheck(cert)
    } catch (error) {
      if (!this.isActiveBaselineRun(runKey, accountUserId, cert)) return
      if (error instanceof ProgressSyncControllerError && error.kind === 'auth') {
        this.handleAuthExpired()
        return
      }
      if (error instanceof ProgressSyncControllerError && isFatalControllerError(error)) {
        this.fatalCerts.add(cert)
        this.adapter.notices.show(noticeForFatalError(error))
        this.markBaselineError({ fatal: true })
        return
      }
      this.markBaselineError()
    }
  }

  private isActiveBaselineRun(runKey: string, accountUserId: string, cert: CertCode): boolean {
    return (
      !this.disposed &&
      this.baselineRunKey === runKey &&
      this.input.userId === accountUserId &&
      this.input.currentCert === cert
    )
  }

  private flushDirtyQueue(priorityCert?: CertCode): void {
    if (this.input.authStatus !== 'authenticated' || this.input.userId === null) return
    const accountUserId = this.input.userId
    const orderedCerts = this.orderedReadyCerts(priorityCert)
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        for (const cert of orderedCerts) {
          if (!this.isCurrentAccount(accountUserId)) break
          try {
            await this.flushCert(accountUserId, cert)
          } catch {
            if (cert === this.input.currentCert) this.markBaselineError()
          }
        }
      })
  }

  private async flushCert(
    accountUserId: string,
    cert: CertCode,
    options: { scheduleRetry?: boolean; showTemporaryNotice?: boolean } = {},
  ): Promise<FlushCertResult> {
    const scheduleRetry = options.scheduleRetry ?? true
    const showTemporaryNotice = options.showTemporaryNotice ?? true
    if (this.inFlightCerts.has(cert)) return 'clean'
    if (!this.isCurrentAccount(accountUserId)) return 'clean'
    if (this.fatalCerts.has(cert)) return 'fatal-failure'
    const dirty = this.adapter.accountProgress.listDirty(cert)
    if (dirty.length === 0) return 'clean'
    this.inFlightCerts.add(cert)
    this.inFlightCount += 1
    this.emitState()
    try {
      const baseline = this.adapter.progressRevision.getBaseline(accountUserId, cert)
      const result = await this.adapter.progressSync.post(cert, baseline?.revision ?? 0, dirty)
      if (!this.isCurrentAccount(accountUserId)) return 'clean'
      this.dirtyFailureCounts.delete(cert)
      if (result.errorCode === 'revision_conflict') {
        this.conflictRecoveryCerts.add(cert)
        if (cert === this.input.currentCert) this.setGateState('syncing')
        this.emitState()
        this.adapter.accountProgress.clearCert(accountUserId, cert)
        let snapshot: ProgressSnapshot
        try {
          snapshot = await this.adapter.progressSnapshot.fetch(cert)
        } catch (error) {
          this.conflictRecoveryCerts.delete(cert)
          if (error instanceof ProgressSyncControllerError && error.kind === 'auth') throw error
          if (cert === this.input.currentCert) this.markBaselineError()
          this.syncFailed = true
          this.emitState()
          return 'temporary-failure'
        }
        if (!this.isCurrentAccount(accountUserId)) {
          this.conflictRecoveryCerts.delete(cert)
          return 'clean'
        }
        this.adapter.accountProgress.replaceCertFromSnapshot(
          accountUserId,
          snapshot.cert,
          snapshot.revision,
          snapshot.progress,
        )
        this.conflictRecoveryCerts.delete(cert)
        if (cert === this.input.currentCert) this.setGateState('ready')
      } else if (result.snapshotRequired || result.rejected.length > 0) {
        if (result.rejected.length > 0) this.adapter.notices.show('partial')
        this.adapter.progressRevision.clearBaseline(accountUserId, cert)
        const snapshot = await this.adapter.progressSnapshot.fetch(cert)
        if (!this.isCurrentAccount(accountUserId)) return 'clean'
        if (baseline === null) {
          this.adapter.accountProgress.refreshCertFromSnapshotKeepingDirty(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
          )
        } else {
          this.adapter.accountProgress.recoverCertFromSnapshotAfterSync(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
            dirty,
          )
        }
      } else {
        this.adapter.accountProgress.applyAcceptedSync(
          accountUserId,
          cert,
          result.revision,
          result.accepted,
          dirty,
        )
      }
      await this.adapter.questionProgress.invalidateAccountProgress()
      this.manualFailed = false
      this.syncFailed = false
      this.emitState()
      return 'synced'
    } catch (error) {
      if (!this.isCurrentAccount(accountUserId)) return 'clean'
      if (error instanceof ProgressSyncControllerError) {
        if (error.kind === 'auth') {
          this.handleAuthExpired()
          return 'auth-signout'
        }
        if (error.kind === 'temporary') {
          const failures = (this.dirtyFailureCounts.get(cert) ?? 0) + 1
          this.dirtyFailureCounts.set(cert, failures)
          const backoffMs = Math.min(
            FIRST_DIRTY_RETRY_BACKOFF_MS * 2 ** Math.max(0, failures - 1),
            MAX_DIRTY_RETRY_BACKOFF_MS,
          )
          if (scheduleRetry && !this.dirtyRetryTimers.has(cert)) {
            const timer = setTimeout(() => {
              this.dirtyRetryTimers.delete(cert)
              this.flushDirtyQueue(cert)
            }, backoffMs)
            this.dirtyRetryTimers.set(cert, timer)
          }
          if (showTemporaryNotice) this.adapter.notices.show('temporary')
          if (
            cert === this.input.currentCert &&
            !this.adapter.progressRevision.getBaseline(accountUserId, cert)
          ) {
            this.markBaselineError()
          }
          this.syncFailed = true
          this.emitState()
          return 'temporary-failure'
        }
        if (isFatalControllerError(error)) {
          this.fatalCerts.add(cert)
          if (showTemporaryNotice) this.adapter.notices.show(noticeForFatalError(error))
          this.syncFailed = true
          this.emitState()
          return 'fatal-failure'
        }
      }
      if (cert === this.input.currentCert) this.markBaselineError()
      this.syncFailed = true
      this.emitState()
      return 'temporary-failure'
    } finally {
      this.inFlightCerts.delete(cert)
      this.inFlightCount = Math.max(0, this.inFlightCount - 1)
      this.emitState()
    }
  }

  private async flushAllDirtyNow(accountUserId: string): Promise<AccountProgressSyncResult> {
    await this.queue.catch(() => {})
    for (const cert of this.orderedReadyCertsForManualSync()) {
      const result = await this.flushCert(accountUserId, cert, {
        scheduleRetry: false,
        showTemporaryNotice: false,
      })
      if (result === 'temporary-failure') return { ok: false, reason: 'temporary' }
      if (result === 'fatal-failure' || result === 'auth-signout')
        return { ok: false, reason: 'fatal' }
    }
    return { ok: true }
  }

  private async flushOtherReadyCerts(accountUserId: string, currentCert: CertCode): Promise<void> {
    for (const cert of this.adapter.readyCerts.filter((entry) => entry !== currentCert)) {
      if (!this.isCurrentAccount(accountUserId)) break
      await this.flushCert(accountUserId, cert)
    }
  }

  private enqueueRevisionCheck(cert: CertCode): void {
    const { authStatus, userId } = this.input
    if (authStatus !== 'authenticated' || userId === null || this.gateState !== 'ready') return
    if (this.fatalCerts.has(cert)) return
    const checkedKey = this.revisionCheckedKey(userId, cert)
    if (this.revisionCheckedCerts.has(checkedKey)) return
    if (this.revisionCheckingCerts.has(checkedKey)) return
    const baseline = this.adapter.progressRevision.getBaseline(userId, cert)
    if (baseline === null) return
    this.revisionCheckingCerts.add(checkedKey)

    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        try {
          if (this.revisionCheckedCerts.has(checkedKey)) return
          if (!this.isCurrentAccount(userId)) return
          const currentBaseline = this.adapter.progressRevision.getBaseline(userId, cert)
          if (currentBaseline === null) return

          const dirty = this.adapter.accountProgress.listDirty(cert)
          if (dirty.length > 0) {
            const result = await this.flushCert(userId, cert)
            if (
              result === 'synced' ||
              (result === 'clean' && this.adapter.accountProgress.listDirty(cert).length === 0)
            ) {
              this.revisionCheckedCerts.add(checkedKey)
            }
            if (result === 'synced' || result === 'clean') {
              await this.flushOtherReadyCerts(userId, cert)
            }
            return
          }

          this.inFlightCount += 1
          this.emitState()
          try {
            const result = await this.adapter.progressSync.post(cert, currentBaseline.revision, [])
            if (!this.isCurrentAccount(userId)) return
            if (
              result.errorCode === 'revision_conflict' ||
              result.snapshotRequired ||
              result.rejected.length > 0
            ) {
              const snapshot = await this.adapter.progressSnapshot.fetch(cert)
              if (!this.isCurrentAccount(userId)) return
              this.adapter.accountProgress.refreshCertFromSnapshotKeepingDirty(
                userId,
                snapshot.cert,
                snapshot.revision,
                snapshot.progress,
              )
            } else {
              this.adapter.progressRevision.markChecked(userId, cert, currentBaseline.revision)
            }
            this.revisionCheckedCerts.add(checkedKey)
            await this.adapter.questionProgress.invalidateAccountProgress()
            this.manualFailed = false
            this.syncFailed = false
            this.emitState()
            await this.flushOtherReadyCerts(userId, cert)
          } catch (error) {
            if (!this.isCurrentAccount(userId)) return
            if (error instanceof ProgressSyncControllerError && error.kind === 'auth') {
              this.handleAuthExpired()
              return
            }
            if (error instanceof ProgressSyncControllerError && isFatalControllerError(error)) {
              this.fatalCerts.add(cert)
              this.adapter.notices.show(noticeForFatalError(error))
              this.syncFailed = true
              this.emitState()
              return
            }
            this.syncFailed = true
            this.emitState()
          } finally {
            this.inFlightCount = Math.max(0, this.inFlightCount - 1)
            this.emitState()
          }
        } finally {
          this.revisionCheckingCerts.delete(checkedKey)
        }
      })
  }
}

export function createProgressSyncController(
  adapter: ProgressSyncControllerAdapter,
  initialInput: ProgressSyncControllerInput = EMPTY_INPUT,
): ProgressSyncController {
  return new ProgressSyncControllerImpl(adapter, initialInput)
}
