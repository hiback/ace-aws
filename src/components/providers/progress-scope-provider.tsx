'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ProgressScope } from '@/data/types'
import {
  BrowserProgressModule,
  type BrowserQuestionProgressModule,
} from '@/lib/browser-progress-module'

interface ProgressScopeValue {
  scope: ProgressScope
  progress: BrowserQuestionProgressModule
}

const fallbackProgress = new BrowserProgressModule('anonymous')

const ProgressScopeContext = createContext<ProgressScopeValue>({
  scope: 'anonymous',
  progress: fallbackProgress,
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
  const progress = useMemo(() => new BrowserProgressModule(scope), [scope])

  useEffect(() => {
    if (status !== 'authenticated' || userId === null) {
      setPreparedOwnerId(null)
      if (status === 'unauthenticated') {
        queryClient.removeQueries({ queryKey: ['progress', 'account'] })
      }
      return
    }

    const ownerChanged = BrowserProgressModule.prepareAccountOwner(userId)
    if (ownerChanged) {
      queryClient.removeQueries({ queryKey: ['progress', 'account'] })
    }
    setPreparedOwnerId(userId)
  }, [queryClient, status, userId])

  return (
    <ProgressScopeContext.Provider value={{ scope, progress }}>
      {children}
    </ProgressScopeContext.Provider>
  )
}

export function useProgressScope(): ProgressScopeValue {
  return useContext(ProgressScopeContext)
}

export function useProgressModule(): BrowserQuestionProgressModule {
  return useProgressScope().progress
}
