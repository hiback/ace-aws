'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { Question } from '@/data/types'

export function useQuestionBank(certInput: string = 'DVA-C02') {
  const cert = normalizeCert(certInput)
  return useQuery<Question[]>({
    queryKey: ['question-bank', cert],
    queryFn: () => loadBank(cert),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
