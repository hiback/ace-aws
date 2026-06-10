import { and, eq, inArray } from 'drizzle-orm'
import type { CertCode } from '@/data/types'
import { db } from '@/db'
import { certProgressRevisions, dailyQuestionStats, questionProgress } from '@/db/schema'
import type { ParsedSync, RecordReject, SyncDailyQuestionStats, SyncRecord } from './contract'
import { type CanonicalQuestionProgress, mergeQuestionProgress } from './merge'

type ProgressRow = {
  qid: number
  correctCount: number
  wrongCount: number
  lastPicks: string[]
  lastCorrect: boolean | null
  lastAnsweredAt: Date | null
  bookmarked: boolean
  bookmarkUpdatedAt: Date | null
}

type SyncResult = {
  status: 200 | 409
  body: {
    cert: CertCode
    revision: number
    accepted: SyncRecord[]
    dailyStats: SyncDailyQuestionStats[]
    rejected: RecordReject[]
    snapshotRequired: boolean
    error?: { code: 'revision_conflict'; message: string }
  }
}

function revisionConflict(cert: CertCode, revision: number, rejected: RecordReject[]): SyncResult {
  return {
    status: 409,
    body: {
      cert,
      revision,
      accepted: [],
      dailyStats: [],
      rejected,
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Progress Revision',
      },
    },
  }
}

function toIso(value: Date | string | null) {
  if (value === null) return null
  return typeof value === 'string' ? value : value.toISOString()
}

function toCanonical(row: ProgressRow): CanonicalQuestionProgress {
  return {
    qid: row.qid,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    lastPicks: row.lastPicks as CanonicalQuestionProgress['lastPicks'],
    lastCorrect: row.lastCorrect,
    lastAnsweredAt: toIso(row.lastAnsweredAt),
    bookmarked: row.bookmarked,
    bookmarkUpdatedAt: toIso(row.bookmarkUpdatedAt),
  }
}

function toDate(value: string | null) {
  return value === null ? null : new Date(value)
}

function sameProgress(left: SyncRecord, right: SyncRecord) {
  return (
    left.qid === right.qid &&
    left.correctCount === right.correctCount &&
    left.wrongCount === right.wrongCount &&
    left.lastCorrect === right.lastCorrect &&
    left.lastAnsweredAt === right.lastAnsweredAt &&
    left.bookmarked === right.bookmarked &&
    left.bookmarkUpdatedAt === right.bookmarkUpdatedAt &&
    left.lastPicks.length === right.lastPicks.length &&
    left.lastPicks.every((pick, index) => pick === right.lastPicks[index])
  )
}

function sameDailyStats(left: SyncDailyQuestionStats | undefined, right: SyncDailyQuestionStats) {
  return (
    left !== undefined &&
    left.date === right.date &&
    left.sourceId === right.sourceId &&
    left.correctCount === right.correctCount &&
    left.wrongCount === right.wrongCount &&
    left.updatedAt === right.updatedAt
  )
}

function isStaleDailyStats(
  left: SyncDailyQuestionStats | undefined,
  right: SyncDailyQuestionStats,
) {
  return left !== undefined && Date.parse(right.updatedAt) < Date.parse(left.updatedAt)
}

export async function syncAccountBackedProgress(
  userId: string,
  parsed: ParsedSync,
): Promise<SyncResult> {
  return db.transaction(async (tx) => {
    const selectRevisionForUpdate = () => {
      const revisionQuery = tx
        .select({ revision: certProgressRevisions.revision })
        .from(certProgressRevisions)
        .where(
          and(
            eq(certProgressRevisions.userId, userId),
            eq(certProgressRevisions.cert, parsed.cert),
          ),
        )
      return 'for' in revisionQuery ? revisionQuery.for('update') : revisionQuery
    }

    let revisionRows = await selectRevisionForUpdate()
    if (revisionRows.length === 0) {
      if (parsed.baseRevision > 0) return revisionConflict(parsed.cert, 0, parsed.rejected)

      await tx
        .insert(certProgressRevisions)
        .values({ userId, cert: parsed.cert, revision: 0 })
        .onConflictDoNothing({
          target: [certProgressRevisions.userId, certProgressRevisions.cert],
        })
      revisionRows = await selectRevisionForUpdate()
    }

    const serverRevision = revisionRows[0]?.revision ?? 0

    if (parsed.baseRevision > serverRevision) {
      return revisionConflict(parsed.cert, serverRevision, parsed.rejected)
    }

    const qids = parsed.accepted.map((record) => record.qid)
    const rows = qids.length
      ? await tx
          .select({
            qid: questionProgress.qid,
            correctCount: questionProgress.correctCount,
            wrongCount: questionProgress.wrongCount,
            lastPicks: questionProgress.lastPicks,
            lastCorrect: questionProgress.lastCorrect,
            lastAnsweredAt: questionProgress.lastAnsweredAt,
            bookmarked: questionProgress.bookmarked,
            bookmarkUpdatedAt: questionProgress.bookmarkUpdatedAt,
          })
          .from(questionProgress)
          .where(
            and(
              eq(questionProgress.userId, userId),
              eq(questionProgress.cert, parsed.cert),
              inArray(questionProgress.qid, qids),
            ),
          )
      : []

    const serverByQid = new Map(rows.map((row) => [row.qid, toCanonical(row)]))
    const accepted = parsed.accepted.map((record) =>
      mergeQuestionProgress(serverByQid.get(record.qid) ?? null, record),
    )
    const changed = accepted.filter((record) => {
      const server = serverByQid.get(record.qid)
      return !server || !sameProgress(server, record)
    })

    const updatedAt = new Date()
    for (const record of changed) {
      await tx
        .insert(questionProgress)
        .values({
          userId,
          cert: parsed.cert,
          qid: record.qid,
          correctCount: record.correctCount,
          wrongCount: record.wrongCount,
          lastPicks: record.lastPicks,
          lastCorrect: record.lastCorrect,
          lastAnsweredAt: toDate(record.lastAnsweredAt),
          bookmarked: record.bookmarked,
          bookmarkUpdatedAt: toDate(record.bookmarkUpdatedAt),
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [questionProgress.userId, questionProgress.cert, questionProgress.qid],
          set: {
            correctCount: record.correctCount,
            wrongCount: record.wrongCount,
            lastPicks: record.lastPicks,
            lastCorrect: record.lastCorrect,
            lastAnsweredAt: toDate(record.lastAnsweredAt),
            bookmarked: record.bookmarked,
            bookmarkUpdatedAt: toDate(record.bookmarkUpdatedAt),
            updatedAt,
          },
        })
    }

    const rawDailyRows = await tx
      .select({
        date: dailyQuestionStats.localDate,
        sourceId: dailyQuestionStats.sourceId,
        correctCount: dailyQuestionStats.correctCount,
        wrongCount: dailyQuestionStats.wrongCount,
        updatedAt: dailyQuestionStats.updatedAt,
      })
      .from(dailyQuestionStats)
      .where(and(eq(dailyQuestionStats.userId, userId), eq(dailyQuestionStats.cert, parsed.cert)))

    const dailyRows = Array.isArray(rawDailyRows) ? rawDailyRows : []
    const serverDailyStats = dailyRows.map((row) => ({
      date: row.date,
      sourceId: row.sourceId,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      updatedAt: toIso(row.updatedAt) ?? updatedAt.toISOString(),
    }))
    const serverDailyByBucket = new Map(
      serverDailyStats.map((row) => [`${row.date}:${row.sourceId}`, row]),
    )
    const changedDailyStats = parsed.dailyStats.filter((row) => {
      const server = serverDailyByBucket.get(`${row.date}:${row.sourceId}`)
      return !sameDailyStats(server, row) && !isStaleDailyStats(server, row)
    })

    for (const row of changedDailyStats) {
      await tx
        .insert(dailyQuestionStats)
        .values({
          userId,
          cert: parsed.cert,
          localDate: row.date,
          sourceId: row.sourceId,
          correctCount: row.correctCount,
          wrongCount: row.wrongCount,
          updatedAt: new Date(row.updatedAt),
        })
        .onConflictDoUpdate({
          target: [
            dailyQuestionStats.userId,
            dailyQuestionStats.cert,
            dailyQuestionStats.localDate,
            dailyQuestionStats.sourceId,
          ],
          set: {
            correctCount: row.correctCount,
            wrongCount: row.wrongCount,
            updatedAt: new Date(row.updatedAt),
          },
        })
      serverDailyByBucket.set(`${row.date}:${row.sourceId}`, row)
    }

    const hasChanges = changed.length > 0 || changedDailyStats.length > 0
    const revision = hasChanges ? serverRevision + 1 : serverRevision
    if (hasChanges) {
      await tx
        .update(certProgressRevisions)
        .set({ revision, updatedAt })
        .where(
          and(
            eq(certProgressRevisions.userId, userId),
            eq(certProgressRevisions.cert, parsed.cert),
          ),
        )
    }

    return {
      status: 200,
      body: {
        cert: parsed.cert,
        revision,
        accepted,
        dailyStats: Array.from(serverDailyByBucket.values()).sort((left, right) =>
          left.date === right.date
            ? left.sourceId.localeCompare(right.sourceId)
            : left.date.localeCompare(right.date),
        ),
        rejected: parsed.rejected,
        snapshotRequired: parsed.baseRevision < serverRevision,
      },
    }
  })
}
