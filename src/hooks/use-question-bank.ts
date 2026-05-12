'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank } from '@/data/loaders'
import type { CertCode, Question } from '@/data/types'

export function useQuestionBank(cert: CertCode = 'DVA-C02') {
  return useQuery<Question[]>({
    queryKey: ['question-bank', cert],
    queryFn: () => loadBank(cert),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
