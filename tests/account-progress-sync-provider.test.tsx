import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountProgressSyncProvider,
  useAccountProgressSync,
} from '../src/components/providers/account-progress-sync-provider'
import { ProgressScopeProvider } from '../src/components/providers/progress-scope-provider'
import type { CertCode } from '../src/data/types'
import { hasDismissedAnonymousImport } from '../src/lib/anonymous-import-dismissal'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import { getAccountMockExamSyncLedger } from '../src/lib/mock-exam/account-sync-ledger'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import { usePrefsStore } from '../src/stores/prefs-store'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
  signOut: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
  signOut: authMocks.signOut,
}))

function authenticate(userId: string) {
  authMocks.status = 'authenticated'
  authMocks.session = { user: { id: userId }, expires: '2099-01-01T00:00:00.000Z' }
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderGateWithProgressScope(
  children = <div>App content</div>,
  client = createQueryClient(),
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <AccountProgressSyncProvider>{children}</AccountProgressSyncProvider>
        </ProgressScopeProvider>
      </QueryClientProvider>,
    ),
  }
}

function renderStrictGate(children = <div>App content</div>, client = createQueryClient()) {
  return {
    client,
    ...render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <ProgressScopeProvider>
            <AccountProgressSyncProvider>{children}</AccountProgressSyncProvider>
          </ProgressScopeProvider>
        </QueryClientProvider>
      </StrictMode>,
    ),
  }
}

function syncResponse(cert: CertCode, revision: number, qid = 1): Response {
  return {
    ok: true,
    json: async () => ({
      cert,
      revision,
      accepted: [progressDto(qid)],
      rejected: [],
      snapshotRequired: false,
    }),
  } as Response
}

function snapshotResponse(cert: CertCode, revision: number, qid = 2): Response {
  return {
    ok: true,
    json: async () => ({
      cert,
      revision,
      progress: [progressDto(qid)],
    }),
  } as Response
}

function progressDto(qid: number) {
  return {
    qid,
    correctCount: 1,
    wrongCount: 0,
    lastPicks: ['A'],
    lastCorrect: true,
    lastAnsweredAt: '2026-01-01T00:00:00.000Z',
    bookmarked: false,
    bookmarkUpdatedAt: null,
  }
}

function mockExamDraft(id: string): MockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    draftStatus: 'saved',
    currentIndex: 0,
    questionCount: 1,
    timeLimitSeconds: 120,
    startedAt: 1000,
    updatedAt: 2000,
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: ['A'],
        type: 'single',
        userPicks: ['A'],
        correct: true,
        flagged: false,
        answered: true,
      },
    ],
  }
}

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  authMocks.signOut.mockReset()
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(snapshotResponse('DVA-C02', 5)))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AccountProgressSyncProvider', () => {
  it('keeps syncNow usable through StrictMode replay after the current cert baseline is ready', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    BrowserProgressModule.prepareAccountOwner('user-1')
    BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 0, [])
    vi.mocked(fetch).mockReset().mockResolvedValue(syncResponse('DVA-C02', 1))
    function SyncButton() {
      const { syncNow } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => void syncNow()}>
          Sync now
        </button>
      )
    }

    renderStrictGate(<SyncButton />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeNull())
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object)),
    )
    vi.mocked(fetch).mockClear().mockResolvedValue(syncResponse('DVA-C02', 2))
    new BrowserProgressModule('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object)),
    )
  })

  it('renders the anonymous import prompt instead of children', async () => {
    authenticate('user-1')
    new BrowserProgressModule('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')

    renderGateWithProgressScope(<div>Choose certification</div>)

    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    expect(
      screen.getByText('Certifications: 1; progress records: 1 on this browser.'),
    ).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('renders the blocking gate until the current cert baseline is restored', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch).mockReset().mockResolvedValue(snapshotResponse('DVA-C02', 5))

    renderGateWithProgressScope(<div>App content</div>)

    expect(screen.getByText('Syncing account progress')).not.toBeNull()
    expect(screen.queryByText('App content')).toBeNull()
    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
  })

  it('renders children directly when no gate or prompt is needed', async () => {
    authenticate('user-1')

    renderGateWithProgressScope(<div>Ready content</div>)

    await waitFor(() => expect(screen.getByText('Ready content')).not.toBeNull())
  })

  it('maps syncNow to manual sync, including the current cert snapshot refresh', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    BrowserProgressModule.prepareAccountOwner('user-1')
    BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(syncResponse('DVA-C02', 3))
      .mockResolvedValueOnce(snapshotResponse('DVA-C02', 4))
    function SyncButton() {
      const { syncNow } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => void syncNow()}>
          Sync now
        </button>
      )
    }

    renderGateWithProgressScope(<SyncButton />)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object)),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', {
        cache: 'no-store',
        credentials: 'same-origin',
      }),
    )
  })

  it('maps syncBeforeSignOut to a dirty flush without a snapshot refresh', async () => {
    authenticate('user-1')
    BrowserProgressModule.prepareAccountOwner('user-1')
    BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new BrowserProgressModule('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch).mockReset().mockResolvedValue(syncResponse('DVA-C02', 4))
    function SignOutSyncButton() {
      const { syncBeforeSignOut } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => void syncBeforeSignOut()}>
          Flush before sign out
        </button>
      )
    }

    renderGateWithProgressScope(<SignOutSyncButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Flush before sign out' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object))
    expect(fetch).not.toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', expect.any(Object))
  })

  it('wires browser online events to dirty account progress flushing', async () => {
    authenticate('user-1')
    BrowserProgressModule.prepareAccountOwner('user-1')
    BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 3, [])
    new BrowserProgressModule('account').recordAnswer(1, ['A'], true, 'CLF-C02')
    vi.mocked(fetch).mockReset().mockResolvedValue(syncResponse('CLF-C02', 4))

    renderGateWithProgressScope(<div>Ready content</div>)
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith('/api/progress/clf-c02/sync', expect.any(Object))
  })

  it('gate sign-out discards account sync state and signs out', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    BrowserProgressModule.prepareAccountOwner('user-1')
    getAccountMockExamSyncLedger().writeDraft(mockExamDraft('account-mock-exam-draft'))
    BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new BrowserProgressModule('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    localStorage.removeItem('ace-aws/account-progress-sync/v1')
    vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error('offline'))

    renderGateWithProgressScope(<div>App content</div>)

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.queryByText('App content')).toBeNull()
    expect(new BrowserProgressModule('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(BrowserProgressModule.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
    expect(getAccountMockExamSyncLedger().readDraft('DVA-C02')).toBeNull()

    BrowserProgressModule.prepareAccountOwner('user-1')

    expect(getAccountMockExamSyncLedger().readDraft('DVA-C02')).toBeNull()
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })

  it('discards the current session mock exam owner without a pre-observed ledger owner', async () => {
    authenticate('user-a')
    BrowserProgressModule.prepareAccountOwner('stale-user')
    getAccountMockExamSyncLedger().readDraft('DVA-C02')
    localStorage.clear()
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({
        byUser: {
          'user-a': {
            revisions: {},
            drafts: { 'DVA-C02': mockExamDraft('user-a-draft') },
            submittedAttempts: {},
            dirtyDrafts: {},
            dirtySubmittedAttempts: {},
          },
          'user-b': {
            revisions: {},
            drafts: { 'DVA-C02': mockExamDraft('user-b-draft') },
            submittedAttempts: {},
            dirtyDrafts: {},
            dirtySubmittedAttempts: {},
          },
        },
      }),
    )

    function DiscardButton() {
      const { discardAccountSyncState } = useAccountProgressSync()
      return (
        <button type="button" onClick={discardAccountSyncState}>
          Discard account state
        </button>
      )
    }

    renderGateWithProgressScope(<DiscardButton />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Discard account state' })).not.toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Discard account state' }))

    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(getAccountMockExamSyncLedger().readDraft('DVA-C02')).toBeNull()

    BrowserProgressModule.prepareAccountOwner('user-b')

    expect(getAccountMockExamSyncLedger().readDraft('DVA-C02')?.id).toBe('user-b-draft')
  })

  it('dismisses the anonymous import prompt through the provider controls', async () => {
    authenticate('user-1')
    new BrowserProgressModule('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')

    renderGateWithProgressScope(<div>Choose certification</div>)

    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }))

    expect(hasDismissedAnonymousImport('user-1')).toBe(true)
    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
  })
})
