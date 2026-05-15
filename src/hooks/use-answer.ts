'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { CertCode, Letter } from '@/data/types'
import { progressRepo } from '@/repositories/local-progress-repository'

export function useAnswer(qid: number, cert: CertCode) {
  return useQuery({
    queryKey: ['answer', cert, qid],
    queryFn: () => progressRepo.getAnswer(qid, cert),
    staleTime: 0,
  })
}

interface SaveArgs {
  qid: number
  picks: Letter[]
  correct: boolean
}

export function useSaveAnswer(cert: CertCode) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ qid, picks, correct }: SaveArgs) => {
      progressRepo.saveAnswer(qid, picks, correct, cert)
    },
    onSuccess: (_, { qid }) => {
      qc.invalidateQueries({ queryKey: ['answer', cert, qid] })
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
    onSuccess: () => {
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
  const answered = new Set(progressRepo.listAnswers(canonical).map((a) => a.qid))
  for (let i = 1; i <= n; i++) {
    const qid = ((currentQid - 1 + i + n) % n) + 1
    if (!answered.has(qid)) return qid
  }
  return null
}
