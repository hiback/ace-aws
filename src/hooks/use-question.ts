'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { Question } from '@/data/types'

export function useQuestion(qid: number, certInput: string = 'DVA-C02') {
  const cert = normalizeCert(certInput)
  return useQuery({
    queryKey: ['question-bank', cert],
    queryFn: () => loadBank(cert),
    staleTime: Infinity,
    gcTime: Infinity,
    select: (bank: Question[]) => bank.find((q) => q.id === qid) ?? null,
  })
}
