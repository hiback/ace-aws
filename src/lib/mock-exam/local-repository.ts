import { isReadyCertCode } from '@/lib/cert-catalog'
import type { MockExamAttempt } from './start-attempt'
import type { SubmittedMockExamAttempt } from './submission'

const STORAGE_KEY = 'ace-aws/mock-exam/local/v1'

type LocalMockExamState = {
  attempts: Record<string, MockExamAttempt>
  submittedAttempts: Partial<
    Record<MockExamAttempt['cert'], Record<string, SubmittedMockExamAttempt>>
  >
  submissionProgress: Record<string, string[]>
}

export function saveLocalMockExamAttempt(attempt: MockExamAttempt) {
  const state = readState()
  for (const [attemptId, existing] of Object.entries(state.attempts)) {
    if (existing.cert === attempt.cert && attemptId !== attempt.id) {
      delete state.attempts[attemptId]
    }
  }
  state.attempts[attempt.id] = attempt
  writeState(state)
}

export function getLocalMockExamDraft(cert: MockExamAttempt['cert']): MockExamAttempt | null {
  return Object.values(readState().attempts).find((attempt) => attempt.cert === cert) ?? null
}

export function deleteLocalMockExamDraft(cert: MockExamAttempt['cert']) {
  const state = readState()
  for (const [attemptId, attempt] of Object.entries(state.attempts)) {
    if (attempt.cert === cert) delete state.attempts[attemptId]
  }
  writeState(state)
}

export function deleteLocalMockExamDraftIfAttempt(
  cert: MockExamAttempt['cert'],
  attemptId: string,
) {
  const state = readState()
  if (state.attempts[attemptId]?.cert === cert) {
    delete state.attempts[attemptId]
    writeState(state)
  }
}

export function saveLocalMockExamSubmittedAttempt(attempt: SubmittedMockExamAttempt) {
  const state = readState()
  let certAttempts = state.submittedAttempts[attempt.cert]
  if (!certAttempts) {
    certAttempts = {}
    state.submittedAttempts[attempt.cert] = certAttempts
  }
  if (certAttempts[attempt.id]) return
  certAttempts[attempt.id] = attempt
  writeState(state)
}

export function deleteLocalMockExamSubmittedAttempt(attemptId: string) {
  const state = readState()
  let changed = false
  for (const [cert, bucket] of Object.entries(state.submittedAttempts)) {
    if (bucket && isSubmittedAttemptBucket(bucket) && bucket[attemptId]) {
      delete bucket[attemptId]
      if (Object.keys(bucket).length === 0) {
        delete state.submittedAttempts[cert as MockExamAttempt['cert']]
      }
      changed = true
    }
  }
  if (changed) writeState(state)
}

export function getLocalMockExamAttempt(attemptId: string): MockExamAttempt | null {
  return readState().attempts[attemptId] ?? null
}

export function getLocalMockExamSubmittedAttempt(
  attemptId: string,
): SubmittedMockExamAttempt | null {
  return (
    readSubmittedAttempts(readState().submittedAttempts).find(
      (attempt) => attempt.id === attemptId,
    ) ?? null
  )
}

export function getLocalMockExamHistory(cert: MockExamAttempt['cert']): SubmittedMockExamAttempt[] {
  return readSubmittedAttempts(readState().submittedAttempts)
    .filter((attempt) => attempt.cert === cert)
    .sort((a, b) => b.submittedAt - a.submittedAt || a.id.localeCompare(b.id))
}

export function clearLocalMockExamImportCert(cert: MockExamAttempt['cert']) {
  const state = readState()
  for (const [attemptId, attempt] of Object.entries(state.attempts)) {
    if (attempt.cert === cert) delete state.attempts[attemptId]
  }
  delete state.submittedAttempts[cert]
  writeState(state)
}

export function getLocalMockExamSubmissionProgress(attemptId: string): Set<string> {
  return new Set(readState().submissionProgress[attemptId] ?? [])
}

export function markLocalMockExamSubmissionProgress(attemptId: string, fingerprint: string) {
  const state = readState()
  const existing = new Set(state.submissionProgress[attemptId] ?? [])
  existing.add(fingerprint)
  state.submissionProgress[attemptId] = Array.from(existing).sort()
  writeState(state)
}

export function clearLocalMockExamSubmissionProgress(attemptId: string) {
  const state = readState()
  delete state.submissionProgress[attemptId]
  writeState(state)
}

function readState(): LocalMockExamState {
  if (typeof localStorage === 'undefined') return emptyState()
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return emptyState()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isLocalMockExamState(parsed)) return emptyState()
    return parsed
  } catch {
    return emptyState()
  }
}

function writeState(state: LocalMockExamState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function isLocalMockExamState(value: unknown): value is LocalMockExamState {
  if (!value || typeof value !== 'object') return false
  const attempts = (value as { attempts?: unknown }).attempts
  const submittedAttempts = (value as { submittedAttempts?: unknown }).submittedAttempts
  const submissionProgress = (value as { submissionProgress?: unknown }).submissionProgress
  if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return false
  if (
    !submittedAttempts ||
    typeof submittedAttempts !== 'object' ||
    Array.isArray(submittedAttempts)
  ) {
    ;(value as LocalMockExamState).submittedAttempts = {}
  }
  if (
    !submissionProgress ||
    typeof submissionProgress !== 'object' ||
    Array.isArray(submissionProgress)
  ) {
    ;(value as LocalMockExamState).submissionProgress = {}
  }
  return true
}

function readSubmittedAttempts(
  value: LocalMockExamState['submittedAttempts'] | Record<string, SubmittedMockExamAttempt>,
): SubmittedMockExamAttempt[] {
  return Object.values(value).flatMap((bucket) =>
    bucket && isSubmittedAttemptBucket(bucket) ? Object.values(bucket) : [],
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
    typeof (value as { cert?: unknown }).cert === 'string' &&
    isReadyCertCode((value as { cert: string }).cert)
  )
}

function emptyState(): LocalMockExamState {
  return { attempts: {}, submittedAttempts: {}, submissionProgress: {} }
}
