'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadBank } from '@/data/loaders'
import type { CertCode, Letter } from '@/data/types'
import { progressRepo } from '@/repositories/local-progress-repository'

export function useAnswer(qid: number) {
  return useQuery({
    queryKey: ['answer', qid],
    queryFn: () => progressRepo.getAnswer(qid),
    staleTime: 0,
  })
}

interface SaveArgs {
  qid: number
  picks: Letter[]
  correct: boolean
}

export function useSaveAnswer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ qid, picks, correct }: SaveArgs) => {
      progressRepo.saveAnswer(qid, picks, correct)
    },
    onSuccess: (_, { qid }) => {
      qc.invalidateQueries({ queryKey: ['answer', qid] })
      qc.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export function useToggleBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (qid: number) => {
      progressRepo.toggleBookmark(qid)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'bookmarks'] })
    },
  })
}

export function useIsBookmarked(qid: number) {
  return useQuery({
    queryKey: ['progress', 'bookmarks', qid],
    queryFn: () => progressRepo.isBookmarked(qid),
    staleTime: 0,
  })
}

export async function findNextUnansweredQid(
  currentQid: number,
  cert: CertCode = 'DVA-C02',
): Promise<number | null> {
  const bank = await loadBank(cert)
  const n = bank.length
  if (n === 0) return null
  const answered = new Set(progressRepo.listAnswers().map((a) => a.qid))
  for (let i = 1; i <= n; i++) {
    const qid = ((currentQid - 1 + i + n) % n) + 1
    if (!answered.has(qid)) return qid
  }
  return null
}
