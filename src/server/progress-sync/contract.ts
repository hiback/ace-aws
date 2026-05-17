import type { CertCode, Letter } from '@/data/types'
import type { QuestionBankIndex } from './question-bank-index'

const LETTERS = new Set(['A', 'B', 'C', 'D', 'E'])
const TOP_LEVEL_KEYS = ['baseRevision', 'progress']
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
const FUTURE_GRACE_MS = 5 * 60 * 1000
const PG_INT_MAX = 2_147_483_647

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
  rejected: RecordReject[]
}

export type PayloadErrorCode =
  | 'invalid_base_revision'
  | 'invalid_top_level_payload'
  | 'duplicate_qid'
  | 'payload_too_large'

export type PayloadError = { code: PayloadErrorCode; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    !Array.isArray(payload.progress)
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

  return { cert, baseRevision: payload.baseRevision as number, accepted, rejected }
}
