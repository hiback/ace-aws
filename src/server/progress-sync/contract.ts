import type { CertCode, Letter } from '@/data/types'
import type { QuestionBankIndex } from './question-bank-index'

const LETTERS = new Set(['A', 'B', 'C', 'D', 'E', 'F'])
const TOP_LEVEL_KEYS = ['baseRevision', 'progress', 'dailyStats']
const RECORD_KEYS = [
  'qid',
  'correctCount',
  'wrongCount',
  'lastPicks',
  'lastCorrect',
  'lastAnsweredAt',
  'bookmarked',
  'bookmarkUpdatedAt',
]
const DAILY_STATS_KEYS = ['date', 'sourceId', 'correctCount', 'wrongCount', 'updatedAt']
const FUTURE_GRACE_MS = 5 * 60 * 1000
const MAX_DAILY_STATS_BUCKETS = 400
const MAX_SOURCE_ID_LENGTH = 64
const PG_INT_MAX = 2_147_483_647
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SOURCE_ID_RE = /^(client|anon-import):.+$/

export type SyncRecord = {
  qid: number
  correctCount: number
  wrongCount: number
  lastPicks: Letter[]
  lastCorrect: boolean | null
  lastAnsweredAt: string | null
  bookmarked: boolean
  bookmarkUpdatedAt: string | null
}

export type SyncDailyQuestionStats = {
  date: string
  sourceId: string
  correctCount: number
  wrongCount: number
  updatedAt: string
}

export type RecordReject = {
  index: number
  qid?: number
  code:
    | 'invalid_shape'
    | 'invalid_qid'
    | 'invalid_options'
    | 'invalid_answer_state'
    | 'future_timestamp'
}

export type ParsedSync = {
  cert: CertCode
  baseRevision: number
  accepted: SyncRecord[]
  dailyStats: SyncDailyQuestionStats[]
  rejected: RecordReject[]
}

export type PayloadErrorCode =
  | 'invalid_base_revision'
  | 'invalid_top_level_payload'
  | 'duplicate_qid'
  | 'duplicate_daily_stats_bucket'
  | 'invalid_daily_stats'
  | 'payload_too_large'

export type PayloadError = { code: PayloadErrorCode; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateDailyStats(value: unknown, now: number): SyncDailyQuestionStats | null {
  if (!isRecord(value) || !hasExactKeys(value, DAILY_STATS_KEYS)) return null
  const updatedAt = isoOrNull(value.updatedAt)
  if (
    typeof value.date !== 'string' ||
    !LOCAL_DATE_RE.test(value.date) ||
    !isRealLocalDate(value.date) ||
    typeof value.sourceId !== 'string' ||
    value.sourceId.length > MAX_SOURCE_ID_LENGTH ||
    !SOURCE_ID_RE.test(value.sourceId) ||
    !isInteger(value.correctCount) ||
    !isInteger(value.wrongCount) ||
    updatedAt === undefined ||
    updatedAt === null
  ) {
    return null
  }

  const correctCount = value.correctCount as number
  const wrongCount = value.wrongCount as number
  if (
    correctCount < 0 ||
    wrongCount < 0 ||
    correctCount > PG_INT_MAX ||
    wrongCount > PG_INT_MAX ||
    isFuture(updatedAt, now)
  ) {
    return null
  }

  return {
    date: value.date,
    sourceId: value.sourceId,
    correctCount,
    wrongCount,
    updatedAt,
  }
}

function isRealLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every((key) => present.includes(key))
}

function isInteger(value: unknown) {
  return Number.isInteger(value)
}

function isoOrNull(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return undefined
  return new Date(timestamp).toISOString() === value ? value : undefined
}

function isFuture(value: string | null, now: number) {
  return value !== null && Date.parse(value) > now + FUTURE_GRACE_MS
}

function reject(
  index: number,
  record: Record<string, unknown> | null,
  code: RecordReject['code'],
): RecordReject {
  const qid = record && Number.isInteger(record.qid) ? (record.qid as number) : undefined
  return qid === undefined ? { index, code } : { index, qid, code }
}

function validateRecord(
  value: unknown,
  index: number,
  bank: QuestionBankIndex,
  now: number,
): { accepted: SyncRecord } | { rejected: RecordReject } {
  if (!isRecord(value) || !hasExactKeys(value, RECORD_KEYS)) {
    return { rejected: { index, code: 'invalid_shape' } }
  }

  if (
    !isInteger(value.qid) ||
    !isInteger(value.correctCount) ||
    !isInteger(value.wrongCount) ||
    !Array.isArray(value.lastPicks) ||
    !(typeof value.lastCorrect === 'boolean' || value.lastCorrect === null) ||
    typeof value.bookmarked !== 'boolean'
  ) {
    return { rejected: reject(index, value, 'invalid_shape') }
  }

  const qid = value.qid as number
  const question = bank.questions.get(qid)
  if (!question) return { rejected: { index, qid, code: 'invalid_qid' } }

  const correctCount = value.correctCount as number
  const wrongCount = value.wrongCount as number
  const lastPicks = value.lastPicks as unknown[]
  const lastCorrect = value.lastCorrect as boolean | null
  const bookmarked = value.bookmarked as boolean
  const lastAnsweredAt = isoOrNull(value.lastAnsweredAt)
  const bookmarkUpdatedAt = isoOrNull(value.bookmarkUpdatedAt)

  if (
    correctCount < 0 ||
    wrongCount < 0 ||
    correctCount > PG_INT_MAX ||
    wrongCount > PG_INT_MAX ||
    lastAnsweredAt === undefined ||
    bookmarkUpdatedAt === undefined
  ) {
    return { rejected: reject(index, value, 'invalid_shape') }
  }

  if (isFuture(lastAnsweredAt, now) || isFuture(bookmarkUpdatedAt, now)) {
    return { rejected: { index, qid, code: 'future_timestamp' } }
  }

  if (
    !lastPicks.every(
      (pick) =>
        typeof pick === 'string' && LETTERS.has(pick) && question.options.has(pick as Letter),
    ) ||
    new Set(lastPicks).size !== lastPicks.length ||
    lastPicks.length > 0 !== (lastCorrect !== null && lastAnsweredAt !== null) ||
    (question.type === 'single' && lastPicks.length > 1) ||
    (question.type === 'multi' && lastPicks.length > 0 && lastPicks.length !== question.answerCount)
  ) {
    return { rejected: { index, qid, code: 'invalid_options' } }
  }

  const hasAnswer = lastPicks.length > 0
  if (
    (!hasAnswer &&
      (lastCorrect !== null || lastAnsweredAt !== null || correctCount + wrongCount > 0)) ||
    (hasAnswer && correctCount === 0 && wrongCount === 0) ||
    (lastCorrect === true && correctCount === 0) ||
    (lastCorrect === false && wrongCount === 0) ||
    (bookmarked && bookmarkUpdatedAt === null) ||
    (!hasAnswer && !bookmarked && bookmarkUpdatedAt === null)
  ) {
    return { rejected: { index, qid, code: 'invalid_answer_state' } }
  }

  return {
    accepted: {
      qid,
      correctCount,
      wrongCount,
      lastPicks: (lastPicks as Letter[]).toSorted(),
      lastCorrect,
      lastAnsweredAt,
      bookmarked,
      bookmarkUpdatedAt,
    },
  }
}

export function parseProgressSyncPayload(
  cert: CertCode,
  payload: unknown,
  bank: QuestionBankIndex,
  now = Date.now(),
): ParsedSync | { error: PayloadError } {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, TOP_LEVEL_KEYS) ||
    !Array.isArray(payload.progress) ||
    !Array.isArray(payload.dailyStats)
  ) {
    return { error: { code: 'invalid_top_level_payload', message: 'Invalid top-level payload' } }
  }
  if (!isInteger(payload.baseRevision) || (payload.baseRevision as number) < 0) {
    return { error: { code: 'invalid_base_revision', message: 'Invalid base revision' } }
  }
  if (payload.progress.length > bank.questionCount) {
    return {
      error: {
        code: 'payload_too_large',
        message: 'Progress payload is larger than the question bank',
      },
    }
  }
  if (payload.dailyStats.length > MAX_DAILY_STATS_BUCKETS) {
    return {
      error: {
        code: 'payload_too_large',
        message: 'Daily stats payload is too large',
      },
    }
  }

  const dailyStats = payload.dailyStats.map((bucket) => validateDailyStats(bucket, now))
  if (dailyStats.some((bucket) => bucket === null)) {
    return { error: { code: 'invalid_daily_stats', message: 'Invalid daily question stats' } }
  }
  const seenDailyStats = new Set<string>()
  for (const bucket of dailyStats) {
    if (bucket === null) continue
    const key = `${bucket.date}:${bucket.sourceId}`
    if (seenDailyStats.has(key)) {
      return {
        error: { code: 'duplicate_daily_stats_bucket', message: 'Duplicate daily stats bucket' },
      }
    }
    seenDailyStats.add(key)
  }

  const accepted: SyncRecord[] = []
  const rejected: RecordReject[] = []
  payload.progress.forEach((record, index) => {
    const result = validateRecord(record, index, bank, now)
    if ('accepted' in result) accepted.push(result.accepted)
    else rejected.push(result.rejected)
  })

  const seen = new Set<number>()
  for (const record of accepted) {
    if (seen.has(record.qid)) return { error: { code: 'duplicate_qid', message: 'Duplicate qid' } }
    seen.add(record.qid)
  }

  return {
    cert,
    baseRevision: payload.baseRevision as number,
    accepted,
    dailyStats: dailyStats as SyncDailyQuestionStats[],
    rejected,
  }
}
