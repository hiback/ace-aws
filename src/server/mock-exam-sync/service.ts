import { and, desc, eq } from 'drizzle-orm'
import type { CertCode } from '@/data/types'
import { db } from '@/db'
import { mockExamDrafts, mockExamRevisions, mockExamSubmittedAttempts } from '@/db/schema'
import type { MockExamAttempt } from '@/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'
import type { MockExamHistorySyncPayload, MockExamSyncPayload } from './contract'

type ResolveInput = {
  cert: CertCode
  baseRevision: number
  serverRevision: number
  serverDraft: MockExamAttempt | null
  clientDraft: MockExamAttempt | null
}

type ResolveResult = {
  status: 200 | 409
  revision: number
  draft: MockExamAttempt | null
  changed: boolean
  snapshotRequired: boolean
  error?: { code: 'revision_conflict'; message: string }
}

type HistoryResolveInput = {
  cert: CertCode
  baseRevision: number
  serverRevision: number
  serverHistory: SubmittedMockExamAttempt[]
  clientHistory: SubmittedMockExamAttempt[]
}

type HistoryReject = {
  attemptId: string
  code: 'submitted_attempt_conflict'
  message: string
}

type HistoryResolveResult = {
  status: 200 | 409
  revision: number
  submittedAttempts: SubmittedMockExamAttempt[]
  rejected: HistoryReject[]
  changed: boolean
  snapshotRequired: boolean
  error?: { code: 'revision_conflict' | 'submitted_attempt_conflict'; message: string }
}

export type MockExamDraftSnapshot = {
  cert: CertCode
  revision: number
  draft: MockExamAttempt | null
}

export type MockExamDraftSyncResult = {
  status: 200 | 409
  body: {
    cert: CertCode
    revision: number
    draft: MockExamAttempt | null
    snapshotRequired: boolean
    error?: { code: 'revision_conflict'; message: string }
  }
}

export type MockExamHistorySnapshot = {
  cert: CertCode
  revision: number
  submittedAttempts: SubmittedMockExamAttempt[]
}

export type MockExamHistorySyncResult = {
  status: 200 | 409
  body: {
    cert: CertCode
    revision: number
    submittedAttempts: SubmittedMockExamAttempt[]
    rejected: HistoryReject[]
    snapshotRequired: boolean
    error?: { code: 'revision_conflict' | 'submitted_attempt_conflict'; message: string }
  }
}

export function resolveMockExamDraftSync(input: ResolveInput): ResolveResult {
  if (input.baseRevision > input.serverRevision) {
    return {
      status: 409,
      revision: input.serverRevision,
      draft: input.serverDraft,
      changed: false,
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Mock Exam Revision',
      },
    }
  }

  const snapshotRequired = input.baseRevision < input.serverRevision
  if (input.clientDraft === null) {
    const changed = !snapshotRequired && input.serverDraft !== null
    return {
      status: 200,
      revision: changed ? input.serverRevision + 1 : input.serverRevision,
      draft: snapshotRequired ? input.serverDraft : null,
      changed,
      snapshotRequired,
    }
  }

  const clientWins =
    input.serverDraft === null || input.clientDraft.updatedAt > input.serverDraft.updatedAt
  const changed = clientWins && input.clientDraft !== input.serverDraft
  return {
    status: 200,
    revision: changed ? input.serverRevision + 1 : input.serverRevision,
    draft: clientWins ? input.clientDraft : input.serverDraft,
    changed,
    snapshotRequired,
  }
}

export function resolveMockExamHistorySync(input: HistoryResolveInput): HistoryResolveResult {
  if (input.baseRevision > input.serverRevision) {
    return {
      status: 409,
      revision: input.serverRevision,
      submittedAttempts: sortHistory(input.serverHistory),
      rejected: [],
      changed: false,
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Mock Exam Revision',
      },
    }
  }

  const byId = new Map(input.serverHistory.map((attempt) => [attempt.id, attempt]))
  const rejected: HistoryReject[] = []
  for (const clientAttempt of input.clientHistory) {
    const existing = byId.get(clientAttempt.id)
    if (!existing) continue
    if (!sameSubmittedAttempt(existing, clientAttempt)) {
      rejected.push({
        attemptId: clientAttempt.id,
        code: 'submitted_attempt_conflict',
        message: 'Submitted Mock Exam Attempt already exists with different content',
      })
    }
  }

  if (rejected.length > 0) {
    return {
      status: 409,
      revision: input.serverRevision,
      submittedAttempts: sortHistory(input.serverHistory),
      rejected,
      changed: false,
      snapshotRequired: true,
      error: {
        code: 'submitted_attempt_conflict',
        message: 'Submitted Mock Exam History contains conflicting attempts',
      },
    }
  }

  let changed = false
  for (const clientAttempt of input.clientHistory) {
    if (!byId.has(clientAttempt.id)) {
      byId.set(clientAttempt.id, clientAttempt)
      changed = true
    }
  }

  return {
    status: 200,
    revision: changed ? input.serverRevision + 1 : input.serverRevision,
    submittedAttempts: sortHistory(Array.from(byId.values())),
    rejected,
    changed,
    snapshotRequired: input.baseRevision < input.serverRevision,
  }
}

export async function getAccountBackedMockExamDraftSnapshot(
  userId: string,
  cert: CertCode,
): Promise<MockExamDraftSnapshot> {
  return db.transaction(async (tx) => {
    await ensureRevision(tx, userId, cert)
    const revision = await selectRevisionForUpdate(tx, userId, cert)
    const draft = await selectDraft(tx, userId, cert)
    return { cert, revision, draft }
  })
}

export async function getAccountBackedMockExamHistorySnapshot(
  userId: string,
  cert: CertCode,
): Promise<MockExamHistorySnapshot> {
  return db.transaction(async (tx) => {
    await ensureRevision(tx, userId, cert)
    const revision = await selectRevisionForUpdate(tx, userId, cert)
    const submittedAttempts = await selectSubmittedAttempts(tx, userId, cert)
    return { cert, revision, submittedAttempts }
  })
}

export async function syncAccountBackedMockExamDraft(
  userId: string,
  payload: MockExamSyncPayload,
): Promise<MockExamDraftSyncResult> {
  return db.transaction(async (tx) => {
    await ensureRevision(tx, userId, payload.cert)
    const serverRevision = await selectRevisionForUpdate(tx, userId, payload.cert)
    const serverDraft = await selectDraft(tx, userId, payload.cert)
    const result = resolveMockExamDraftSync({
      cert: payload.cert,
      baseRevision: payload.baseRevision,
      serverRevision,
      serverDraft,
      clientDraft: payload.draft,
    })

    if (result.status === 200 && result.changed) {
      if (result.draft === null) {
        await tx
          .delete(mockExamDrafts)
          .where(and(eq(mockExamDrafts.userId, userId), eq(mockExamDrafts.cert, payload.cert)))
      } else {
        await tx
          .insert(mockExamDrafts)
          .values({
            userId,
            cert: payload.cert,
            attemptId: result.draft.id,
            detail: result.draft,
            updatedAt: new Date(result.draft.updatedAt),
          })
          .onConflictDoUpdate({
            target: [mockExamDrafts.userId, mockExamDrafts.cert],
            set: {
              attemptId: result.draft.id,
              detail: result.draft,
              updatedAt: new Date(result.draft.updatedAt),
            },
          })
      }
      await tx
        .update(mockExamRevisions)
        .set({ revision: result.revision, updatedAt: new Date() })
        .where(and(eq(mockExamRevisions.userId, userId), eq(mockExamRevisions.cert, payload.cert)))
    }

    return {
      status: result.status,
      body: {
        cert: payload.cert,
        revision: result.revision,
        draft: result.draft,
        snapshotRequired: result.snapshotRequired,
        ...(result.error ? { error: result.error } : {}),
      },
    }
  })
}

export async function syncAccountBackedMockExamHistory(
  userId: string,
  payload: MockExamHistorySyncPayload,
): Promise<MockExamHistorySyncResult> {
  return db.transaction(async (tx) => {
    await ensureRevision(tx, userId, payload.cert)
    const serverRevision = await selectRevisionForUpdate(tx, userId, payload.cert)
    const serverHistory = await selectSubmittedAttempts(tx, userId, payload.cert)
    const result = resolveMockExamHistorySync({
      cert: payload.cert,
      baseRevision: payload.baseRevision,
      serverRevision,
      serverHistory,
      clientHistory: payload.submittedAttempts,
    })

    if (result.status === 200 && result.changed) {
      const serverIds = new Set(serverHistory.map((attempt) => attempt.id))
      const newAttempts = result.submittedAttempts.filter((attempt) => !serverIds.has(attempt.id))
      for (const attempt of newAttempts) {
        await tx
          .insert(mockExamSubmittedAttempts)
          .values({
            userId,
            cert: payload.cert,
            attemptId: attempt.id,
            submittedAt: new Date(attempt.submittedAt),
            score: attempt.summary.score,
            passed: attempt.summary.passed,
            timeUsedSeconds: attempt.summary.timeUsedSeconds,
            autoSubmitted: attempt.summary.autoSubmitted,
            detail: attempt,
          })
          .onConflictDoNothing({
            target: [
              mockExamSubmittedAttempts.userId,
              mockExamSubmittedAttempts.cert,
              mockExamSubmittedAttempts.attemptId,
            ],
          })
      }
      await tx
        .update(mockExamRevisions)
        .set({ revision: result.revision, updatedAt: new Date() })
        .where(and(eq(mockExamRevisions.userId, userId), eq(mockExamRevisions.cert, payload.cert)))
    }

    return {
      status: result.status,
      body: {
        cert: payload.cert,
        revision: result.revision,
        submittedAttempts: result.submittedAttempts,
        rejected: result.rejected,
        snapshotRequired: result.snapshotRequired,
        ...(result.error ? { error: result.error } : {}),
      },
    }
  })
}

async function ensureRevision(tx: Transaction, userId: string, cert: CertCode) {
  await tx
    .insert(mockExamRevisions)
    .values({ userId, cert, revision: 0 })
    .onConflictDoNothing({ target: [mockExamRevisions.userId, mockExamRevisions.cert] })
}

async function selectRevisionForUpdate(tx: Transaction, userId: string, cert: CertCode) {
  const query = tx
    .select({ revision: mockExamRevisions.revision })
    .from(mockExamRevisions)
    .where(and(eq(mockExamRevisions.userId, userId), eq(mockExamRevisions.cert, cert)))
  const rows = await ('for' in query ? query.for('update') : query)
  return rows[0]?.revision ?? 0
}

async function selectDraft(
  tx: Transaction,
  userId: string,
  cert: CertCode,
): Promise<MockExamAttempt | null> {
  const rows = await tx
    .select({ detail: mockExamDrafts.detail })
    .from(mockExamDrafts)
    .where(and(eq(mockExamDrafts.userId, userId), eq(mockExamDrafts.cert, cert)))
  return (rows[0]?.detail as MockExamAttempt | undefined) ?? null
}

async function selectSubmittedAttempts(
  tx: Transaction,
  userId: string,
  cert: CertCode,
): Promise<SubmittedMockExamAttempt[]> {
  const rows = await tx
    .select({ detail: mockExamSubmittedAttempts.detail })
    .from(mockExamSubmittedAttempts)
    .where(
      and(eq(mockExamSubmittedAttempts.userId, userId), eq(mockExamSubmittedAttempts.cert, cert)),
    )
    .orderBy(desc(mockExamSubmittedAttempts.submittedAt), mockExamSubmittedAttempts.attemptId)
  return rows.map((row) => row.detail as SubmittedMockExamAttempt)
}

function sortHistory(attempts: SubmittedMockExamAttempt[]) {
  return attempts.toSorted((a, b) => b.submittedAt - a.submittedAt || a.id.localeCompare(b.id))
}

function sameSubmittedAttempt(left: SubmittedMockExamAttempt, right: SubmittedMockExamAttempt) {
  return stableStringify(left) === stableStringify(right)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
