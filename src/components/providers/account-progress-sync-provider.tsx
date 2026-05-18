'use client'

import { useQueryClient } from '@tanstack/react-query'
import { signOut, useSession } from 'next-auth/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import type { CertCode } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import type { ProgressSnapshot } from '@/lib/account-progress-sync-client'
import {
  fetchProgressSnapshot,
  ProgressSyncClientError,
  postProgressSync,
} from '@/lib/account-progress-sync-client'
import { READY_CERTS } from '@/lib/cert-catalog'
import { storeSyncExpiredLoginMessage } from '@/lib/sync-login-message'
import { LocalProgressRepository } from '@/repositories/local-progress-repository'
import { usePrefsStore } from '@/stores/prefs-store'

type GateState = 'idle' | 'syncing' | 'ready' | 'error'
export type AccountProgressSyncStatus = 'syncing' | 'failed' | 'dirty' | 'synced'
export type AccountProgressSyncResult = { ok: true } | { ok: false; reason: 'temporary' | 'fatal' }
export type AnonymousImportResult = AccountProgressSyncResult
type FlushCertResult = 'clean' | 'synced' | 'temporary-failure' | 'fatal-failure' | 'auth-signout'
const FIRST_BASELINE_BACKOFF_MS = 15_000
const MAX_BASELINE_BACKOFF_MS = 300_000
const DIRTY_SYNC_DEBOUNCE_MS = 750
const FIRST_DIRTY_RETRY_BACKOFF_MS = 5_000
const MAX_DIRTY_RETRY_BACKOFF_MS = 60_000

interface AccountProgressSyncValue {
  enqueueDirtySync: (cert: CertCode) => void
  status: AccountProgressSyncStatus
  lastSyncedAt: number | null
  hasDirtyProgress: boolean
  isImporting: boolean
  anonymousImportAvailable: boolean
  importAnonymousProgress: () => Promise<AnonymousImportResult>
  dismissAnonymousImport: () => void
  syncNow: () => Promise<AccountProgressSyncResult>
  syncBeforeSignOut: () => Promise<AccountProgressSyncResult>
  discardAccountSyncState: () => void
}

const AccountProgressSyncContext = createContext<AccountProgressSyncValue>({
  enqueueDirtySync: () => {},
  status: 'synced',
  lastSyncedAt: null,
  hasDirtyProgress: false,
  isImporting: false,
  anonymousImportAvailable: false,
  importAnonymousProgress: async () => ({ ok: false, reason: 'temporary' }),
  dismissAnonymousImport: () => {},
  syncNow: async () => ({ ok: false, reason: 'temporary' }),
  syncBeforeSignOut: async () => ({ ok: true }),
  discardAccountSyncState: () => {},
})

function listDirtyReadyCerts(): CertCode[] {
  return READY_CERTS.filter(
    (cert) => LocalProgressRepository.listDirtyAccountProgress(cert).length > 0,
  )
}

function getLastSyncedAt(userId: string | null): number | null {
  if (userId === null) return null
  const values = READY_CERTS.map(
    (cert) => LocalProgressRepository.getAccountSyncBaseline(userId, cert)?.lastSyncedAt ?? null,
  ).filter((value): value is number => value !== null)
  return values.length === 0 ? null : Math.max(...values)
}

function userIdFromSession(session: unknown): string | null {
  const user = (session as { user?: { id?: unknown } } | null)?.user
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null
}

export function AccountProgressSyncProvider({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: session, status } = useSession()
  const { scope } = useProgressScope()
  const currentCert = usePrefsStore((s) => s.currentCert)
  const userId = userIdFromSession(session)
  const [gateState, setGateState] = useState<GateState>('ready')
  const [attempt, setAttempt] = useState(0)
  const [failureCount, setFailureCount] = useState(0)
  const [escapingSignOut, setEscapingSignOut] = useState(false)
  const [conflictRecoveryCerts, setConflictRecoveryCerts] = useState<CertCode[]>([])
  const [manualSyncing, setManualSyncing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [globalImportFailed, setGlobalImportFailed] = useState(false)
  const [manualFailed, setManualFailed] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [syncVersion, setSyncVersion] = useState(0)
  const [anonymousImportVersion, setAnonymousImportVersion] = useState(0)
  const [inFlightCount, setInFlightCount] = useState(0)
  const debounceRef = useRef<number | null>(null)
  const queueRef = useRef(Promise.resolve())
  const inFlightCertsRef = useRef(new Set<CertCode>())
  const currentUserIdRef = useRef<string | null>(userId)
  const currentCertRef = useRef<CertCode | null>(currentCert)
  const fatalCertsRef = useRef(new Set<CertCode>())
  const dirtyFailureCountsRef = useRef(new Map<CertCode, number>())
  const dirtyRetryTimersRef = useRef(new Map<CertCode, number>())
  const flushDirtyQueueRef = useRef<(priorityCert?: CertCode) => void>(() => {})
  const recoveryOwnerRef = useRef<string | null>(userId)
  currentUserIdRef.current = userId
  currentCertRef.current = currentCert
  const hasCurrentAccountCert =
    status === 'authenticated' && userId !== null && currentCert !== null
  const needsBaselineSync =
    hasCurrentAccountCert && !LocalProgressRepository.getAccountSyncBaseline(userId, currentCert)
  const waitsForAccountScope = hasCurrentAccountCert && scope !== 'account'
  const currentCertInConflictRecovery =
    currentCert !== null && conflictRecoveryCerts.includes(currentCert)
  void syncVersion
  const hasDirtyProgress =
    status === 'authenticated' && userId !== null && listDirtyReadyCerts().length > 0
  const lastSyncedAt = status === 'authenticated' ? getLastSyncedAt(userId) : null
  const anonymousImportSummary =
    status === 'authenticated' &&
    userId !== null &&
    !LocalProgressRepository.hasDismissedAnonymousImport(userId)
      ? LocalProgressRepository.summarizeAnonymousImport()
      : { certs: [], certCount: 0, recordCount: 0 }
  const anonymousImportAvailable =
    status === 'authenticated' &&
    userId !== null &&
    LocalProgressRepository.summarizeAnonymousImport().certCount > 0
  void anonymousImportVersion
  const shouldPromptAnonymousImport =
    status === 'authenticated' &&
    userId !== null &&
    anonymousImportSummary.certCount > 0 &&
    !needsBaselineSync &&
    !waitsForAccountScope &&
    !currentCertInConflictRecovery &&
    gateState === 'ready'
  const syncStatus: AccountProgressSyncStatus =
    gateState === 'syncing' || manualSyncing || inFlightCount > 0
      ? 'syncing'
      : gateState === 'error' || manualFailed || syncFailed
        ? 'failed'
        : hasDirtyProgress
          ? 'dirty'
          : 'synced'

  const addConflictRecoveryCert = useCallback((cert: CertCode) => {
    setConflictRecoveryCerts((certs) => (certs.includes(cert) ? certs : [...certs, cert]))
  }, [])

  const removeConflictRecoveryCert = useCallback((cert: CertCode) => {
    setConflictRecoveryCerts((certs) => certs.filter((entry) => entry !== cert))
  }, [])

  const flushCert = useCallback(
    async (
      accountUserId: string,
      cert: CertCode,
      options: { scheduleRetry?: boolean; showTemporaryToast?: boolean } = {},
    ): Promise<FlushCertResult> => {
      const scheduleRetry = options.scheduleRetry ?? true
      const showTemporaryToast = options.showTemporaryToast ?? true
      const isCurrentAccount = () =>
        currentUserIdRef.current === accountUserId &&
        LocalProgressRepository.isAccountOwner(accountUserId)
      if (inFlightCertsRef.current.has(cert)) return 'clean'
      if (!isCurrentAccount()) return 'clean'
      if (fatalCertsRef.current.has(cert)) return 'fatal-failure'
      const dirty = LocalProgressRepository.listDirtyAccountProgress(cert)
      if (dirty.length === 0) return 'clean'
      inFlightCertsRef.current.add(cert)
      setInFlightCount((value) => value + 1)
      try {
        const baseline = LocalProgressRepository.getAccountSyncBaseline(accountUserId, cert)
        const result = await postProgressSync(cert, baseline?.revision ?? 0, dirty)
        if (!isCurrentAccount()) return 'clean'
        dirtyFailureCountsRef.current.delete(cert)
        if (result.errorCode === 'revision_conflict') {
          addConflictRecoveryCert(cert)
          if (cert === currentCert) setGateState('syncing')
          LocalProgressRepository.clearAccountCert(accountUserId, cert)
          let snapshot: ProgressSnapshot
          try {
            snapshot = await fetchProgressSnapshot(cert)
          } catch (error) {
            removeConflictRecoveryCert(cert)
            if (error instanceof ProgressSyncClientError && error.kind === 'auth') throw error
            if (cert === currentCertRef.current) setGateState('error')
            setSyncFailed(true)
            return 'temporary-failure'
          }
          if (!isCurrentAccount()) {
            removeConflictRecoveryCert(cert)
            return 'clean'
          }
          LocalProgressRepository.replaceAccountCertFromSnapshot(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
          )
          removeConflictRecoveryCert(cert)
          if (cert === currentCertRef.current) setGateState('ready')
        } else if (result.snapshotRequired || result.rejected.length > 0) {
          if (result.rejected.length > 0) toast(t('accountProgressSyncPartialToast'))
          LocalProgressRepository.clearAccountSyncBaseline(accountUserId, cert)
          const snapshot = await fetchProgressSnapshot(cert)
          if (!isCurrentAccount()) return 'clean'
          LocalProgressRepository.replaceAccountCertFromSnapshotPreservingDirty(
            accountUserId,
            snapshot.cert,
            snapshot.revision,
            snapshot.progress,
            dirty,
            baseline === null,
          )
        } else {
          LocalProgressRepository.applyAcceptedAccountSync(
            accountUserId,
            cert,
            result.revision,
            result.accepted,
            dirty,
          )
        }
        await queryClient.invalidateQueries({ queryKey: ['progress', 'account'] })
        setManualFailed(false)
        setSyncFailed(false)
        setSyncVersion((value) => value + 1)
        return 'synced'
      } catch (error) {
        if (!isCurrentAccount()) return 'clean'
        if (error instanceof ProgressSyncClientError) {
          if (error.kind === 'auth') {
            storeSyncExpiredLoginMessage()
            LocalProgressRepository.clearScope('account')
            queryClient.removeQueries({ queryKey: ['progress', 'account'] })
            setEscapingSignOut(true)
            void signOut({ callbackUrl: '/login' })
            return 'auth-signout'
          }
          if (error.kind === 'temporary') {
            const failures = (dirtyFailureCountsRef.current.get(cert) ?? 0) + 1
            dirtyFailureCountsRef.current.set(cert, failures)
            const backoffMs = Math.min(
              FIRST_DIRTY_RETRY_BACKOFF_MS * 2 ** Math.max(0, failures - 1),
              MAX_DIRTY_RETRY_BACKOFF_MS,
            )
            if (scheduleRetry && !dirtyRetryTimersRef.current.has(cert)) {
              const timer = window.setTimeout(() => {
                dirtyRetryTimersRef.current.delete(cert)
                flushDirtyQueueRef.current(cert)
              }, backoffMs)
              dirtyRetryTimersRef.current.set(cert, timer)
            }
            if (showTemporaryToast) toast(t('accountProgressSyncTemporaryToast'))
            if (
              cert === currentCertRef.current &&
              !LocalProgressRepository.getAccountSyncBaseline(accountUserId, cert)
            ) {
              setGateState('error')
            }
            setSyncFailed(true)
            return 'temporary-failure'
          }
          if (error.kind === 'payload' || error.kind === 'unknown-cert') {
            fatalCertsRef.current.add(cert)
            if (showTemporaryToast) {
              toast(
                error.kind === 'unknown-cert'
                  ? t('accountProgressSyncUnknownCertToast')
                  : t('accountProgressSyncPayloadToast'),
              )
            }
            setSyncFailed(true)
            return 'fatal-failure'
          }
        }
        if (cert === currentCert) setGateState('error')
        setSyncFailed(true)
        return 'temporary-failure'
      } finally {
        inFlightCertsRef.current.delete(cert)
        setInFlightCount((value) => Math.max(0, value - 1))
        setSyncVersion((value) => value + 1)
      }
    },
    [addConflictRecoveryCert, currentCert, queryClient, removeConflictRecoveryCert, t, toast],
  )

  const flushDirtyQueue = useCallback(
    (priorityCert?: CertCode) => {
      if (status !== 'authenticated' || userId === null) return
      const accountUserId = userId
      const orderedCerts = [
        ...(currentCert ? [currentCert] : []),
        ...(priorityCert && priorityCert !== currentCert ? [priorityCert] : []),
        ...READY_CERTS.filter((cert) => cert !== priorityCert && cert !== currentCert),
      ]
      queueRef.current = queueRef.current
        .catch(() => {})
        .then(async () => {
          for (const cert of orderedCerts) {
            if (
              currentUserIdRef.current !== accountUserId ||
              !LocalProgressRepository.isAccountOwner(accountUserId)
            ) {
              break
            }
            try {
              await flushCert(accountUserId, cert)
            } catch {
              if (cert === currentCert) setGateState('error')
            }
          }
        })
    },
    [currentCert, flushCert, status, userId],
  )

  flushDirtyQueueRef.current = flushDirtyQueue

  const enqueueDirtySync = useCallback(
    (cert: CertCode) => {
      if (status !== 'authenticated' || userId === null) return
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null
        flushDirtyQueue(cert)
      }, DIRTY_SYNC_DEBOUNCE_MS)
      setManualFailed(false)
      setSyncFailed(false)
      setSyncVersion((value) => value + 1)
    },
    [flushDirtyQueue, status, userId],
  )

  const clearPendingDirtySyncWaits = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    for (const timer of dirtyRetryTimersRef.current.values()) window.clearTimeout(timer)
    dirtyRetryTimersRef.current.clear()
  }, [])

  const orderedReadyCerts = useCallback(
    () => [
      ...(currentCert ? [currentCert] : []),
      ...READY_CERTS.filter((cert) => cert !== currentCert),
    ],
    [currentCert],
  )

  const flushAllDirtyNow = useCallback(
    async (accountUserId: string): Promise<AccountProgressSyncResult> => {
      await queueRef.current.catch(() => {})
      for (const cert of orderedReadyCerts()) {
        const result = await flushCert(accountUserId, cert, {
          scheduleRetry: false,
          showTemporaryToast: false,
        })
        if (result === 'temporary-failure') return { ok: false, reason: 'temporary' }
        if (result === 'fatal-failure') return { ok: false, reason: 'fatal' }
        if (result === 'auth-signout') return { ok: false, reason: 'fatal' }
      }
      return { ok: true }
    },
    [flushCert, orderedReadyCerts],
  )

  const syncNow = useCallback(async (): Promise<AccountProgressSyncResult> => {
    if (status !== 'authenticated' || userId === null) return { ok: false, reason: 'temporary' }
    clearPendingDirtySyncWaits()
    setManualSyncing(true)
    setManualFailed(false)
    try {
      const dirtyResult = await flushAllDirtyNow(userId)
      if (!dirtyResult.ok) {
        setManualFailed(true)
        toast(t('accountProgressSyncManualFailure'))
        return dirtyResult
      }
      if (currentCert !== null) {
        const snapshot = await fetchProgressSnapshot(currentCert)
        if (!LocalProgressRepository.isAccountOwner(userId))
          return { ok: false, reason: 'temporary' }
        LocalProgressRepository.replaceAccountCertFromSnapshotPreservingDirty(
          userId,
          snapshot.cert,
          snapshot.revision,
          snapshot.progress,
          [],
          true,
        )
        await queryClient.invalidateQueries({ queryKey: ['progress', 'account'] })
      }
      setSyncFailed(false)
      setSyncVersion((value) => value + 1)
      toast(t('accountProgressSyncManualSuccessToast'))
      return { ok: true }
    } catch (error) {
      if (error instanceof ProgressSyncClientError && error.kind === 'auth') {
        storeSyncExpiredLoginMessage()
        LocalProgressRepository.clearScope('account')
        queryClient.removeQueries({ queryKey: ['progress', 'account'] })
        setEscapingSignOut(true)
        void signOut({ callbackUrl: '/login' })
        return { ok: false, reason: 'fatal' }
      }
      setManualFailed(true)
      setSyncVersion((value) => value + 1)
      toast(t('accountProgressSyncManualFailure'))
      return {
        ok: false,
        reason:
          error instanceof ProgressSyncClientError &&
          (error.kind === 'payload' || error.kind === 'unknown-cert')
            ? 'fatal'
            : 'temporary',
      }
    } finally {
      setManualSyncing(false)
    }
  }, [
    clearPendingDirtySyncWaits,
    currentCert,
    flushAllDirtyNow,
    queryClient,
    status,
    t,
    toast,
    userId,
  ])

  const syncBeforeSignOut = useCallback(async (): Promise<AccountProgressSyncResult> => {
    if (status !== 'authenticated' || userId === null) return { ok: true }
    clearPendingDirtySyncWaits()
    setManualSyncing(true)
    setManualFailed(false)
    try {
      const result = await flushAllDirtyNow(userId)
      if (!result.ok) setManualFailed(true)
      setSyncVersion((value) => value + 1)
      return result
    } finally {
      setManualSyncing(false)
    }
  }, [clearPendingDirtySyncWaits, flushAllDirtyNow, status, userId])

  const importAnonymousProgress = useCallback(async (): Promise<AnonymousImportResult> => {
    if (status !== 'authenticated' || userId === null) return { ok: false, reason: 'temporary' }
    const accountUserId = userId
    const isCurrentAccount = () =>
      currentUserIdRef.current === accountUserId &&
      LocalProgressRepository.isAccountOwner(accountUserId)
    clearPendingDirtySyncWaits()
    setIsImporting(true)
    try {
      await queueRef.current.catch(() => {})
      if (!isCurrentAccount()) return { ok: false, reason: 'temporary' }
      let failed = false
      for (const cert of LocalProgressRepository.summarizeAnonymousImport().certs) {
        const dirtyResult = await flushCert(accountUserId, cert, {
          scheduleRetry: false,
          showTemporaryToast: false,
        })
        if (!isCurrentAccount()) return { ok: false, reason: 'temporary' }
        if (dirtyResult !== 'clean' && dirtyResult !== 'synced') {
          failed = true
          continue
        }

        const records = LocalProgressRepository.listAnonymousImportProgress(cert)
        if (records.length === 0) continue
        try {
          const baseline = LocalProgressRepository.getAccountSyncBaseline(accountUserId, cert)
          const result = await postProgressSync(cert, baseline?.revision ?? 0, records)
          if (!isCurrentAccount()) return { ok: false, reason: 'temporary' }
          const revisionConflict = result.errorCode === 'revision_conflict'
          if (revisionConflict || result.rejected.length > 0) {
            failed = true
          }
          if (result.snapshotRequired) {
            const snapshot = await fetchProgressSnapshot(cert)
            if (!isCurrentAccount()) return { ok: false, reason: 'temporary' }
            LocalProgressRepository.replaceAccountCertFromSnapshotPreservingDirty(
              accountUserId,
              snapshot.cert,
              snapshot.revision,
              snapshot.progress,
              records,
              false,
            )
          } else if (result.rejected.length === 0) {
            LocalProgressRepository.applyImportedAccountSync(
              accountUserId,
              cert,
              result.revision,
              result.accepted,
              records,
            )
          }
          if (!revisionConflict && result.rejected.length === 0) {
            LocalProgressRepository.clearAnonymousImportCert(cert)
          }
          await queryClient.invalidateQueries({ queryKey: ['progress', 'account'] })
        } catch (error) {
          if (error instanceof ProgressSyncClientError && error.kind === 'auth') {
            if (!isCurrentAccount()) return { ok: false, reason: 'temporary' }
            storeSyncExpiredLoginMessage()
            LocalProgressRepository.clearScope('account')
            queryClient.removeQueries({ queryKey: ['progress', 'account'] })
            setEscapingSignOut(true)
            void signOut({ callbackUrl: '/login' })
            return { ok: false, reason: 'fatal' }
          }
          failed = true
        }
      }
      setSyncVersion((value) => value + 1)
      setAnonymousImportVersion((value) => value + 1)
      if (!failed) LocalProgressRepository.clearAnonymousImportDismissal(accountUserId)
      return failed ? { ok: false, reason: 'temporary' } : { ok: true }
    } finally {
      setIsImporting(false)
    }
  }, [clearPendingDirtySyncWaits, flushCert, queryClient, status, userId])

  const dismissAnonymousImport = useCallback(() => {
    if (userId === null) return
    LocalProgressRepository.dismissAnonymousImport(userId)
    setGlobalImportFailed(false)
    setAnonymousImportVersion((value) => value + 1)
  }, [userId])

  const handleGlobalAnonymousImport = useCallback(async () => {
    setGlobalImportFailed(false)
    const result = await importAnonymousProgress()
    setGlobalImportFailed(!result.ok)
  }, [importAnonymousProgress])

  const discardAccountSyncState = useCallback(() => {
    clearPendingDirtySyncWaits()
    LocalProgressRepository.clearScope('account')
    queryClient.removeQueries({ queryKey: ['progress', 'account'] })
    setSyncVersion((value) => value + 1)
  }, [clearPendingDirtySyncWaits, queryClient])

  useEffect(() => {
    if (recoveryOwnerRef.current === userId) return
    recoveryOwnerRef.current = userId
    fatalCertsRef.current.clear()
    setConflictRecoveryCerts([])
    dirtyFailureCountsRef.current.clear()
    for (const timer of dirtyRetryTimersRef.current.values()) window.clearTimeout(timer)
    dirtyRetryTimersRef.current.clear()
  }, [userId])

  useEffect(() => {
    void attempt
    if (status !== 'authenticated' || userId === null || currentCert === null) {
      setEscapingSignOut(false)
      setGateState('ready')
      return
    }

    if (escapingSignOut) return

    const accountUserId = userId
    const cert = currentCert

    if (LocalProgressRepository.getAccountSyncBaseline(accountUserId, cert)) {
      setGateState('ready')
      return
    }

    let active = true
    setGateState('syncing')

    async function syncBaseline() {
      try {
        if (LocalProgressRepository.listDirtyAccountProgress(cert).length > 0) {
          const dirty = LocalProgressRepository.listDirtyAccountProgress(cert)
          const result = await postProgressSync(cert, 0, dirty)
          if (!active) return
          if (
            currentUserIdRef.current !== accountUserId ||
            !LocalProgressRepository.isAccountOwner(accountUserId)
          ) {
            setFailureCount((value) => value + 1)
            setGateState('error')
            return
          }
          if (result.errorCode === 'revision_conflict') {
            LocalProgressRepository.clearAccountCert(accountUserId, cert)
            const snapshot = await fetchProgressSnapshot(cert)
            if (
              !active ||
              currentUserIdRef.current !== accountUserId ||
              !LocalProgressRepository.isAccountOwner(accountUserId)
            ) {
              return
            }
            LocalProgressRepository.replaceAccountCertFromSnapshot(
              accountUserId,
              snapshot.cert,
              snapshot.revision,
              snapshot.progress,
            )
          } else if (result.snapshotRequired || result.rejected.length > 0) {
            LocalProgressRepository.clearAccountSyncBaseline(accountUserId, cert)
            const snapshot = await fetchProgressSnapshot(cert)
            if (
              !active ||
              currentUserIdRef.current !== accountUserId ||
              !LocalProgressRepository.isAccountOwner(accountUserId)
            ) {
              return
            }
            LocalProgressRepository.replaceAccountCertFromSnapshotPreservingDirty(
              accountUserId,
              snapshot.cert,
              snapshot.revision,
              snapshot.progress,
              dirty,
              true,
            )
          } else {
            LocalProgressRepository.applyAcceptedAccountSync(
              accountUserId,
              cert,
              result.revision,
              result.accepted,
              dirty,
            )
          }
          await queryClient.invalidateQueries({ queryKey: ['progress', 'account'] })
          setSyncFailed(false)
          setSyncVersion((value) => value + 1)
          setFailureCount(0)
          setGateState('ready')
          return
        }
        const snapshot = await fetchProgressSnapshot(cert)
        if (!active) return
        if (
          currentUserIdRef.current !== accountUserId ||
          !LocalProgressRepository.isAccountOwner(accountUserId)
        ) {
          setFailureCount((value) => value + 1)
          setGateState('error')
          return
        }
        LocalProgressRepository.replaceAccountCertFromSnapshot(
          accountUserId,
          snapshot.cert,
          snapshot.revision,
          snapshot.progress,
        )
        await queryClient.invalidateQueries({ queryKey: ['progress', 'account'] })
        if (active) {
          setFailureCount(0)
          setGateState('ready')
        }
      } catch (error) {
        if (active) {
          if (error instanceof ProgressSyncClientError && error.kind === 'auth') {
            storeSyncExpiredLoginMessage()
            LocalProgressRepository.clearScope('account')
            queryClient.removeQueries({ queryKey: ['progress', 'account'] })
            setEscapingSignOut(true)
            void signOut({ callbackUrl: '/login' })
            return
          }
          if (
            error instanceof ProgressSyncClientError &&
            (error.kind === 'unknown-cert' || error.kind === 'payload')
          ) {
            fatalCertsRef.current.add(cert)
            toast(
              error.kind === 'unknown-cert'
                ? t('accountProgressSyncUnknownCertToast')
                : t('accountProgressSyncPayloadToast'),
            )
            setGateState('error')
            return
          }
          setFailureCount((value) => value + 1)
          setGateState('error')
        }
      }
    }

    void syncBaseline()

    return () => {
      active = false
    }
  }, [attempt, currentCert, escapingSignOut, queryClient, status, t, toast, userId])

  function retry() {
    setAttempt((value) => value + 1)
  }

  function handleSignOut() {
    setEscapingSignOut(true)
    LocalProgressRepository.clearScope('account')
    queryClient.removeQueries({ queryKey: ['progress', 'account'] })
    void signOut({ callbackUrl: '/login' })
  }

  useEffect(() => {
    if (gateState !== 'error') return
    const handleOnline = () => {
      if (currentCert !== null && fatalCertsRef.current.has(currentCert)) return
      setAttempt((value) => value + 1)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [currentCert, gateState])

  useEffect(() => {
    if (gateState !== 'error') return
    if (currentCert !== null && fatalCertsRef.current.has(currentCert)) return
    const backoffMs = Math.min(
      FIRST_BASELINE_BACKOFF_MS * 2 ** Math.max(0, failureCount - 1),
      MAX_BASELINE_BACKOFF_MS,
    )
    const timeoutId = window.setTimeout(() => setAttempt((value) => value + 1), backoffMs)
    return () => window.clearTimeout(timeoutId)
  }, [currentCert, failureCount, gateState])

  useEffect(() => {
    if (status !== 'authenticated' || userId === null) return
    const handleOnline = () => flushDirtyQueue(currentCert ?? undefined)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [currentCert, flushDirtyQueue, status, userId])

  useEffect(() => {
    if (
      gateState === 'ready' &&
      status === 'authenticated' &&
      userId !== null &&
      currentCert !== null &&
      !needsBaselineSync
    ) {
      flushDirtyQueue(currentCert)
    }
  }, [currentCert, flushDirtyQueue, gateState, needsBaselineSync, status, userId])

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      for (const timer of dirtyRetryTimersRef.current.values()) window.clearTimeout(timer)
      dirtyRetryTimersRef.current.clear()
    }
  }, [])

  if (escapingSignOut) return null
  if (shouldPromptAnonymousImport) {
    return (
      <AccountProgressSyncContext.Provider
        value={{
          enqueueDirtySync,
          status: syncStatus,
          lastSyncedAt,
          hasDirtyProgress,
          isImporting,
          anonymousImportAvailable,
          importAnonymousProgress,
          dismissAnonymousImport,
          syncNow,
          syncBeforeSignOut,
          discardAccountSyncState,
        }}
      >
        <main className="min-h-dvh bg-bg px-4 py-6 text-ink">
          <section className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md items-center">
            <div className="w-full rounded-card border border-border bg-surface p-5 shadow-soft">
              <p className="text-helper font-bold uppercase tracking-[0.18em] text-accent">
                Anonymous Progress
              </p>
              <h1 className="mt-3 text-title font-black">{t('anonymousImportTitle')}</h1>
              <p className="mt-2 text-secondary text-ink-mute">{t('anonymousImportDescription')}</p>
              <p className="mt-4 rounded-card border border-border bg-bg-alt px-4 py-3 text-body font-bold text-ink">
                {t('anonymousImportSummary', {
                  certCount: anonymousImportSummary.certCount,
                  recordCount: anonymousImportSummary.recordCount,
                })}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  className="flex-1 rounded-button bg-accent px-4 py-3 text-body font-bold text-white"
                  type="button"
                  disabled={isImporting}
                  onClick={() => void handleGlobalAnonymousImport()}
                >
                  {t('anonymousImportCta')}
                </button>
                <button
                  className="flex-1 rounded-button border border-border bg-bg-alt px-4 py-3 text-body font-bold text-ink"
                  type="button"
                  disabled={isImporting}
                  onClick={dismissAnonymousImport}
                >
                  {t('anonymousImportSkip')}
                </button>
              </div>
              {globalImportFailed ? (
                <p className="mt-4 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-body font-bold text-danger">
                  {t('anonymousImportFailure')}
                </p>
              ) : null}
            </div>
          </section>
        </main>
      </AccountProgressSyncContext.Provider>
    )
  }
  if (
    !needsBaselineSync &&
    !waitsForAccountScope &&
    !currentCertInConflictRecovery &&
    gateState === 'ready'
  ) {
    return (
      <AccountProgressSyncContext.Provider
        value={{
          enqueueDirtySync,
          status: syncStatus,
          lastSyncedAt,
          hasDirtyProgress,
          isImporting,
          anonymousImportAvailable,
          importAnonymousProgress,
          dismissAnonymousImport,
          syncNow,
          syncBeforeSignOut,
          discardAccountSyncState,
        }}
      >
        {children}
      </AccountProgressSyncContext.Provider>
    )
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-6 text-ink">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md items-center">
        <div className="w-full rounded-card border border-border bg-surface p-5 shadow-soft">
          <p className="text-helper font-bold uppercase tracking-[0.18em] text-accent">
            {currentCert ?? ''}
          </p>
          <h1 className="mt-3 text-title font-black">
            {gateState === 'error'
              ? t('accountProgressSyncErrorTitle')
              : t('accountProgressSyncTitle')}
          </h1>
          <p className="mt-2 text-secondary text-ink-mute">
            {gateState === 'error'
              ? t('accountProgressSyncErrorDescription', { cert: currentCert ?? '' })
              : t('accountProgressSyncDescription', { cert: currentCert ?? '' })}
          </p>
          <div className="mt-5 flex gap-3">
            {gateState === 'error' ? (
              <button
                className="flex-1 rounded-button bg-accent px-4 py-3 text-body font-bold text-white"
                type="button"
                onClick={retry}
              >
                {t('retry')}
              </button>
            ) : null}
            <button
              className="flex-1 rounded-button border border-border bg-bg-alt px-4 py-3 text-body font-bold text-ink"
              type="button"
              onClick={handleSignOut}
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export function useAccountProgressSync(): AccountProgressSyncValue {
  return useContext(AccountProgressSyncContext)
}
