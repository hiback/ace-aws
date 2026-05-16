'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ProgressScope } from '@/data/types'
import { LocalProgressRepository } from '@/repositories/local-progress-repository'
import type { ProgressRepository } from '@/repositories/progress-repository'

interface ProgressScopeValue {
  scope: ProgressScope
  repository: ProgressRepository
}

const fallbackRepository = new LocalProgressRepository('anonymous')

const ProgressScopeContext = createContext<ProgressScopeValue>({
  scope: 'anonymous',
  repository: fallbackRepository,
})

export function ProgressScopeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const userId = typeof session?.user?.id === 'string' ? session.user.id : null
  const [preparedOwnerId, setPreparedOwnerId] = useState<string | null>(null)
  const scope: ProgressScope =
    status === 'authenticated' && userId !== null && preparedOwnerId === userId
      ? 'account'
      : 'anonymous'
  const repository = useMemo(() => new LocalProgressRepository(scope), [scope])

  useEffect(() => {
    if (status !== 'authenticated' || userId === null) {
      setPreparedOwnerId(null)
      if (status === 'unauthenticated') {
        queryClient.removeQueries({ queryKey: ['progress', 'account'] })
      }
      return
    }

    const ownerChanged = LocalProgressRepository.prepareAccountOwner(userId)
    if (ownerChanged) {
      queryClient.removeQueries({ queryKey: ['progress', 'account'] })
    }
    setPreparedOwnerId(userId)
  }, [queryClient, status, userId])

  return (
    <ProgressScopeContext.Provider value={{ scope, repository }}>
      {children}
    </ProgressScopeContext.Provider>
  )
}

export function useProgressScope(): ProgressScopeValue {
  return useContext(ProgressScopeContext)
}

export function useProgressRepository(): ProgressRepository {
  return useProgressScope().repository
}
