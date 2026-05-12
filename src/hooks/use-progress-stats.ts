'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'
import { progressRepo } from '@/repositories/local-progress-repository'

export function useProgressStats(cert: CertCode = 'DVA-C02') {
  return useQuery({
    queryKey: ['progress', 'stats', cert],
    queryFn: async () => {
      const [bank, base] = await Promise.all([
        loadBank(cert),
        Promise.resolve(progressRepo.getStats()),
      ])
      return { ...base, total: bank.length }
    },
    staleTime: 0,
  })
}

export function useWrongList() {
  return useQuery({
    queryKey: ['progress', 'wrong'],
    queryFn: () => progressRepo.listWrong(),
    staleTime: 0,
  })
}

export function useBookmarksList() {
  return useQuery({
    queryKey: ['progress', 'bookmarks'],
    queryFn: () => progressRepo.listBookmarks(),
    staleTime: 0,
  })
}
