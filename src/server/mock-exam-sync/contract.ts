import type { CertCode, Letter } from '@/data/types'
import type { MockExamAttempt, MockExamQuestionSnapshot } from '@/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'

const TOP_LEVEL_KEYS = ['baseRevision', 'draft']
const HISTORY_TOP_LEVEL_KEYS = ['baseRevision', 'submittedAttempts']
const ATTEMPT_KEYS = [
  'id',
  'cert',
  'draftStatus',
  'currentIndex',
  'questionCount',
  'timeLimitSeconds',
  'startedAt',
  'elapsedSeconds',
  'updatedAt',
  'questions',
]
const LEGACY_ATTEMPT_KEYS = ATTEMPT_KEYS.filter((key) => key !== 'elapsedSeconds')
const QUESTION_KEYS = [
  'qid',
  'domain',
  'topic',
  'correctAnswer',
  'type',
  'userPicks',
  'correct',
  'flagged',
  'answered',
]
const SUBMITTED_KEYS = ['id', 'cert', 'submittedAt', 'questions', 'summary']
const SUMMARY_KEYS = [
  'score',
  'passed',
  'correctCount',
  'totalCount',
  'unansweredCount',
  'accuracy',
  'timeUsedSeconds',
  'autoSubmitted',
  'domains',
]
const DOMAIN_SUMMARY_KEYS = ['name', 'correctCount', 'totalCount', 'accuracy', 'weight']
const LETTERS = new Set(['A', 'B', 'C', 'D', 'E'])

export type MockExamSyncPayload = {
  cert: CertCode
  baseRevision: number
  draft: MockExamAttempt | null
}

export type MockExamHistorySyncPayload = {
  cert: CertCode
  baseRevision: number
  submittedAttempts: SubmittedMockExamAttempt[]
}

export type MockExamSyncPayloadError = {
  code:
    | 'invalid_top_level_payload'
    | 'invalid_base_revision'
    | 'invalid_draft'
    | 'invalid_submitted_attempt'
    | 'cert_mismatch'
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every((key) => present.includes(key))
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && (value as number) >= 0
}

function isLetterArray(value: unknown): value is Letter[] {
  return (
    Array.isArray(value) &&
    value.every((letter) => typeof letter === 'string' && LETTERS.has(letter)) &&
    new Set(value).size === value.length
  )
}

function isQuestionSnapshot(value: unknown): value is MockExamQuestionSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, QUESTION_KEYS)) return false
  if (
    !isNonNegativeInteger(value.qid) ||
    (value.qid as number) <= 0 ||
    typeof value.domain !== 'string' ||
    value.domain.length === 0 ||
    typeof value.topic !== 'string' ||
    value.topic.length === 0 ||
    !isLetterArray(value.correctAnswer) ||
    value.correctAnswer.length === 0 ||
    (value.type !== 'single' && value.type !== 'multi') ||
    !isLetterArray(value.userPicks) ||
    (typeof value.correct !== 'boolean' && value.correct !== null) ||
    typeof value.flagged !== 'boolean' ||
    typeof value.answered !== 'boolean'
  ) {
    return false
  }

  const correctAnswer = value.correctAnswer as Letter[]
  const userPicks = value.userPicks as Letter[]
  if (value.type === 'single' && correctAnswer.length !== 1) return false
  if (userPicks.length > correctAnswer.length) return false
  if (value.type === 'multi' && value.answered && userPicks.length !== correctAnswer.length) {
    return false
  }
  if (value.type === 'single' && value.answered && userPicks.length !== 1) return false
  if (!value.answered) {
    if (value.correct !== null) return false
    return value.type === 'multi' ? userPicks.length < correctAnswer.length : userPicks.length === 0
  }
  return userPicks.length > 0 && typeof value.correct === 'boolean'
}

function isMockExamAttempt(value: unknown): value is MockExamAttempt {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ATTEMPT_KEYS) && !hasExactKeys(value, LEGACY_ATTEMPT_KEYS))
  ) {
    return false
  }
  if (value.draftStatus !== 'active' && value.draftStatus !== 'saved') return false
  if (!Array.isArray(value.questions) || !value.questions.every(isQuestionSnapshot)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.cert === 'DVA-C02' || value.cert === 'CLF-C02') &&
    isNonNegativeInteger(value.currentIndex) &&
    isNonNegativeInteger(value.questionCount) &&
    isNonNegativeInteger(value.timeLimitSeconds) &&
    isNonNegativeInteger(value.startedAt) &&
    (value.elapsedSeconds === undefined || isNonNegativeInteger(value.elapsedSeconds)) &&
    isNonNegativeInteger(value.updatedAt) &&
    value.questions.length === value.questionCount &&
    (value.currentIndex as number) < value.questions.length
  )
}

function isFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isDomainSummary(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, DOMAIN_SUMMARY_KEYS)) return false
  return (
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    isNonNegativeInteger(value.correctCount) &&
    isNonNegativeInteger(value.totalCount) &&
    isFiniteNumber(value.accuracy) &&
    isNonNegativeInteger(value.weight)
  )
}

function isSubmittedMockExamAttempt(value: unknown): value is SubmittedMockExamAttempt {
  if (!isRecord(value) || !hasExactKeys(value, SUBMITTED_KEYS)) return false
  const summary = value.summary
  if (!isRecord(summary) || !hasExactKeys(summary, SUMMARY_KEYS)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.cert === 'DVA-C02' || value.cert === 'CLF-C02') &&
    isNonNegativeInteger(value.submittedAt) &&
    Array.isArray(value.questions) &&
    value.questions.length > 0 &&
    value.questions.every(isQuestionSnapshot) &&
    isNonNegativeInteger(summary.score) &&
    typeof summary.passed === 'boolean' &&
    isNonNegativeInteger(summary.correctCount) &&
    isNonNegativeInteger(summary.totalCount) &&
    isNonNegativeInteger(summary.unansweredCount) &&
    isFiniteNumber(summary.accuracy) &&
    isNonNegativeInteger(summary.timeUsedSeconds) &&
    typeof summary.autoSubmitted === 'boolean' &&
    Array.isArray(summary.domains) &&
    summary.domains.every(isDomainSummary)
  )
}

export function parseMockExamSyncPayload(
  cert: CertCode,
  payload: unknown,
): MockExamSyncPayload | { error: MockExamSyncPayloadError } {
  if (!isRecord(payload) || !hasExactKeys(payload, TOP_LEVEL_KEYS)) {
    return {
      error: { code: 'invalid_top_level_payload', message: 'Invalid top-level payload' },
    }
  }
  if (!isNonNegativeInteger(payload.baseRevision)) {
    return { error: { code: 'invalid_base_revision', message: 'Invalid base revision' } }
  }
  if (payload.draft === null)
    return { cert, baseRevision: payload.baseRevision as number, draft: null }
  if (!isMockExamAttempt(payload.draft)) {
    return { error: { code: 'invalid_draft', message: 'Invalid Mock Exam Draft' } }
  }
  if (payload.draft.cert !== cert) {
    return {
      error: {
        code: 'cert_mismatch',
        message: 'Draft certification does not match route certification',
      },
    }
  }
  return { cert, baseRevision: payload.baseRevision as number, draft: payload.draft }
}

export function parseMockExamHistorySyncPayload(
  cert: CertCode,
  payload: unknown,
): MockExamHistorySyncPayload | { error: MockExamSyncPayloadError } {
  if (!isRecord(payload) || !hasExactKeys(payload, HISTORY_TOP_LEVEL_KEYS)) {
    return {
      error: { code: 'invalid_top_level_payload', message: 'Invalid top-level payload' },
    }
  }
  if (!isNonNegativeInteger(payload.baseRevision)) {
    return { error: { code: 'invalid_base_revision', message: 'Invalid base revision' } }
  }
  if (
    !Array.isArray(payload.submittedAttempts) ||
    !payload.submittedAttempts.every(isSubmittedMockExamAttempt)
  ) {
    return {
      error: { code: 'invalid_submitted_attempt', message: 'Invalid submitted Mock Exam Attempt' },
    }
  }
  if (payload.submittedAttempts.some((attempt) => attempt.cert !== cert)) {
    return {
      error: {
        code: 'cert_mismatch',
        message: 'Submitted attempt certification does not match route certification',
      },
    }
  }
  const ids = payload.submittedAttempts.map((attempt) => attempt.id)
  if (new Set(ids).size !== ids.length) {
    return {
      error: { code: 'invalid_submitted_attempt', message: 'Invalid submitted Mock Exam Attempt' },
    }
  }
  return {
    cert,
    baseRevision: payload.baseRevision as number,
    submittedAttempts: payload.submittedAttempts,
  }
}
