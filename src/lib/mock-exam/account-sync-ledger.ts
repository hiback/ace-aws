import type { CertCode } from '@/data/types'
import { READY_CERTS } from '@/lib/cert-catalog'
import {
  clearLocalMockExamImportCert,
  getLocalMockExamDraft,
  getLocalMockExamHistory,
} from './local-repository'
import type { MockExamAttempt } from './start-attempt'
import type { SubmittedMockExamAttempt } from './submission'

const ACCOUNT_MOCK_EXAM_SYNC_KEY = 'ace-aws/mock-exam/account-sync/v1'
const ACCOUNT_OWNER_KEY = 'ace-aws/account-owner/v1'
const FALLBACK_ACCOUNT_OWNER = '__local__'

type OwnerMockExamSyncState = {
  revisions: Partial<Record<CertCode, number>>
  drafts: Partial<Record<CertCode, MockExamAttempt>>
  draftMutationIds?: Partial<Record<CertCode, number>>
  submittedAttempts?: Partial<Record<CertCode, Record<string, SubmittedMockExamAttempt>>>
  dirtyDrafts?: Partial<Record<CertCode, boolean>>
  dirtySubmittedAttempts?: Partial<Record<CertCode, string[]>>
}

type AccountMockExamSyncState = {
  byUser: Record<string, OwnerMockExamSyncState>
}

export type MockExamImportResult = { ok: true } | { ok: false; reason: 'temporary' }

export type MockExamImportSummary = {
  certs: CertCode[]
  certCount: number
  recordCount: number
}

export type AccountMockExamImportAdapter = {
  syncHistory(cert: CertCode, history: SubmittedMockExamAttempt[]): Promise<void>
  fetchAccountDraft(cert: CertCode): Promise<MockExamAttempt | null>
  syncDraft(draft: MockExamAttempt): Promise<void>
}

export type AccountMockExamDirtySyncAdapter = {
  syncDraft(
    cert: CertCode,
    draft: MockExamAttempt | null,
    mutationId: number,
  ): Promise<boolean | undefined>
  syncHistory(cert: CertCode, history: SubmittedMockExamAttempt[]): Promise<boolean | undefined>
}

export interface AccountMockExamSyncLedger {
  readDraft(cert: CertCode): MockExamAttempt | null
  writeDraft(draft: MockExamAttempt): void
  setDraftSnapshot(cert: CertCode, draft: MockExamAttempt | null): void
  applyDraftSyncSnapshotForRequest(
    cert: CertCode,
    expectedDraft: MockExamAttempt | null,
    expectedMutationId: number,
    draft: MockExamAttempt | null,
  ): boolean
  isDraftSyncRequestCurrent(
    cert: CertCode,
    expectedDraft: MockExamAttempt | null,
    expectedMutationId: number,
  ): boolean
  clearDraft(cert: CertCode): void
  isDraftDirty(cert: CertCode): boolean
  getDraftMutationId(cert: CertCode): number
  settleDraft(cert: CertCode): void
  readHistory(cert: CertCode): SubmittedMockExamAttempt[]
  appendSubmittedAttempt(attempt: SubmittedMockExamAttempt): void
  setHistorySnapshot(cert: CertCode, attempts: SubmittedMockExamAttempt[]): void
  applyHistorySnapshot(cert: CertCode, revision: number, attempts: SubmittedMockExamAttempt[]): void
  listDirtySubmittedAttemptIds(cert: CertCode): string[]
  settleSubmittedAttempts(cert: CertCode, attemptIds: string[]): void
  hasDirty(cert: CertCode): boolean
  getRevision(cert: CertCode): number
  setRevision(cert: CertCode, revision: number): void
  clearCurrentOwner(): void
  clearOwner(ownerId: string): void
  summarizeAnonymousImport(): MockExamImportSummary
  importAnonymousCert(
    cert: CertCode,
    adapter: AccountMockExamImportAdapter,
  ): Promise<MockExamImportResult>
  syncDirty(cert: CertCode, adapter: AccountMockExamDirtySyncAdapter): Promise<MockExamImportResult>
}

const ledger: AccountMockExamSyncLedger = {
  readDraft(cert) {
    return readOwnerState().drafts[cert] ?? null
  },
  writeDraft(draft) {
    updateOwnerState((ownerState) => {
      ownerState.drafts[draft.cert] = draft
      incrementDraftMutationId(ownerState, draft.cert)
      ownerState.dirtyDrafts ??= {}
      ownerState.dirtyDrafts[draft.cert] = true
    })
  },
  setDraftSnapshot(cert, draft) {
    updateOwnerState((ownerState) => {
      if (ownerState.dirtyDrafts?.[cert] === true) return
      if (draft === null) delete ownerState.drafts[cert]
      else ownerState.drafts[cert] = draft
    })
  },
  applyDraftSyncSnapshotForRequest(cert, expectedDraft, expectedMutationId, draft) {
    let applied = false
    updateOwnerState((ownerState) => {
      if (
        currentDraftMutationId(ownerState, cert) !== expectedMutationId ||
        !sameDraftPayload(ownerState.drafts[cert] ?? null, expectedDraft)
      ) {
        return
      }
      if (draft === null) delete ownerState.drafts[cert]
      else ownerState.drafts[cert] = draft
      applied = true
    })
    return applied
  },
  isDraftSyncRequestCurrent(cert, expectedDraft, expectedMutationId) {
    const ownerState = readOwnerState()
    return (
      currentDraftMutationId(ownerState, cert) === expectedMutationId &&
      sameDraftPayload(ownerState.drafts[cert] ?? null, expectedDraft)
    )
  },
  clearDraft(cert) {
    updateOwnerState((ownerState) => {
      delete ownerState.drafts[cert]
      incrementDraftMutationId(ownerState, cert)
      ownerState.dirtyDrafts ??= {}
      ownerState.dirtyDrafts[cert] = true
    })
  },
  isDraftDirty(cert) {
    return readOwnerState().dirtyDrafts?.[cert] === true
  },
  getDraftMutationId(cert) {
    return currentDraftMutationId(readOwnerState(), cert)
  },
  settleDraft(cert) {
    updateOwnerState((ownerState) => {
      delete ownerState.dirtyDrafts?.[cert]
    })
  },
  readHistory(cert) {
    const bucket = readOwnerState().submittedAttempts?.[cert]
    if (!bucket || !isSubmittedAttemptBucket(bucket)) return []
    return sortHistory(Object.values(bucket))
  },
  appendSubmittedAttempt(attempt) {
    updateOwnerState((ownerState) => {
      ownerState.submittedAttempts ??= {}
      const certAttempts = ownerState.submittedAttempts[attempt.cert] ?? {}
      certAttempts[attempt.id] = attempt
      ownerState.submittedAttempts[attempt.cert] = certAttempts
      ownerState.dirtySubmittedAttempts ??= {}
      const dirtyIds = new Set(ownerState.dirtySubmittedAttempts[attempt.cert] ?? [])
      dirtyIds.add(attempt.id)
      ownerState.dirtySubmittedAttempts[attempt.cert] = Array.from(dirtyIds).sort()
    })
  },
  setHistorySnapshot(cert, attempts) {
    updateOwnerState((ownerState) => {
      ownerState.submittedAttempts ??= {}
      const existingBucket = ownerState.submittedAttempts[cert] ?? {}
      const dirtyIds = new Set(ownerState.dirtySubmittedAttempts?.[cert] ?? [])
      const nextBucket: Record<string, SubmittedMockExamAttempt> = {}
      for (const attempt of attempts) {
        if (attempt.cert === cert) nextBucket[attempt.id] = attempt
      }
      for (const dirtyId of dirtyIds) {
        const dirtyAttempt = existingBucket[dirtyId]
        if (dirtyAttempt?.cert === cert) nextBucket[dirtyId] = dirtyAttempt
      }
      if (Object.keys(nextBucket).length > 0) ownerState.submittedAttempts[cert] = nextBucket
      else delete ownerState.submittedAttempts[cert]
    })
  },
  applyHistorySnapshot(cert, revision, attempts) {
    if (revision < ledger.getRevision(cert)) return
    ledger.setRevision(cert, revision)
    ledger.setHistorySnapshot(cert, attempts)
  },
  listDirtySubmittedAttemptIds(cert) {
    return [...(readOwnerState().dirtySubmittedAttempts?.[cert] ?? [])].sort()
  },
  settleSubmittedAttempts(cert, attemptIds) {
    updateOwnerState((ownerState) => {
      const settled = new Set(attemptIds)
      const remaining = (ownerState.dirtySubmittedAttempts?.[cert] ?? []).filter(
        (attemptId) => !settled.has(attemptId),
      )
      if (remaining.length > 0) {
        ownerState.dirtySubmittedAttempts ??= {}
        ownerState.dirtySubmittedAttempts[cert] = remaining
      } else {
        delete ownerState.dirtySubmittedAttempts?.[cert]
      }
    })
  },
  hasDirty(cert) {
    return ledger.isDraftDirty(cert) || ledger.listDirtySubmittedAttemptIds(cert).length > 0
  },
  getRevision(cert) {
    return readOwnerState().revisions[cert] ?? 0
  },
  setRevision(cert, revision) {
    updateOwnerState((ownerState) => {
      ownerState.revisions[cert] = revision
    })
  },
  clearCurrentOwner() {
    ledger.clearOwner(currentOwnerId())
  },
  clearOwner(ownerId) {
    if (typeof localStorage === 'undefined') return
    if (ownerId.length === 0) return
    const raw = localStorage.getItem(ACCOUNT_MOCK_EXAM_SYNC_KEY)
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (isOwnerStateShape(parsed)) {
          localStorage.removeItem(ACCOUNT_MOCK_EXAM_SYNC_KEY)
          return
        }
      } catch {
        localStorage.removeItem(ACCOUNT_MOCK_EXAM_SYNC_KEY)
        return
      }
    }
    const state = readState()
    delete state.byUser[ownerId]
    localStorage.setItem(ACCOUNT_MOCK_EXAM_SYNC_KEY, JSON.stringify(state))
  },
  summarizeAnonymousImport() {
    const certs = READY_CERTS.filter(
      (cert) => getLocalMockExamHistory(cert).length > 0 || getLocalMockExamDraft(cert) !== null,
    )
    const recordCount = certs.reduce(
      (total, cert) =>
        total + getLocalMockExamHistory(cert).length + (getLocalMockExamDraft(cert) ? 1 : 0),
      0,
    )
    return { certs, certCount: certs.length, recordCount }
  },
  async importAnonymousCert(cert, adapter) {
    const history = getLocalMockExamHistory(cert)
    const draft = getLocalMockExamDraft(cert)
    if (history.length === 0 && draft === null) return { ok: true }

    try {
      if (history.length > 0) await adapter.syncHistory(cert, history)

      if (draft !== null) {
        const accountDraft = await adapter.fetchAccountDraft(cert)
        if (accountDraft === null) await adapter.syncDraft(draft)
      }
    } catch {
      return { ok: false, reason: 'temporary' }
    }

    clearLocalMockExamImportCert(cert)
    return { ok: true }
  },
  async syncDirty(cert, adapter) {
    const syncDraft = ledger.isDraftDirty(cert)
    const dirtySubmittedIds = ledger.listDirtySubmittedAttemptIds(cert)
    try {
      if (syncDraft) {
        const dirtyDraft = ledger.readDraft(cert)
        const draftMutationId = ledger.getDraftMutationId(cert)
        const draftSettled = await adapter.syncDraft(cert, dirtyDraft, draftMutationId)
        if (draftSettled !== false) ledger.settleDraft(cert)
      }
      if (dirtySubmittedIds.length > 0) {
        const dirtyAttempts = ledger
          .readHistory(cert)
          .filter((attempt) => dirtySubmittedIds.includes(attempt.id))
        if (dirtyAttempts.length > 0) {
          const historySettled = await adapter.syncHistory(cert, dirtyAttempts)
          if (historySettled !== false) {
            ledger.settleSubmittedAttempts(
              cert,
              dirtyAttempts.map((attempt) => attempt.id),
            )
          }
        }
      }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'temporary' }
    }
  },
}

export function getAccountMockExamSyncLedger(): AccountMockExamSyncLedger {
  return ledger
}

export async function syncDirtyMockExam(cert: CertCode): Promise<MockExamImportResult> {
  return ledger.syncDirty(cert, {
    syncDraft: postMockExamDraftSync,
    syncHistory: postMockExamHistorySync,
  })
}

async function postMockExamDraftSync(
  cert: CertCode,
  draft: MockExamAttempt | null,
  mutationId: number,
): Promise<boolean> {
  const baseRevision = ledger.getRevision(cert)
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/draft/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({ baseRevision, draft }),
  })
  if (!response.ok) {
    if (response.status === 409) {
      const conflictBody = (await response.json()) as {
        cert: CertCode
        revision: number
        draft?: MockExamAttempt | null
      }
      if (conflictBody.cert !== cert || !Number.isFinite(conflictBody.revision)) {
        throw new Error('Invalid account-backed Mock Exam Draft sync response')
      }
      if (canApplyMockExamSyncResponse(cert, baseRevision, conflictBody.revision)) {
        ledger.setRevision(cert, conflictBody.revision)
        if ('draft' in conflictBody) {
          ledger.setDraftSnapshot(cert, conflictBody.draft ?? null)
        }
      }
    }
    throw new Error('Failed to sync account-backed Mock Exam Draft')
  }
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    draft?: MockExamAttempt | null
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam Draft sync response')
  }
  if (!canApplyMockExamSyncResponse(cert, baseRevision, body.revision)) return false
  if ('draft' in body) {
    const applied = ledger.applyDraftSyncSnapshotForRequest(
      cert,
      draft,
      mutationId,
      body.draft ?? null,
    )
    if (applied) ledger.setRevision(cert, body.revision)
    return applied
  }
  const current = ledger.isDraftSyncRequestCurrent(cert, draft, mutationId)
  if (current) ledger.setRevision(cert, body.revision)
  return current
}

function canApplyMockExamSyncResponse(
  cert: CertCode,
  requestBaseRevision: number,
  responseRevision: number,
): boolean {
  const currentRevision = ledger.getRevision(cert)
  return currentRevision === requestBaseRevision || responseRevision >= currentRevision
}

async function postMockExamHistorySync(
  cert: CertCode,
  submittedAttempts: SubmittedMockExamAttempt[],
): Promise<boolean> {
  const baseRevision = ledger.getRevision(cert)
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/history/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({ baseRevision, submittedAttempts }),
  })
  if (!response.ok) {
    if (response.status === 409) {
      const conflictBody = (await response.json()) as {
        cert: CertCode
        revision: number
        submittedAttempts?: SubmittedMockExamAttempt[]
        error?: { code?: string }
      }
      if (conflictBody.cert !== cert || !Number.isFinite(conflictBody.revision)) {
        throw new Error('Invalid account-backed Mock Exam History sync response')
      }
      if (conflictBody.error?.code === 'submitted_attempt_conflict') {
        throw new Error('Failed to sync account-backed Mock Exam History')
      }
      if (!canApplyMockExamSyncResponse(cert, baseRevision, conflictBody.revision)) return false
      ledger.setRevision(cert, conflictBody.revision)
      if ('submittedAttempts' in conflictBody) {
        ledger.setHistorySnapshot(cert, conflictBody.submittedAttempts ?? [])
      }
      throw new Error('Failed to sync account-backed Mock Exam History')
    }
    throw new Error('Failed to sync account-backed Mock Exam History')
  }
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    submittedAttempts?: SubmittedMockExamAttempt[]
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam History sync response')
  }
  if (!canApplyMockExamSyncResponse(cert, baseRevision, body.revision)) return false
  ledger.setRevision(cert, body.revision)
  if ('submittedAttempts' in body) {
    settleSyncedHistoryAttempts(cert, submittedAttempts)
    ledger.setHistorySnapshot(cert, body.submittedAttempts ?? [])
  }
  return true
}

function settleSyncedHistoryAttempts(
  cert: CertCode,
  submittedAttempts: SubmittedMockExamAttempt[],
) {
  ledger.settleSubmittedAttempts(
    cert,
    submittedAttempts.map((attempt) => attempt.id),
  )
}

function readState(): AccountMockExamSyncState {
  if (typeof localStorage === 'undefined') return { byUser: {} }
  const raw = localStorage.getItem(ACCOUNT_MOCK_EXAM_SYNC_KEY)
  if (!raw) return { byUser: {} }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { byUser: {} }
    const byUser = (parsed as { byUser?: unknown }).byUser
    if (byUser && typeof byUser === 'object' && !Array.isArray(byUser)) {
      return {
        byUser: Object.fromEntries(
          Object.entries(byUser).map(([ownerId, ownerState]) => [
            ownerId,
            normalizeOwnerState(ownerState),
          ]),
        ),
      }
    }
    if (isOwnerStateShape(parsed)) {
      return { byUser: { [currentOwnerId()]: normalizeOwnerState(parsed) } }
    }
  } catch {
    return { byUser: {} }
  }
  return { byUser: {} }
}

function updateOwnerState(update: (ownerState: OwnerMockExamSyncState) => void) {
  if (typeof localStorage === 'undefined') return
  const state = readState()
  const ownerState = ensureOwnerState(state)
  update(ownerState)
  localStorage.setItem(ACCOUNT_MOCK_EXAM_SYNC_KEY, JSON.stringify(state))
}

function readOwnerState(): OwnerMockExamSyncState {
  return readState().byUser[currentOwnerId()] ?? emptyOwnerState()
}

function ensureOwnerState(state: AccountMockExamSyncState): OwnerMockExamSyncState {
  const ownerId = currentOwnerId()
  state.byUser[ownerId] = normalizeOwnerState(state.byUser[ownerId])
  state.byUser[ownerId].submittedAttempts ??= {}
  state.byUser[ownerId].draftMutationIds ??= {}
  state.byUser[ownerId].dirtyDrafts ??= {}
  state.byUser[ownerId].dirtySubmittedAttempts ??= {}
  return state.byUser[ownerId]
}

function currentOwnerId() {
  if (typeof localStorage === 'undefined') return FALLBACK_ACCOUNT_OWNER
  return localStorage.getItem(ACCOUNT_OWNER_KEY) ?? FALLBACK_ACCOUNT_OWNER
}

function normalizeOwnerState(value: unknown): OwnerMockExamSyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyOwnerState()
  }
  const state = value as Partial<Record<keyof OwnerMockExamSyncState, unknown>>
  return {
    revisions: normalizeRevisions(state.revisions),
    drafts: normalizeDrafts(state.drafts),
    draftMutationIds: normalizeDraftMutationIds(state.draftMutationIds),
    submittedAttempts: normalizeSubmittedAttempts(state.submittedAttempts),
    dirtyDrafts: normalizeDirtyDrafts(state.dirtyDrafts),
    dirtySubmittedAttempts: normalizeDirtySubmittedAttempts(state.dirtySubmittedAttempts),
  }
}

function emptyOwnerState(): OwnerMockExamSyncState {
  return { revisions: {}, drafts: {}, submittedAttempts: {} }
}

function normalizeRevisions(value: unknown): Partial<Record<CertCode, number>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, number>> = {}
  for (const cert of READY_CERTS) {
    const revision = value[cert]
    if (typeof revision === 'number' && Number.isFinite(revision)) normalized[cert] = revision
  }
  return normalized
}

function normalizeDrafts(value: unknown): Partial<Record<CertCode, MockExamAttempt>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, MockExamAttempt>> = {}
  for (const cert of READY_CERTS) {
    const draft = value[cert]
    if (isMockExamAttemptLike(draft) && draft.cert === cert) normalized[cert] = draft
  }
  return normalized
}

function normalizeDraftMutationIds(value: unknown): Partial<Record<CertCode, number>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, number>> = {}
  for (const cert of READY_CERTS) {
    const mutationId = value[cert]
    if (typeof mutationId === 'number' && Number.isFinite(mutationId) && mutationId >= 0) {
      normalized[cert] = mutationId
    }
  }
  return normalized
}

function normalizeSubmittedAttempts(
  value: unknown,
): Partial<Record<CertCode, Record<string, SubmittedMockExamAttempt>>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, Record<string, SubmittedMockExamAttempt>>> = {}
  for (const cert of READY_CERTS) {
    const bucket = value[cert]
    if (!isRecord(bucket)) continue
    const attempts = Object.fromEntries(
      Object.entries(bucket).filter(
        ([, attempt]) => isSubmittedAttemptLike(attempt) && attempt.cert === cert,
      ),
    ) as Record<string, SubmittedMockExamAttempt>
    if (Object.keys(attempts).length > 0) normalized[cert] = attempts
  }
  return normalized
}

function normalizeDirtyDrafts(value: unknown): Partial<Record<CertCode, boolean>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, boolean>> = {}
  for (const cert of READY_CERTS) {
    if (value[cert] === true) normalized[cert] = true
  }
  return normalized
}

function normalizeDirtySubmittedAttempts(value: unknown): Partial<Record<CertCode, string[]>> {
  if (!isRecord(value)) return {}
  const normalized: Partial<Record<CertCode, string[]>> = {}
  for (const cert of READY_CERTS) {
    const attemptIds = value[cert]
    if (
      !Array.isArray(attemptIds) ||
      !attemptIds.every((attemptId) => typeof attemptId === 'string')
    ) {
      continue
    }
    normalized[cert] = Array.from(new Set(attemptIds)).sort()
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isOwnerStateShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  return [
    'revisions',
    'drafts',
    'draftMutationIds',
    'submittedAttempts',
    'dirtyDrafts',
    'dirtySubmittedAttempts',
  ].some((key) => Object.hasOwn(value, key))
}

function isMockExamAttemptLike(value: unknown): value is MockExamAttempt {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    ((value as { cert?: unknown }).cert === 'DVA-C02' ||
      (value as { cert?: unknown }).cert === 'CLF-C02')
  )
}

function isSubmittedAttemptBucket(
  value: unknown,
): value is Record<string, SubmittedMockExamAttempt> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(isSubmittedAttemptLike)
}

function isSubmittedAttemptLike(value: unknown): value is SubmittedMockExamAttempt {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    ((value as { cert?: unknown }).cert === 'DVA-C02' ||
      (value as { cert?: unknown }).cert === 'CLF-C02')
  )
}

function sameDraftPayload(a: MockExamAttempt | null, b: MockExamAttempt | null): boolean {
  if (a === null || b === null) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}

function currentDraftMutationId(ownerState: OwnerMockExamSyncState, cert: CertCode): number {
  return ownerState.draftMutationIds?.[cert] ?? 0
}

function incrementDraftMutationId(ownerState: OwnerMockExamSyncState, cert: CertCode): void {
  ownerState.draftMutationIds ??= {}
  ownerState.draftMutationIds[cert] = currentDraftMutationId(ownerState, cert) + 1
}

function sortHistory(attempts: SubmittedMockExamAttempt[]) {
  return attempts.toSorted((a, b) => b.submittedAt - a.submittedAt || a.id.localeCompare(b.id))
}
