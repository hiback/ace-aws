'use client'

import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { signOut, useSession } from 'next-auth/react'
import {
  createContext,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import type { CertCode } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import {
  fetchProgressSnapshot,
  ProgressSyncClientError,
  postProgressSync,
} from '@/lib/account-progress-sync-client'
import {
  clearAnonymousImportDismissal,
  dismissAnonymousImport,
  hasDismissedAnonymousImport,
} from '@/lib/anonymous-import-dismissal'
import { BrowserProgressModule } from '@/lib/browser-progress-module'
import { READY_CERTS } from '@/lib/cert-catalog'
import {
  getAccountMockExamSyncLedger,
  syncDirtyMockExam,
} from '@/lib/mock-exam/account-sync-ledger'
import type { MockExamAttempt } from '@/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'
import {
  type AccountProgressSyncResult,
  type AccountProgressSyncStatus,
  type AnonymousImportResult,
  createProgressSyncController,
  type ProgressSyncController,
  type ProgressSyncControllerAdapter,
  ProgressSyncControllerError,
  type ProgressSyncControllerInput,
  type ProgressSyncNotice,
} from '@/lib/progress-sync-controller'
import { storeSyncExpiredLoginMessage } from '@/lib/sync-login-message'
import { usePrefsStore } from '@/stores/prefs-store'

export type {
  AccountProgressSyncResult,
  AccountProgressSyncStatus,
  AnonymousImportResult,
} from '@/lib/progress-sync-controller'

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

interface ProviderRuntime {
  t: ReturnType<typeof useT>
  toast: ReturnType<typeof useToast>['toast']
  queryClient: QueryClient
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

function userIdFromSession(session: unknown): string | null {
  const user = (session as { user?: { id?: unknown } } | null)?.user
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null
}

function requireRuntime(runtimeRef: RefObject<ProviderRuntime | null>): ProviderRuntime {
  if (runtimeRef.current === null) throw new Error('Progress sync runtime is not ready')
  return runtimeRef.current
}

function showNotice(runtime: ProviderRuntime, notice: ProgressSyncNotice): void {
  const { t, toast } = runtime
  switch (notice) {
    case 'manual-success':
      toast(t('accountProgressSyncManualSuccessToast'))
      return
    case 'manual-failure':
      toast(t('accountProgressSyncManualFailure'))
      return
    case 'partial':
      toast(t('accountProgressSyncPartialToast'))
      return
    case 'temporary':
      toast(t('accountProgressSyncTemporaryToast'))
      return
    case 'payload':
      toast(t('accountProgressSyncPayloadToast'))
      return
    case 'unknown-cert':
      toast(t('accountProgressSyncUnknownCertToast'))
      return
  }
}

function throwControllerError(error: unknown): never {
  if (error instanceof ProgressSyncClientError) {
    if (error.kind === 'auth' || error.kind === 'payload' || error.kind === 'unknown-cert') {
      throw new ProgressSyncControllerError(error.kind)
    }
    throw new ProgressSyncControllerError('temporary')
  }
  throw error
}

async function importAnonymousMockExamCert(cert: CertCode): Promise<AnonymousImportResult> {
  return getAccountMockExamSyncLedger().importAnonymousCert(cert, {
    syncHistory: async (historyCert, history) => {
      if (history.length === 0) return
      await fetchAccountMockExamHistorySnapshot(historyCert)
      for (const attempt of history) getAccountMockExamSyncLedger().appendSubmittedAttempt(attempt)
      const result = await syncDirtyMockExam(historyCert)
      if (!result.ok) throw new Error('Failed to sync account-backed Mock Exam History')
    },
    fetchAccountDraft: fetchAccountMockExamDraftSnapshot,
    syncDraft: async (draft) => {
      getAccountMockExamSyncLedger().writeDraft(draft)
      const result = await syncDirtyMockExam(draft.cert)
      if (!result.ok) throw new Error('Failed to sync account-backed Mock Exam Draft')
    },
  })
}

async function fetchAccountMockExamDraftSnapshot(cert: CertCode): Promise<MockExamAttempt | null> {
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/draft/snapshot`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam Draft')
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    draft: MockExamAttempt | null
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam Draft snapshot')
  }
  getAccountMockExamSyncLedger().setRevision(cert, body.revision)
  getAccountMockExamSyncLedger().setDraftSnapshot(cert, body.draft)
  return body.draft
}

async function fetchAccountMockExamHistorySnapshot(
  cert: CertCode,
): Promise<SubmittedMockExamAttempt[]> {
  const response = await fetch(`/api/mock-exam/${cert.toLowerCase()}/history/snapshot`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('Failed to fetch account-backed Mock Exam History')
  const body = (await response.json()) as {
    cert: CertCode
    revision: number
    submittedAttempts: SubmittedMockExamAttempt[]
  }
  if (body.cert !== cert || !Number.isFinite(body.revision)) {
    throw new Error('Invalid account-backed Mock Exam History snapshot')
  }
  getAccountMockExamSyncLedger().applyHistorySnapshot(cert, body.revision, body.submittedAttempts)
  return getAccountMockExamSyncLedger().readHistory(cert)
}

function createProviderAdapter(
  runtimeRef: RefObject<ProviderRuntime | null>,
  userIdRef: RefObject<string | null>,
): ProgressSyncControllerAdapter {
  return {
    readyCerts: READY_CERTS,
    accountProgress: {
      isOwner: (userId) => BrowserProgressModule.isAccountOwner(userId),
      clearScope: () => BrowserProgressModule.clearScope('account'),
      listDirty: (cert) => BrowserProgressModule.listDirtyAccountProgress(cert),
      listDirtyDailyStats: (cert) => BrowserProgressModule.listDirtyAccountDailyStats(cert),
      clearCert: (userId, cert) => BrowserProgressModule.clearAccountCert(userId, cert),
      replaceCertFromSnapshot: (userId, cert, revision, progress, dailyStats) =>
        BrowserProgressModule.replaceAccountCertFromSnapshot(
          userId,
          cert,
          revision,
          progress,
          dailyStats,
        ),
      refreshCertFromSnapshotKeepingDirty: (userId, cert, revision, progress, dailyStats) =>
        BrowserProgressModule.replaceAccountCertFromSnapshotPreservingDirty(
          userId,
          cert,
          revision,
          progress,
          dailyStats,
          [],
          [],
          true,
        ),
      recoverCertFromSnapshotAfterSync: (
        userId,
        cert,
        revision,
        progress,
        dailyStats,
        uploaded,
        uploadedDailyStats,
      ) =>
        BrowserProgressModule.replaceAccountCertFromSnapshotPreservingDirty(
          userId,
          cert,
          revision,
          progress,
          dailyStats,
          uploaded,
          uploadedDailyStats,
        ),
      applyAcceptedSync: (
        userId,
        cert,
        revision,
        accepted,
        uploaded,
        dailyStats,
        uploadedDailyStats,
      ) =>
        BrowserProgressModule.applyAcceptedAccountSync(
          userId,
          cert,
          revision,
          accepted,
          uploaded,
          dailyStats,
          uploadedDailyStats,
        ),
      applyImportedSync: (
        userId,
        cert,
        revision,
        accepted,
        uploaded,
        dailyStats,
        uploadedDailyStats,
      ) =>
        BrowserProgressModule.applyImportedAccountSync(
          userId,
          cert,
          revision,
          accepted,
          uploaded,
          dailyStats,
          uploadedDailyStats,
        ),
    },
    progressRevision: {
      getBaseline: (userId, cert) => BrowserProgressModule.getAccountSyncBaseline(userId, cert),
      clearBaseline: (userId, cert) => BrowserProgressModule.clearAccountSyncBaseline(userId, cert),
      markChecked: (userId, cert, revision) =>
        BrowserProgressModule.markAccountSyncBaselineChecked(userId, cert, revision),
    },
    progressSync: {
      post: async (cert, baseRevision, progress, dailyStats) => {
        try {
          return await postProgressSync(cert, baseRevision, progress, dailyStats)
        } catch (error) {
          throwControllerError(error)
        }
      },
    },
    progressSnapshot: {
      fetch: async (cert) => {
        try {
          return await fetchProgressSnapshot(cert)
        } catch (error) {
          throwControllerError(error)
        }
      },
    },
    questionProgress: {
      invalidateAccountProgress: async () => {
        await requireRuntime(runtimeRef).queryClient.invalidateQueries({
          queryKey: ['progress', 'account'],
        })
      },
      removeAccountProgressQueries: () => {
        requireRuntime(runtimeRef).queryClient.removeQueries({ queryKey: ['progress', 'account'] })
      },
    },
    anonymousProgress: {
      summarizeImport: () => BrowserProgressModule.summarizeAnonymousImport(),
      listImportProgress: (cert) => BrowserProgressModule.listAnonymousImportProgress(cert),
      listImportDailyStats: (cert) => BrowserProgressModule.listAnonymousImportDailyStats(cert),
      clearImportCert: (cert) => BrowserProgressModule.clearAnonymousImportCert(cert),
      hasDismissedImport: hasDismissedAnonymousImport,
      dismissImport: dismissAnonymousImport,
      clearImportDismissal: clearAnonymousImportDismissal,
    },
    mockExam: {
      hasDirty: (cert) => getAccountMockExamSyncLedger().hasDirty(cert),
      syncDirty: syncDirtyMockExam,
      summarizeImport: () => getAccountMockExamSyncLedger().summarizeAnonymousImport(),
      importAnonymousCert: importAnonymousMockExamCert,
      clearScope: () => {
        const ownerId = userIdRef.current
        if (ownerId !== null) getAccountMockExamSyncLedger().clearOwner(ownerId)
        else getAccountMockExamSyncLedger().clearCurrentOwner()
      },
      invalidate: async () => {
        await requireRuntime(runtimeRef).queryClient.invalidateQueries({ queryKey: ['mock-exam'] })
      },
    },
    auth: {
      storeExpiredLoginMessage: storeSyncExpiredLoginMessage,
      signOut: () => {
        void signOut({ callbackUrl: '/login' })
      },
    },
    notices: {
      show: (notice) => showNotice(requireRuntime(runtimeRef), notice),
    },
  }
}

function createContextValue(controller: ProgressSyncController): AccountProgressSyncValue {
  const state = controller.getState()
  return {
    enqueueDirtySync: (cert) => controller.enqueueDirtySync(cert),
    status: state.status,
    lastSyncedAt: state.lastSyncedAt,
    hasDirtyProgress: state.hasDirtyProgress,
    isImporting: state.isImporting,
    anonymousImportAvailable: state.anonymousImportAvailable,
    importAnonymousProgress: () => controller.importAnonymousProgress(),
    dismissAnonymousImport: () => controller.dismissAnonymousImport(),
    syncNow: () => controller.sync('manual'),
    syncBeforeSignOut: () => controller.sync('before-sign-out'),
    discardAccountSyncState: () => controller.discardAccountSyncState(),
  }
}

export function AccountProgressSyncProvider({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: session, status } = useSession()
  const { scope } = useProgressScope()
  const currentCert = usePrefsStore((s) => s.currentCert)
  const userId = userIdFromSession(session)
  const runtimeRef = useRef<ProviderRuntime | null>(null)
  const userIdRef = useRef<string | null>(null)
  const controllerRef = useRef<ProgressSyncController | null>(null)
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [gateSigningOut, setGateSigningOut] = useState(false)
  runtimeRef.current = { t, toast, queryClient }
  const input: ProgressSyncControllerInput = {
    authStatus: status,
    userId,
    currentCert,
    scope,
  }
  userIdRef.current = userId

  if (controllerRef.current === null) {
    controllerRef.current = createProgressSyncController(
      createProviderAdapter(runtimeRef, userIdRef),
      input,
    )
  }
  const controller = controllerRef.current
  const controllerState = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => controller.getState(),
  )
  const contextValue = createContextValue(controller)

  useLayoutEffect(() => {
    controller.update({ authStatus: status, userId, currentCert, scope })
  }, [controller, status, userId, currentCert, scope])

  useEffect(() => {
    const handleOnline = () => controller.handleOnline()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [controller])

  useEffect(() => {
    if (disposeTimerRef.current !== null) {
      clearTimeout(disposeTimerRef.current)
      disposeTimerRef.current = null
    }
    return () => {
      disposeTimerRef.current = setTimeout(() => {
        controller.dispose()
        if (controllerRef.current === controller) controllerRef.current = null
        disposeTimerRef.current = null
      }, 0)
    }
  }, [controller])

  function handleGateSignOut() {
    setGateSigningOut(true)
    controller.discardAccountSyncState()
    void signOut({ callbackUrl: '/login' })
  }

  if (gateSigningOut || controllerState.view === 'hidden') return null
  if (controllerState.view === 'anonymous-import') {
    return (
      <AccountProgressSyncContext.Provider value={contextValue}>
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
                  certCount: controllerState.anonymousImportSummary.certCount,
                  recordCount: controllerState.anonymousImportSummary.recordCount,
                })}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  className="flex-1 rounded-button bg-accent px-4 py-3 text-body font-bold text-white"
                  type="button"
                  disabled={controllerState.isImporting}
                  onClick={() => void controller.importAnonymousProgress()}
                >
                  {t('anonymousImportCta')}
                </button>
                <button
                  className="flex-1 rounded-button border border-border bg-bg-alt px-4 py-3 text-body font-bold text-ink"
                  type="button"
                  disabled={controllerState.isImporting}
                  onClick={() => controller.dismissAnonymousImport()}
                >
                  {t('anonymousImportSkip')}
                </button>
              </div>
              {controllerState.globalImportFailed ? (
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
  if (controllerState.view === 'ready') {
    return (
      <AccountProgressSyncContext.Provider value={contextValue}>
        {children}
      </AccountProgressSyncContext.Provider>
    )
  }

  return (
    <main className="min-h-dvh bg-bg px-4 py-6 text-ink">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md items-center">
        <div className="w-full rounded-card border border-border bg-surface p-5 shadow-soft">
          <p className="text-helper font-bold uppercase tracking-[0.18em] text-accent">
            {controllerState.currentCert ?? ''}
          </p>
          <h1 className="mt-3 text-title font-black">
            {controllerState.gateState === 'error'
              ? t('accountProgressSyncErrorTitle')
              : t('accountProgressSyncTitle')}
          </h1>
          <p className="mt-2 text-secondary text-ink-mute">
            {controllerState.gateState === 'error'
              ? t('accountProgressSyncErrorDescription', {
                  cert: controllerState.currentCert ?? '',
                })
              : t('accountProgressSyncDescription', { cert: controllerState.currentCert ?? '' })}
          </p>
          <div className="mt-5 flex gap-3">
            {controllerState.gateState === 'error' ? (
              <button
                className="flex-1 rounded-button bg-accent px-4 py-3 text-body font-bold text-white"
                type="button"
                onClick={() => controller.retryGate()}
              >
                {t('retry')}
              </button>
            ) : null}
            <button
              className="flex-1 rounded-button border border-border bg-bg-alt px-4 py-3 text-body font-bold text-ink"
              type="button"
              onClick={handleGateSignOut}
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
