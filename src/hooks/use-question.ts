'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank } from '@/data/loaders'
import type { CertCode, Question } from '@/data/types'

export function useQuestion(qid: number, cert: CertCode = 'DVA-C02') {
  return useQuery({
    queryKey: ['question-bank', cert],
    queryFn: () => loadBank(cert),
    staleTime: Infinity,
    gcTime: Infinity,
    select: (bank: Question[]) => bank.find((q) => q.id === qid) ?? null,
  })
}
