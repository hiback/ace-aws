'use client'

import { useSession } from 'next-auth/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { CertCode } from '@/data/types'
import { fetchAccountPreferences, saveAccountCurrentCert } from '@/lib/account-preferences-client'
import { isReadyCertCode } from '@/lib/cert-catalog'
import { completeOnboardingStep } from '@/lib/onboarding-client'
import { usePrefsStore } from '@/stores/prefs-store'

type AccountPreferencesStatus = 'idle' | 'loading' | 'resolved' | 'error'

interface AccountPreferencesContextValue {
  status: AccountPreferencesStatus
  resolvedCert: CertCode | null
  error: Error | null
  saveCurrentCert: (cert: CertCode) => Promise<CertCode>
}

const AccountPreferencesContext = createContext<AccountPreferencesContextValue>({
  status: 'idle',
  resolvedCert: null,
  error: null,
  async saveCurrentCert(cert) {
    const response = await saveAccountCurrentCert(cert)
    return response.currentCert ?? cert
  },
})

export function AccountPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const userId = typeof session?.user?.id === 'string' ? session.user.id : null
  const currentCert = usePrefsStore((s) => s.currentCert)
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const currentCertRef = useRef(currentCert)
  const resolvedUserIdRef = useRef<string | null>(null)
  const [state, setState] = useState<Omit<AccountPreferencesContextValue, 'saveCurrentCert'>>({
    status: 'idle',
    resolvedCert: null,
    error: null,
  })

  useEffect(() => {
    currentCertRef.current = currentCert
  }, [currentCert])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || userId === null) {
      resolvedUserIdRef.current = null
      setState({
        status: sessionStatus === 'loading' ? 'loading' : 'idle',
        resolvedCert: null,
        error: null,
      })
      return
    }

    if (resolvedUserIdRef.current === userId) return
    resolvedUserIdRef.current = userId
    let active = true
    setState({ status: 'loading', resolvedCert: null, error: null })

    async function resolvePreferences() {
      try {
        const cloud = await fetchAccountPreferences()
        let resolvedCert = cloud.currentCert

        if (resolvedCert) {
          setCurrentCert(resolvedCert)
          await completeOnboardingStep('complete-cert-selection')
        } else {
          const localCert = currentCertRef.current
          if (localCert && isReadyCertCode(localCert)) {
            const saved = await saveAccountCurrentCert(localCert)
            resolvedCert = saved.currentCert ?? localCert
            await completeOnboardingStep('complete-cert-selection')
          }
        }

        if (active) setState({ status: 'resolved', resolvedCert, error: null })
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            resolvedCert: null,
            error:
              error instanceof Error ? error : new Error('Failed to resolve account preferences'),
          })
        }
      }
    }

    void resolvePreferences()

    return () => {
      active = false
    }
  }, [sessionStatus, setCurrentCert, userId])

  async function saveCurrentCert(cert: CertCode) {
    const response = await saveAccountCurrentCert(cert)
    const savedCert = response.currentCert ?? cert
    setState({ status: 'resolved', resolvedCert: savedCert, error: null })
    return savedCert
  }

  return (
    <AccountPreferencesContext.Provider value={{ ...state, saveCurrentCert }}>
      {children}
    </AccountPreferencesContext.Provider>
  )
}

export function useAccountPreferences() {
  return useContext(AccountPreferencesContext)
}
