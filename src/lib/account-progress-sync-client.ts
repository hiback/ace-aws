import type { CertCode, Letter, QuestionProgress } from '@/data/types'

interface ProgressSnapshotDto {
  cert: CertCode
  revision: number
  progress: Array<{
    qid: number
    correctCount: number
    wrongCount: number
    lastPicks: Letter[]
    lastCorrect: boolean | null
    lastAnsweredAt: string | null
    bookmarked: boolean
    bookmarkUpdatedAt: string | null
  }>
}

interface ProgressSyncDto {
  cert: CertCode
  revision: number
  accepted: ProgressSnapshotDto['progress']
  rejected: Array<{ index: number; qid?: number; code: string }>
  snapshotRequired: boolean
  error?: { code?: string; message?: string }
}

export interface ProgressSnapshot {
  cert: CertCode
  revision: number
  progress: QuestionProgress[]
}

export interface ProgressSyncResult {
  cert: CertCode
  revision: number
  accepted: QuestionProgress[]
  rejected: Array<{ index: number; qid?: number; code: string }>
  snapshotRequired: boolean
  errorCode?: string
}

export type ProgressSyncClientErrorKind =
  | 'auth'
  | 'payload'
  | 'unknown-cert'
  | 'temporary'
  | 'invalid-response'
  | 'unknown'

export class ProgressSyncClientError extends Error {
  constructor(
    readonly kind: ProgressSyncClientErrorKind,
    readonly status?: number,
    message = 'Failed to sync account progress',
    readonly serverCode?: string,
    readonly serverMessage?: string,
  ) {
    super(message)
    this.name = 'ProgressSyncClientError'
  }
}

function classifyStatus(status: number): ProgressSyncClientErrorKind {
  if (status === 401) return 'auth'
  if (status === 400) return 'payload'
  if (status === 404) return 'unknown-cert'
  if (status === 429 || status >= 500) return 'temporary'
  return 'unknown'
}

async function throwForResponse(response: Response): Promise<never> {
  let serverCode: string | undefined
  let serverMessage: string | undefined
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    serverCode = typeof body.error?.code === 'string' ? body.error.code : undefined
    serverMessage = typeof body.error?.message === 'string' ? body.error.message : undefined
  } catch {
    // Error bodies are diagnostic-only; status remains the recovery signal.
  }
  throw new ProgressSyncClientError(
    classifyStatus(response.status),
    response.status,
    'Failed to sync account progress',
    serverCode,
    serverMessage,
  )
}

function asTemporaryError(error: unknown, message = 'Failed to sync account progress'): never {
  if (error instanceof ProgressSyncClientError) throw error
  throw new ProgressSyncClientError('temporary', undefined, message)
}

function toEpoch(value: string | null): number | null {
  if (value === null) return null
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch)) throw new Error('Invalid progress snapshot')
  return epoch
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function fromDtoProgress(entry: ProgressSnapshotDto['progress'][number]): QuestionProgress {
  return {
    qid: entry.qid,
    correctCount: entry.correctCount,
    wrongCount: entry.wrongCount,
    lastPicks: [...entry.lastPicks].sort() as Letter[],
    lastCorrect: entry.lastCorrect,
    lastAnsweredAt: toEpoch(entry.lastAnsweredAt),
    bookmarked: entry.bookmarked,
    bookmarkUpdatedAt: toEpoch(entry.bookmarkUpdatedAt),
  }
}

export async function fetchProgressSnapshot(cert: CertCode): Promise<ProgressSnapshot> {
  try {
    const response = await fetch(`/api/progress/${cert.toLowerCase()}/snapshot`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok) await throwForResponse(response)

    const dto = (await response.json()) as ProgressSnapshotDto
    if (dto.cert !== cert || !Number.isFinite(dto.revision)) {
      throw new Error('Invalid progress snapshot')
    }

    return {
      cert: dto.cert,
      revision: dto.revision,
      progress: dto.progress.map(fromDtoProgress),
    }
  } catch (error) {
    asTemporaryError(error, 'Invalid progress snapshot')
  }
}

export async function postProgressSync(
  cert: CertCode,
  baseRevision: number,
  progress: QuestionProgress[],
): Promise<ProgressSyncResult> {
  try {
    const response = await fetch(`/api/progress/${cert.toLowerCase()}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({
        baseRevision,
        progress: progress.map((entry) => ({
          qid: entry.qid,
          correctCount: entry.correctCount,
          wrongCount: entry.wrongCount,
          lastPicks: entry.lastPicks,
          lastCorrect: entry.lastCorrect,
          lastAnsweredAt: toIso(entry.lastAnsweredAt),
          bookmarked: entry.bookmarked,
          bookmarkUpdatedAt: toIso(entry.bookmarkUpdatedAt),
        })),
      }),
    })
    if (!response.ok && response.status !== 409) await throwForResponse(response)

    const dto = (await response.json()) as ProgressSyncDto
    if (dto.cert !== cert || !Number.isFinite(dto.revision)) {
      throw new Error('Invalid progress sync response')
    }

    return {
      cert: dto.cert,
      revision: dto.revision,
      accepted: dto.accepted.map(fromDtoProgress),
      rejected: dto.rejected,
      snapshotRequired: dto.snapshotRequired,
      ...(dto.error?.code ? { errorCode: dto.error.code } : {}),
    }
  } catch (error) {
    asTemporaryError(error, 'Invalid progress sync response')
  }
}
