'use client'
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccountProgressSync } from '@/components/providers/account-progress-sync-provider'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import type { CertCode, ProgressScope } from '@/data/types'
import { READY_CERTS } from '@/lib/cert-catalog'
import {
  getAccountMockExamSyncLedger,
  syncDirtyMockExam,
} from '@/lib/mock-exam/account-sync-ledger'
import { getMockExamDraftRepository } from '@/lib/mock-exam/repository'
import type { MockExamAttempt } from '@/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'

export function useMockExamDraft(cert: CertCode) {
  const { scope } = useProgressScope()

  return useQuery({
    queryKey: ['mock-exam', scope, 'draft', cert],
    queryFn: () => getMockExamDraftRepository(scope).getDraft(cert),
    staleTime: 0,
  })
}

export function useMockExamHistory(cert: CertCode) {
  const { scope } = useProgressScope()

  return useQuery({
    queryKey: mockExamHistoryQueryKey(scope, cert),
    queryFn: () => getMockExamDraftRepository(scope).getHistory(cert),
    staleTime: 0,
  })
}

export function useSubmittedMockExamAttemptSnapshot(attemptId: string) {
  const { scope } = useProgressScope()
  const qc = useQueryClient()
  const cached = findSubmittedAttemptInHistoryCache(qc, scope, attemptId)
  const submittedQuery = useQuery({
    queryKey: ['mock-exam', scope, 'submitted-attempt', attemptId],
    queryFn: () => getMockExamDraftRepository(scope).getSubmittedAttempt(attemptId),
    initialData: cached ?? undefined,
    staleTime: 0,
  })

  return {
    data: submittedQuery.data ?? null,
    isPending: submittedQuery.isPending,
    isLoading: submittedQuery.isPending,
    isFetching: submittedQuery.isFetching,
    isError: submittedQuery.isError,
    error: submittedQuery.error,
  }
}

export function useSaveMockExamDraft() {
  const qc = useQueryClient()
  const { scope } = useProgressScope()
  const { enqueueDirtySync } = useAccountProgressSync()

  return useMutation({
    mutationFn: async (draft: MockExamAttempt) => {
      await getMockExamDraftRepository(scope).saveDraft(draft)
      return draft
    },
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ['mock-exam', scope, 'draft', draft.cert] })
      if (scope === 'account') enqueueDirtySync(draft.cert)
    },
  })
}

export function useDeleteMockExamDraft() {
  const qc = useQueryClient()
  const { scope } = useProgressScope()
  const { enqueueDirtySync } = useAccountProgressSync()

  return useMutation({
    mutationFn: async (cert: CertCode) => {
      await getMockExamDraftRepository(scope).deleteDraft(cert)
      return cert
    },
    onSuccess: (cert) => {
      qc.invalidateQueries({ queryKey: ['mock-exam', scope, 'draft', cert] })
      if (scope === 'account') enqueueDirtySync(cert)
    },
  })
}

export function useSubmitMockExamAttempt() {
  const qc = useQueryClient()
  const { scope } = useProgressScope()

  return useMutation({
    mutationFn: async (submitted: SubmittedMockExamAttempt) => {
      const repository = getMockExamDraftRepository(scope)
      const existing = await repository.getSubmittedAttempt(submitted.id)
      const persisted = existing ?? submitted
      if (existing === null) {
        await repository.saveSubmittedAttempt(submitted)
      }
      await repository.deleteDraft(persisted.cert)
      if (scope === 'account') {
        const result = await syncDirtyMockExam(persisted.cert)
        if (!result.ok) throw new Error('Failed to sync account-backed Mock Exam submission')
        if (getAccountMockExamSyncLedger().readDraft(persisted.cert) !== null) {
          throw new Error('Failed to clear account-backed Mock Exam Draft')
        }
      }
      return persisted
    },
    onSuccess: (submitted) => {
      qc.invalidateQueries({ queryKey: ['mock-exam', scope, 'draft', submitted.cert] })
      qc.invalidateQueries({ queryKey: mockExamHistoryQueryKey(scope, submitted.cert) })
    },
  })
}

function mockExamHistoryQueryKey(scope: ProgressScope, cert: CertCode) {
  return ['mock-exam', scope, 'history', cert] as const
}

function findSubmittedAttemptInHistoryCache(
  qc: QueryClient,
  scope: ProgressScope,
  attemptId: string,
): SubmittedMockExamAttempt | null {
  for (const query of qc.getQueryCache().getAll()) {
    const key = query.queryKey
    if (!isMockExamHistoryQueryKey(key, scope)) continue
    const history = query.state.data
    if (!Array.isArray(history)) continue
    const attempt = history.find(
      (item): item is SubmittedMockExamAttempt =>
        isSubmittedMockExamAttempt(item) && item.id === attemptId,
    )
    if (attempt) return attempt
  }
  return null
}

function isMockExamHistoryQueryKey(
  key: readonly unknown[],
  scope: ProgressScope,
): key is readonly ['mock-exam', ProgressScope, 'history', CertCode] {
  return (
    key[0] === 'mock-exam' &&
    key[1] === scope &&
    key[2] === 'history' &&
    typeof key[3] === 'string' &&
    READY_CERTS.includes(key[3] as CertCode)
  )
}

function isSubmittedMockExamAttempt(value: unknown): value is SubmittedMockExamAttempt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'cert' in value &&
    typeof value.cert === 'string'
  )
}
