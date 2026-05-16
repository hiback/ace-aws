'use client'
import { useQuery } from '@tanstack/react-query'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'

export function useProgressStats(cert: CertCode) {
  const { repository, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'stats', cert],
    queryFn: async () => {
      const [bank, base] = await Promise.all([
        loadBank(cert),
        Promise.resolve(repository.getStats(cert)),
      ])
      return { ...base, total: bank.length }
    },
    staleTime: 0,
  })
}

export function useWrongList(cert: CertCode) {
  const { repository, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'wrong', cert],
    queryFn: () => repository.listWrong(cert),
    staleTime: 0,
  })
}

export function useBookmarksList(cert: CertCode) {
  const { repository, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'bookmarks', cert],
    queryFn: () => repository.listBookmarks(cert),
    staleTime: 0,
  })
}
