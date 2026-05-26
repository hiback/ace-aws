import type { CertCode, ProgressScope } from '@/data/types'
import { READY_CERTS } from '@/lib/cert-catalog'
import { getAccountMockExamSyncLedger } from './account-sync-ledger'
import {
  deleteLocalMockExamDraft,
  getLocalMockExamAttempt,
  getLocalMockExamDraft,
  saveLocalMockExamAttempt,
} from './local-repository'
import type { MockExamAttempt } from './start-attempt'
import type { SubmittedMockExamAttempt } from './submission'

export type MockExamDraftRepository = {
  getDraft(cert: CertCode): Promise<MockExamAttempt | null>
  getAttempt(attemptId: string): Promise<MockExamAttempt | null>
  getSubmittedAttempt(attemptId: string): Promise<SubmittedMockExamAttempt | null>
  getHistory(cert: CertCode): Promise<SubmittedMockExamAttempt[]>
  saveDraft(draft: MockExamAttempt): Promise<void>
  saveSubmittedAttempt(attempt: SubmittedMockExamAttempt): Promise<void>
  deleteDraft(cert: CertCode): Promise<void>
}

const localRepository: MockExamDraftRepository = {
  async getDraft(cert) {
    return getLocalMockExamDraft(cert)
  },
  async getAttempt(attemptId) {
    return getLocalMockExamAttempt(attemptId)
  },
  async getSubmittedAttempt(attemptId) {
    const { getLocalMockExamSubmittedAttempt } = await import('./local-repository')
    return getLocalMockExamSubmittedAttempt(attemptId)
  },
  async getHistory(cert) {
    const { getLocalMockExamHistory } = await import('./local-repository')
    return getLocalMockExamHistory(cert)
  },
  async saveDraft(draft) {
    saveLocalMockExamAttempt(draft)
  },
  async saveSubmittedAttempt(attempt) {
    const { saveLocalMockExamSubmittedAttempt } = await import('./local-repository')
    saveLocalMockExamSubmittedAttempt(attempt)
  },
  async deleteDraft(cert) {
    deleteLocalMockExamDraft(cert)
  },
}

const accountRepository: MockExamDraftRepository = {
  async getDraft(cert) {
    try {
      const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/draft/snapshot`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam Draft')
      const body = (await response.json()) as {
        cert: CertCode
        revision: number
        draft: MockExamAttempt | null
      }
      if (body.cert !== cert || !Number.isFinite(body.revision)) {
        throw new Error('Invalid account-backed Mock Exam Draft snapshot')
      }
      getAccountMockExamSyncLedger().setRevision(cert, body.revision)
      getAccountMockExamSyncLedger().setDraftSnapshot(cert, body.draft)
      return getAccountMockExamSyncLedger().readDraft(cert)
    } catch {
      return getAccountMockExamSyncLedger().readDraft(cert)
    }
  },
  async getAttempt(attemptId) {
    return (
      READY_CERTS.map((cert) => getAccountMockExamSyncLedger().readDraft(cert)).find(
        (draft) => draft?.id === attemptId,
      ) ?? null
    )
  },
  async getSubmittedAttempt(attemptId) {
    const cached = READY_CERTS.flatMap((cert) =>
      getAccountMockExamSyncLedger().readHistory(cert),
    ).find((attempt) => attempt.id === attemptId)
    if (cached) return cached
    for (const cert of READY_CERTS) {
      const attempt = (await this.getHistory(cert)).find((item) => item.id === attemptId)
      if (attempt) return attempt
    }
    return null
  },
  async getHistory(cert) {
    try {
      const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/history/snapshot`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam History')
      const body = (await response.json()) as {
        cert: CertCode
        revision: number
        submittedAttempts: SubmittedMockExamAttempt[]
      }
      if (body.cert !== cert || !Number.isFinite(body.revision)) {
        throw new Error('Invalid account-backed Mock Exam History snapshot')
      }
      getAccountMockExamSyncLedger().applyHistorySnapshot(
        cert,
        body.revision,
        body.submittedAttempts,
      )
      return getAccountMockExamSyncLedger().readHistory(cert)
    } catch {
      return getAccountMockExamSyncLedger().readHistory(cert)
    }
  },
  async saveDraft(draft) {
    getAccountMockExamSyncLedger().writeDraft(draft)
  },
  async saveSubmittedAttempt(attempt) {
    getAccountMockExamSyncLedger().appendSubmittedAttempt(attempt)
  },
  async deleteDraft(cert) {
    getAccountMockExamSyncLedger().clearDraft(cert)
  },
}

export function getMockExamDraftRepository(scope: ProgressScope): MockExamDraftRepository {
  return scope === 'account' ? accountRepository : localRepository
}
