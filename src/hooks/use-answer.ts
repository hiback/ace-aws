'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { CertCode, Letter } from '@/data/types'
import {
  findNextInPracticeSet,
  type ListPracticeSource,
  parsePracticeSet,
} from '@/lib/practice-flow'
import { progressRepo } from '@/repositories/local-progress-repository'

export function useQuestionProgress(qid: number, cert: CertCode) {
  return useQuery({
    queryKey: ['progress', 'question', cert, qid],
    queryFn: () => progressRepo.getProgress(qid, cert),
    staleTime: 0,
  })
}

interface SaveArgs {
  qid: number
  picks: Letter[]
  correct: boolean
}

export function useRecordAnswer(cert: CertCode) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ qid, picks, correct }: SaveArgs) => {
      progressRepo.recordAnswer(qid, picks, correct, cert)
      return progressRepo.getProgress(qid, cert)
    },
    onSuccess: (savedProgress, { qid }) => {
      qc.setQueryData(['progress', 'question', cert, qid], savedProgress)
      qc.invalidateQueries({ queryKey: ['progress', 'question', cert, qid] })
      qc.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export function useToggleBookmark(cert: CertCode) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (qid: number) => {
      progressRepo.toggleBookmark(qid, cert)
    },
    onSuccess: (_, qid) => {
      qc.invalidateQueries({ queryKey: ['progress', 'question', cert, qid] })
      qc.invalidateQueries({ queryKey: ['progress', 'bookmarks'] })
    },
  })
}

export function useIsBookmarked(qid: number, cert: CertCode) {
  return useQuery({
    queryKey: ['progress', 'bookmarks', cert, qid],
    queryFn: () => progressRepo.isBookmarked(qid, cert),
    staleTime: 0,
  })
}

export async function findNextUnansweredQid(
  currentQid: number,
  cert: string,
): Promise<number | null> {
  const canonical = normalizeCert(cert)
  const bank = await loadBank(canonical)
  const n = bank.length
  if (n === 0) return null
  const answered = new Set(progressRepo.listAnswered(canonical).map((progress) => progress.qid))
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
): number[] {
  if (source === '/list/wrong') {
    return progressRepo
      .listWrong(cert)
      .sort((a, b) => (b.lastAnsweredAt ?? 0) - (a.lastAnsweredAt ?? 0))
      .map((progress) => progress.qid)
      .filter((qid) => bankIds.has(qid))
  }

  return progressRepo.listBookmarks(cert).filter((qid) => bankIds.has(qid))
}

export async function findNextListReviewQid(
  currentQid: number,
  cert: string,
  source: ListPracticeSource,
  setRaw: string | null,
): Promise<number | null> {
  const canonical = normalizeCert(cert)
  const bank = await loadBank(canonical)
  const bankIds = bankQidSet(bank)
  const snapshot = parsePracticeSet(setRaw, bankIds)
  const qids = snapshot ?? liveListQids(source, canonical, bankIds)

  return findNextInPracticeSet(currentQid, qids)
}
