'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useProgressRepository,
  useProgressScope,
} from '@/components/providers/progress-scope-provider'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { CertCode, Letter } from '@/data/types'
import {
  findNextInPracticeSet,
  type ListPracticeSource,
  parsePracticeSet,
} from '@/lib/practice-flow'
import { progressRepo } from '@/repositories/local-progress-repository'
import type { ProgressRepository } from '@/repositories/progress-repository'

export function useQuestionProgress(qid: number, cert: CertCode) {
  const { repository, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'question', cert, qid],
    queryFn: () => repository.getProgress(qid, cert),
    staleTime: 0,
  })
}

export function useActiveProgressRepository() {
  return useProgressRepository()
}

interface SaveArgs {
  qid: number
  picks: Letter[]
  correct: boolean
}

export function useRecordAnswer(cert: CertCode) {
  const qc = useQueryClient()
  const { repository, scope } = useProgressScope()
  return useMutation({
    mutationFn: async ({ qid, picks, correct }: SaveArgs) => {
      repository.recordAnswer(qid, picks, correct, cert)
      return repository.getProgress(qid, cert)
    },
    onSuccess: (savedProgress, { qid }) => {
      qc.setQueryData(['progress', scope, 'question', cert, qid], savedProgress)
      if (scope === 'anonymous') {
        qc.setQueryData(['progress', 'question', cert, qid], savedProgress)
      }
      qc.invalidateQueries({ queryKey: ['progress', scope, 'question', cert, qid] })
      qc.invalidateQueries({ queryKey: ['progress', scope] })
    },
  })
}

export function useToggleBookmark(cert: CertCode) {
  const qc = useQueryClient()
  const { repository, scope } = useProgressScope()
  return useMutation({
    mutationFn: async (qid: number) => {
      repository.toggleBookmark(qid, cert)
    },
    onSuccess: (_, qid) => {
      qc.invalidateQueries({ queryKey: ['progress', scope, 'question', cert, qid] })
      qc.invalidateQueries({ queryKey: ['progress', scope, 'bookmarks'] })
    },
  })
}

export function useIsBookmarked(qid: number, cert: CertCode) {
  const { repository, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'bookmarks', cert, qid],
    queryFn: () => repository.isBookmarked(qid, cert),
    staleTime: 0,
  })
}

export async function findNextUnansweredQid(
  currentQid: number,
  cert: string,
  repository: ProgressRepository = progressRepo,
): Promise<number | null> {
  const canonical = normalizeCert(cert)
  const bank = await loadBank(canonical)
  const n = bank.length
  if (n === 0) return null
  const answered = new Set(repository.listAnswered(canonical).map((progress) => progress.qid))
  for (let i = 1; i <= n; i++) {
    const qid = ((currentQid - 1 + i + n) % n) + 1
    if (!answered.has(qid)) return qid
  }
  return null
}

function bankQidSet(bank: Awaited<ReturnType<typeof loadBank>>): Set<number> {
  return new Set(bank.map((question) => question.id))
}

function liveListQids(
  source: ListPracticeSource,
  cert: CertCode,
  bankIds: ReadonlySet<number>,
  repository: ProgressRepository,
): number[] {
  if (source === '/list/wrong') {
    return repository
      .listWrong(cert)
      .sort((a, b) => (b.lastAnsweredAt ?? 0) - (a.lastAnsweredAt ?? 0))
      .map((progress) => progress.qid)
      .filter((qid) => bankIds.has(qid))
  }

  return repository.listBookmarks(cert).filter((qid) => bankIds.has(qid))
}

export async function findNextListReviewQid(
  currentQid: number,
  cert: string,
  source: ListPracticeSource,
  setRaw: string | null,
  repository: ProgressRepository = progressRepo,
): Promise<number | null> {
  const canonical = normalizeCert(cert)
  const bank = await loadBank(canonical)
  const bankIds = bankQidSet(bank)
  const snapshot = parsePracticeSet(setRaw, bankIds)
  const qids = snapshot ?? liveListQids(source, canonical, bankIds, repository)

  return findNextInPracticeSet(currentQid, qids)
}
