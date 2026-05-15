'use client'
import { useQuery } from '@tanstack/react-query'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'
import { progressRepo } from '@/repositories/local-progress-repository'

export function useProgressStats(cert: CertCode) {
  return useQuery({
    queryKey: ['progress', 'stats', cert],
    queryFn: async () => {
      const [bank, base] = await Promise.all([
        loadBank(cert),
        Promise.resolve(progressRepo.getStats(cert)),
      ])
      return { ...base, total: bank.length }
    },
    staleTime: 0,
  })
}

export function useWrongList(cert: CertCode) {
  return useQuery({
    queryKey: ['progress', 'wrong', cert],
    queryFn: () => progressRepo.listWrong(cert),
    staleTime: 0,
  })
}

export function useBookmarksList(cert: CertCode) {
  return useQuery({
    queryKey: ['progress', 'bookmarks', cert],
    queryFn: () => progressRepo.listBookmarks(cert),
    staleTime: 0,
  })
}
