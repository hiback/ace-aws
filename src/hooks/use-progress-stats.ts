'use client'
import { useQuery } from '@tanstack/react-query'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'

export function useProgressStats(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'stats', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const base = progress.getStats(cert)
      return { ...base, total: bank.length }
    },
    staleTime: 0,
  })
}

export function useWrongList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'wrong', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const bankIds = new Set(bank.map((question) => question.id))
      return progress.listWrong(cert).filter((entry) => bankIds.has(entry.qid))
    },
    staleTime: 0,
  })
}

export function useWrongRedoCount(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'wrong-redo-count', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const allProgress = progress.listProgress(cert)
      const bankIds = new Set(bank.map((question) => question.id))
      return allProgress.filter((entry) => entry.lastCorrect === false && bankIds.has(entry.qid))
        .length
    },
    staleTime: 0,
  })
}

export function useBookmarksList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'bookmarks', cert],
    queryFn: () => progress.listBookmarks(cert),
    staleTime: 0,
  })
}

export function useProgressList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'list', cert],
    queryFn: () => progress.listProgress(cert),
    staleTime: 0,
  })
}
