'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { Question } from '@/data/types'

export function useQuestionBank(certInput: string | null | undefined) {
  const cert = certInput ? normalizeCert(certInput) : null
  return useQuery<Question[]>({
    queryKey: ['question-bank', cert],
    queryFn: () => {
      if (!cert) throw new Error('cert is required')
      return loadBank(cert)
    },
    enabled: cert !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
