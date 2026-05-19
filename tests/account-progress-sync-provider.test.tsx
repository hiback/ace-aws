import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountProgressSyncProvider,
  useAccountProgressSync,
} from '../src/components/providers/account-progress-sync-provider'
import {
  ProgressScopeProvider,
  useProgressScope,
} from '../src/components/providers/progress-scope-provider'
import { useRecordAnswer } from '../src/hooks/use-answer'
import { ToastHost } from '../src/hooks/use-toast'
import {
  ACCOUNT_PROGRESS_OWNER_KEY,
  ACCOUNT_PROGRESS_SYNC_KEY,
  ANONYMOUS_IMPORT_DISMISSAL_KEY,
  LocalProgressRepository,
} from '../src/repositories/local-progress-repository'
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

function renderGate(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  children = <div>App content</div>,
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AccountProgressSyncProvider>{children}</AccountProgressSyncProvider>
      </QueryClientProvider>,
    ),
  }
}

function renderGateWithProgressScope(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  children = <div>App content</div>,
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

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  authMocks.signOut.mockReset()
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: null })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 5,
        progress: [
          {
            qid: 2,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['C'],
            lastCorrect: true,
            lastAnsweredAt: '2026-01-01T00:00:00.000Z',
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
      }),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AccountProgressSyncProvider', () => {
  it('prompts to import anonymous progress before certificate selection when signed in without a current cert', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)

    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    expect(
      screen.getByText('Certifications: 1; progress records: 1 on this browser.'),
    ).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks certificate selection on the first authenticated render before the account owner marker is prepared', () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')

    renderGate(undefined, <div>Choose certification</div>)

    expect(screen.getByText('Import Anonymous Progress')).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
  })

  it('does not prompt for completely empty anonymous progress records', () => {
    authenticate('user-1')
    localStorage.setItem(
      'ace-aws/progress/v1',
      JSON.stringify({
        byCert: {
          'DVA-C02': {
            progress: {
              1: {
                qid: 1,
                correctCount: 0,
                wrongCount: 0,
                lastPicks: [],
                lastCorrect: null,
                lastAnsweredAt: null,
                bookmarked: false,
                bookmarkUpdatedAt: null,
              },
            },
          },
        },
      }),
    )

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)

    expect(screen.queryByText('Import Anonymous Progress')).toBeNull()
    expect(screen.getByText('Choose certification')).not.toBeNull()
  })

  it('waits for the current certification baseline before prompting for anonymous import', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'CLF-C02')

    renderGateWithProgressScope()

    expect(screen.getByText('Syncing account progress')).not.toBeNull()
    expect(screen.queryByText('Import Anonymous Progress')).toBeNull()

    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    expect(screen.queryByText('App content')).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
  })

  it('imports all ready certification anonymous progress directly through sync payloads', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    new LocalProgressRepository('anonymous').toggleBookmark(2, 'CLF-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 11,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'CLF-C02',
        revision: 7,
        accepted: [
          {
            qid: 2,
            correctCount: 0,
            wrongCount: 0,
            lastPicks: [],
            lastCorrect: null,
            lastAnsweredAt: null,
            bookmarked: true,
            bookmarkUpdatedAt: new Date(1_700_000_000_000).toISOString(),
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
    expect(fetch).toHaveBeenCalledWith('/api/progress/clf-c02/sync', expect.any(Object))
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object))
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toMatchObject({
      qid: 1,
      lastPicks: ['A'],
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 11,
    })
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: [],
      certCount: 0,
      recordCount: 0,
    })
  })

  it('keeps the import prompt and preserves failed certification anonymous progress on partial failure', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'CLF-C02')
    new LocalProgressRepository('anonymous').recordAnswer(2, ['B'], false, 'DVA-C02')
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'CLF-C02',
        revision: 7,
        accepted: [
          {
            qid: 1,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['A'],
            lastCorrect: true,
            lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 3,
        accepted: [],
        rejected: [{ index: 0, qid: 2, code: 'invalid_progress' }],
        snapshotRequired: false,
      }),
    } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() =>
      expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
        certs: ['DVA-C02'],
        certCount: 1,
        recordCount: 1,
      }),
    )
    expect(screen.getByText('Import Anonymous Progress')).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
    expect(new LocalProgressRepository('account').getProgress(1, 'CLF-C02')).toMatchObject({
      qid: 1,
    })
  })

  it('preserves anonymous progress and keeps prompting when anonymous import hits a revision conflict', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 8,
        accepted: [],
        rejected: [],
        snapshotRequired: true,
        error: { code: 'revision_conflict' },
      }),
    } as Response)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cert: 'DVA-C02', revision: 8, progress: [] }),
    } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() =>
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
        revision: 8,
      }),
    )
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: ['DVA-C02'],
      certCount: 1,
      recordCount: 1,
    })
    expect(screen.getByText('Import Anonymous Progress')).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
  })

  it('shows failure feedback and keeps the global anonymous import prompt blocking', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() =>
      expect(
        screen.getByText('Anonymous progress could not import right now. It is still saved here.'),
      ).not.toBeNull(),
    )
    expect(screen.getByText('Import Anonymous Progress')).not.toBeNull()
    expect(screen.queryByText('Choose certification')).toBeNull()
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: ['DVA-C02'],
      certCount: 1,
      recordCount: 1,
    })
  })

  it('preserves account dirty progress created while an anonymous import snapshot is in flight', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    new LocalProgressRepository('account').recordAnswer(9, ['C'], false, 'DVA-C02')
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 5,
          progress: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toMatchObject({
      qid: 1,
      lastPicks: ['A'],
    })
    expect(new LocalProgressRepository('account').getProgress(9, 'DVA-C02')).toMatchObject({
      qid: 9,
      lastPicks: ['C'],
      lastCorrect: false,
      dirtySince: expect.any(Number),
    })
  })

  it('does not write account mirror or clear anonymous progress when an import response returns after account owner changes', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveImport: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveImport = resolve
          }),
      )

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    LocalProgressRepository.clearScope('account')
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-2')
    await act(async () => {
      resolveImport({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 5,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: ['DVA-C02'],
      certCount: 1,
      recordCount: 1,
    })
  })

  it('does not clear the current account or sign out when a stale anonymous import returns auth failure', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveImport: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveImport = resolve
          }),
      )

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    LocalProgressRepository.clearScope('account')
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-2')
    new LocalProgressRepository('account').recordAnswer(9, ['C'], true, 'DVA-C02')
    await act(async () => {
      resolveImport({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'unauthorized' } }),
      } as Response)
      await Promise.resolve()
    })

    expect(authMocks.signOut).not.toHaveBeenCalled()
    expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-2')
    expect(new LocalProgressRepository('account').getProgress(9, 'DVA-C02')).toMatchObject({
      qid: 9,
      lastPicks: ['C'],
    })
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: ['DVA-C02'],
      certCount: 1,
      recordCount: 1,
    })
  })

  it('retries failed anonymous import progress and continues after success', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(2, ['B'], false, 'DVA-C02')
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 3,
        accepted: [],
        rejected: [{ index: 0, qid: 2, code: 'invalid_progress' }],
        snapshotRequired: false,
      }),
    } as Response)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 4,
        accepted: [
          {
            qid: 2,
            correctCount: 0,
            wrongCount: 1,
            lastPicks: ['B'],
            lastCorrect: false,
            lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
      certs: [],
      certCount: 0,
      recordCount: 0,
    })
  })

  it('skips anonymous import per account without affecting another signed-in account', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    const { rerender, client } = renderGateWithProgressScope(
      undefined,
      <div>Choose certification</div>,
    )
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }))

    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
    new LocalProgressRepository('anonymous').recordAnswer(2, ['B'], false, 'CLF-C02')
    rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <AccountProgressSyncProvider>
            <div>Choose certification</div>
          </AccountProgressSyncProvider>
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByText('Import Anonymous Progress')).toBeNull()

    authenticate('user-2')
    rerender(
      <QueryClientProvider client={client}>
        <ProgressScopeProvider>
          <AccountProgressSyncProvider>
            <div>Choose certification</div>
          </AccountProgressSyncProvider>
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
  })

  it('keeps manual anonymous import available after global prompt dismissal and clears that dismissal after successful import', async () => {
    authenticate('user-1')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    LocalProgressRepository.dismissAnonymousImport('user-1')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 6,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function ManualAnonymousImportButton() {
      const { anonymousImportAvailable, importAnonymousProgress } = useAccountProgressSync()
      return (
        <button
          type="button"
          disabled={!anonymousImportAvailable}
          onClick={() => void importAnonymousProgress()}
        >
          Manual import
        </button>
      )
    }

    renderGateWithProgressScope(undefined, <ManualAnonymousImportButton />)

    expect(screen.queryByText('Import Anonymous Progress')).toBeNull()
    expect(screen.getByRole('button', { name: 'Manual import' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: 'Manual import' }))

    await waitFor(() =>
      expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
        certs: [],
        certCount: 0,
        recordCount: 0,
      }),
    )
    expect(LocalProgressRepository.hasDismissedAnonymousImport('user-1')).toBe(false)
    expect(JSON.parse(localStorage.getItem(ANONYMOUS_IMPORT_DISMISSAL_KEY) ?? '{}')).toEqual({})
  })

  it('flushes dirty account progress for a certification before importing its anonymous records', async () => {
    authenticate('user-1')
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    new LocalProgressRepository('account').recordAnswer(9, ['C'], true, 'DVA-C02')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 2,
        accepted: [
          {
            qid: 9,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['C'],
            lastCorrect: true,
            lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 3,
        accepted: [
          {
            qid: 1,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['A'],
            lastCorrect: true,
            lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)

    renderGateWithProgressScope(undefined, <div>Choose certification</div>)
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))

    await waitFor(() => expect(screen.getByText('Choose certification')).not.toBeNull())
    const firstBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)
    expect(firstBody.progress[0]).toMatchObject({ qid: 9, lastPicks: ['C'] })
    expect(secondBody).toMatchObject({ baseRevision: 2 })
    expect(secondBody.progress[0]).toMatchObject({ qid: 1, lastPicks: ['A'] })
  })

  it('waits for an in-flight dirty sync before importing anonymous records for the same certification', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 1, [])
    new LocalProgressRepository('account').recordAnswer(9, ['C'], true, 'DVA-C02')
    new LocalProgressRepository('anonymous').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveDirtySync: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation(() => {
        if (vi.mocked(fetch).mock.calls.length === 1) {
          return new Promise<Response>((resolve) => {
            resolveDirtySync = resolve
          })
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            cert: 'DVA-C02',
            revision: 3,
            accepted: [
              {
                qid: 1,
                correctCount: 1,
                wrongCount: 0,
                lastPicks: ['A'],
                lastCorrect: true,
                lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
                bookmarked: false,
                bookmarkUpdatedAt: null,
              },
            ],
            rejected: [],
            snapshotRequired: false,
          }),
        } as Response)
      })

    renderGateWithProgressScope()
    await waitFor(() => expect(screen.getByText('Import Anonymous Progress')).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Import progress' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDirtySync({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 2,
          accepted: [
            {
              qid: 9,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['C'],
              lastCorrect: true,
              lastAnsweredAt: new Date(1_700_000_000_000).toISOString(),
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const importBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)
    expect(importBody).toMatchObject({ baseRevision: 2 })
    expect(importBody.progress[0]).toMatchObject({ qid: 1, lastPicks: ['A'] })
  })

  it('does not run the baseline gate when the signed-in account has no current cert', () => {
    authenticate('user-1')

    renderGate()

    expect(screen.getByText('App content')).not.toBeNull()
    expect(screen.queryByText('Syncing account progress')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not flash the baseline gate while the auth session is loading', () => {
    authMocks.status = 'loading'

    renderGate()

    expect(screen.getByText('App content')).not.toBeNull()
    expect(screen.queryByText('Syncing account progress')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks the current cert revision in the background when a baseline already exists', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)

    const beforeSyncedAt = LocalProgressRepository.getAccountSyncBaseline(
      'user-1',
      'DVA-C02',
    )?.lastSyncedAt
    const view = renderGateWithProgressScope()

    expect(screen.getByText('App content')).not.toBeNull()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object))
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain('/snapshot')
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({
      baseRevision: 4,
      progress: [],
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 4,
      lastSyncedAt: expect.any(Number),
    })
    expect(
      LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')?.lastSyncedAt,
    ).toBeGreaterThan(beforeSyncedAt ?? 0)

    view.rerender(
      <QueryClientProvider client={view.client}>
        <ProgressScopeProvider>
          <AccountProgressSyncProvider>
            <div>App content</div>
          </AccountProgressSyncProvider>
        </ProgressScopeProvider>
      </QueryClientProvider>,
    )
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('checks another cert the first time it becomes current in this page lifetime', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 9, [])
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation(
        async (input) =>
          ({
            ok: true,
            json: async () => ({
              cert: String(input).includes('clf-c02') ? 'CLF-C02' : 'DVA-C02',
              revision: String(input).includes('clf-c02') ? 9 : 4,
              accepted: [],
              rejected: [],
              snapshotRequired: false,
            }),
          }) as Response,
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    act(() => usePrefsStore.setState({ currentCert: 'CLF-C02' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/progress/clf-c02/sync', expect.any(Object))
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({
      baseRevision: 9,
      progress: [],
    })
  })

  it('fetches and applies a snapshot when a background revision check requires one', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 6,
          progress: [
            {
              qid: 3,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['B'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-02T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    expect(new LocalProgressRepository('account').getProgress(3, 'DVA-C02')).toMatchObject({
      qid: 3,
      lastPicks: ['B'],
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 6,
    })
  })

  it('keeps content visible after a temporary revision check failure and retries online', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function Status() {
      const { status: syncStatus } = useAccountProgressSync()
      return <div>Sync state: {syncStatus}</div>
    }

    renderGateWithProgressScope(undefined, <Status />)

    expect(screen.getByText('Sync state: synced')).not.toBeNull()
    await waitFor(() => expect(screen.getByText('Sync state: failed')).not.toBeNull())
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Sync state: synced')).not.toBeNull())
  })

  it('treats a background revision payload error as fatal and does not retry it online', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 400 } as Response)
    function Status() {
      const { status: syncStatus } = useAccountProgressSync()
      return <div>Sync state: {syncStatus}</div>
    }

    renderGateWithProgressScope(
      undefined,
      <>
        <Status />
        <ToastHost />
      </>,
    )

    expect(screen.getByText('Sync state: synced')).not.toBeNull()
    await waitFor(() => expect(screen.getByText('Sync state: failed')).not.toBeNull())
    expect(screen.getByRole('status').textContent).toBe(
      'Progress sync paused. Local progress is still saved.',
    )

    window.dispatchEvent(new Event('online'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('flushes dirty progress instead of sending an extra empty revision check', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 5,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body.progress).toHaveLength(1)
    expect(body.progress[0]).toMatchObject({ qid: 1 })
  })

  it('waits for account progress scope before showing app content when a baseline already exists', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 4, [])
    const seenScopes: string[] = []
    function AppContent() {
      const { scope } = useProgressScope()
      seenScopes.push(scope)
      return <div>App content</div>
    }

    renderGateWithProgressScope(undefined, <AppContent />)

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    expect(seenScopes).toEqual(['account'])
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object)),
    )
  })

  it('blocks signed-in account content until the current cert snapshot creates a baseline', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    const { client } = renderGateWithProgressScope()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    expect(screen.queryByText('App content')).toBeNull()
    expect(screen.getByText('Syncing account progress')).not.toBeNull()
    expect(screen.getByText('Restoring account progress for DVA-C02.')).not.toBeNull()

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())

    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    expect(new LocalProgressRepository('account').getProgress(2, 'DVA-C02')).toMatchObject({
      qid: 2,
      lastAnsweredAt: Date.parse('2026-01-01T00:00:00.000Z'),
      lastPicks: ['C'],
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 5,
      lastSyncedAt: expect.any(Number),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress', 'account'] })
  })

  it('blocks signed-in account content on the first render when the current cert has no baseline', () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    const childRender = vi.fn()
    function AppContent() {
      childRender()
      return <div>App content</div>
    }

    renderGate(undefined, <AppContent />)

    expect(childRender).not.toHaveBeenCalled()
    expect(screen.queryByText('App content')).toBeNull()
    expect(screen.getByText('Syncing account progress')).not.toBeNull()
    expect(screen.getByText('Restoring account progress for DVA-C02.')).not.toBeNull()
  })

  it('keeps retry and sign-out controls available after a first-baseline failure', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 6, progress: [] }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    expect(screen.queryByText('App content')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 6,
    })
  })

  it('retries a failed first baseline when the browser comes online', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 8, progress: [] }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 8,
    })
  })

  it('automatically retries a temporary first-baseline failure after a lightweight backoff', async () => {
    vi.useFakeTimers()
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 9, progress: [] }),
      } as Response)

    renderGateWithProgressScope()

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Account progress could not sync')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999)
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('App content')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('App content')).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('stops automatic first-baseline retries for an unknown certification without changing current cert', async () => {
    vi.useFakeTimers()
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 404 } as Response)

    renderGateWithProgressScope()

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
    expect(screen.getByText('Account progress could not sync')).not.toBeNull()

    window.dispatchEvent(new Event('online'))
    act(() => vi.runAllTimers())
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops automatic first-baseline retries after a payload-level 400', async () => {
    vi.useFakeTimers()
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 400 } as Response)

    renderGateWithProgressScope()

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()

    window.dispatchEvent(new Event('online'))
    act(() => vi.runAllTimers())
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('signs out from the gate after clearing account mirror and sync metadata without another sync', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    localStorage.removeItem('ace-aws/account-progress-sync/v1')
    vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error('offline'))

    renderGateWithProgressScope()

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.queryByText('App content')).toBeNull()
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' })
  })

  it('does not apply an in-flight snapshot after gate sign-out', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGate()

    expect(screen.getByText('Syncing account progress')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 10,
          progress: [
            {
              qid: 3,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: null,
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(new LocalProgressRepository('account').getProgress(3, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
  })

  it('does not apply an in-flight first-baseline snapshot after account scope is cleared', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-1'))
    expect(screen.getByText('Syncing account progress')).not.toBeNull()

    LocalProgressRepository.clearScope('account')
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 10,
          progress: [
            {
              qid: 3,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: null,
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(new LocalProgressRepository('account').getProgress(3, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
    expect(screen.getByText('Account progress could not sync')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull()
  })

  it('debounces account progress uploads after local answer writes', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 2,
              wrongCount: 0,
              lastPicks: ['B'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function AnswerButton() {
      const recordAnswer = useRecordAnswer('DVA-C02')
      return (
        <button
          type="button"
          onClick={() => recordAnswer.mutate({ qid: 1, picks: ['B'], correct: true })}
        >
          Answer
        </button>
      )
    }

    const { client } = renderGateWithProgressScope(undefined, <AnswerButton />)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Answer' })).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toMatchObject({
      correctCount: 2,
      dirtySince: expect.any(Number),
    })
    expect(fetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(749)
    })
    expect(fetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress', 'account'] })
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).not.toHaveProperty(
      'dirtySince',
    )
  })

  it('does not start a debounced dirty sync after the account owner changes', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function AnswerButton() {
      const recordAnswer = useRecordAnswer('DVA-C02')
      return (
        <button
          type="button"
          onClick={() => recordAnswer.mutate({ qid: 1, picks: ['A'], correct: true })}
        >
          Answer
        </button>
      )
    }

    renderGateWithProgressScope(undefined, <AnswerButton />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Answer' })).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    await Promise.resolve()
    await Promise.resolve()
    LocalProgressRepository.clearScope('account')
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-2')
    new LocalProgressRepository('account').recordAnswer(2, ['B'], false, 'DVA-C02')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not start a debounced dirty sync after the session user changes', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: null })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function EnqueueButton() {
      const { enqueueDirtySync } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => enqueueDirtySync('DVA-C02')}>
          Sync
        </button>
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Tree() {
      return (
        <QueryClientProvider client={client}>
          <AccountProgressSyncProvider>
            <EnqueueButton />
          </AccountProgressSyncProvider>
        </QueryClientProvider>
      )
    }

    const view = render(<Tree />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).not.toBeNull())
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    authenticate('user-2')
    view.rerender(<Tree />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('clears page-lifetime fatal sync state when the session user changes', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: null })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({ ok: false, status: 400 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function EnqueueButton() {
      const { enqueueDirtySync } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => enqueueDirtySync('DVA-C02')}>
          Sync
        </button>
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Tree() {
      return (
        <QueryClientProvider client={client}>
          <AccountProgressSyncProvider>
            <EnqueueButton />
          </AccountProgressSyncProvider>
        </QueryClientProvider>
      )
    }

    const view = render(<Tree />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).not.toBeNull())
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)

    LocalProgressRepository.clearScope('account')
    authenticate('user-2')
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-2')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-2', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(2, ['B'], false, 'DVA-C02')
    view.rerender(<Tree />)
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('prioritizes the current certification and flushes other dirty certifications serially', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 8, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], true, 'CLF-C02')
    accountRepo.recordAnswer(2, ['B'], false, 'DVA-C02')
    let resolveCurrent: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation((url) => {
        if (String(url).includes('/dva-c02/sync')) {
          return new Promise<Response>((resolve) => {
            resolveCurrent = resolve
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cert: 'CLF-C02',
            revision: 9,
            accepted: [
              {
                qid: 1,
                correctCount: 1,
                wrongCount: 0,
                lastPicks: ['A'],
                lastCorrect: true,
                lastAnsweredAt: '2026-01-01T00:00:00.000Z',
                bookmarked: false,
                bookmarkUpdatedAt: null,
              },
            ],
            rejected: [],
            snapshotRequired: false,
          }),
        } as Response)
      })

    renderGateWithProgressScope()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/progress/dva-c02/sync', expect.any(Object))

    await act(async () => {
      resolveCurrent({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 2,
              correctCount: 0,
              wrongCount: 1,
              lastPicks: ['B'],
              lastCorrect: false,
              lastAnsweredAt: '2026-01-01T00:01:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/progress/clf-c02/sync', expect.any(Object))
  })

  it('keeps the current certification first when a non-current certification enqueues sync', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 8, [])
    const accountRepo = new LocalProgressRepository('account')
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            cert: String(url).includes('/clf-c02/') ? 'CLF-C02' : 'DVA-C02',
            revision: 4,
            accepted: [],
            rejected: [],
            snapshotRequired: false,
          }),
        } as Response),
      )
    function ClfAnswerButton() {
      const recordAnswer = useRecordAnswer('CLF-C02')
      return (
        <button
          type="button"
          onClick={() => recordAnswer.mutate({ qid: 1, picks: ['A'], correct: true })}
        >
          Answer CLF
        </button>
      )
    }

    renderGateWithProgressScope(undefined, <ClfAnswerButton />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Answer CLF' })).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()
    accountRepo.recordAnswer(2, ['B'], false, 'DVA-C02')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Answer CLF' }))
    await Promise.resolve()
    await Promise.resolve()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalled()
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/progress/dva-c02/sync', expect.any(Object))
  })

  it('flushes dirty progress on browser online without fetching a snapshot', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)

    renderGateWithProgressScope()
    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()

    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', expect.any(Object))
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain('/snapshot')
  })

  it('fetches a snapshot on browser online only after dirty sync requires one', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)

    renderGateWithProgressScope()
    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          progress: [],
        }),
      } as Response)

    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/progress/dva-c02/sync', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
  })

  it('clears baseline metadata when a required dirty-sync snapshot fails', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
  })

  it('preserves dirty progress when baseline recovery follows a failed required dirty-sync snapshot', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 5,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    expect(fetch).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/progress/dva-c02/sync', expect.any(Object))
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toMatchObject({
      baseRevision: 0,
    })
    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({
      qid: 1,
      lastPicks: ['A'],
    })
    expect(accountRepo.getProgress(1, 'DVA-C02')).not.toHaveProperty('dirtySince')
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 5,
    })
  })

  it('discards local dirty progress after revision conflict snapshot recovery', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 8, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], false, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 7,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
          error: { code: 'revision_conflict', message: 'conflict' },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 7,
          progress: [],
        }),
      } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(accountRepo.getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 7,
    })
  })

  it('gates current certification content while revision conflict snapshot recovery is pending', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 8, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], false, 'DVA-C02')
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 7,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
          error: { code: 'revision_conflict', message: 'conflict' },
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('App content')).toBeNull()
    expect(screen.getByText('Syncing account progress')).not.toBeNull()

    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 7, progress: [] }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
  })

  it('gates content when switching to a certification already in revision conflict snapshot recovery', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 8, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], false, 'CLF-C02')
    let resolveSync: (response: Response) => void = () => {}
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSync = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.getByText('App content')).not.toBeNull()

    usePrefsStore.setState({ currentCert: 'CLF-C02' })
    await act(async () => {
      resolveSync({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'CLF-C02',
          revision: 7,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
          error: { code: 'revision_conflict', message: 'conflict' },
        }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(screen.queryByText('App content')).toBeNull()
    expect(screen.getByText('Syncing account progress')).not.toBeNull()

    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({ cert: 'CLF-C02', revision: 7, progress: [] }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('App content')).not.toBeNull())
  })

  it('shows retry when switched-to revision conflict snapshot recovery fails', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 8, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], false, 'CLF-C02')
    let resolveSync: (response: Response) => void = () => {}
    let rejectSnapshot: (error: Error) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSync = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectSnapshot = reject
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    usePrefsStore.setState({ currentCert: 'CLF-C02' })
    await act(async () => {
      resolveSync({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'CLF-C02',
          revision: 7,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
          error: { code: 'revision_conflict', message: 'conflict' },
        }),
      } as Response)
      await Promise.resolve()
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    await act(async () => {
      rejectSnapshot(new Error('offline'))
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull()
    expect(screen.queryByText('Syncing account progress')).toBeNull()
    expect(screen.queryByText('App content')).toBeNull()
  })

  it('leaves the current certification in sync failure state when revision conflict snapshot recovery fails', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 8, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], false, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 7,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
          error: { code: 'revision_conflict', message: 'conflict' },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(screen.getByText('Account progress could not sync')).not.toBeNull())
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
  })

  it('reconciles validation rejected dirty progress through a snapshot and shows one partial-sync toast', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], false, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [{ index: 0, qid: 1, code: 'invalid_progress' }],
          snapshotRequired: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 4, progress: [] }),
      } as Response)

    renderGateWithProgressScope(
      undefined,
      <>
        <div>App content</div>
        <ToastHost />
      </>,
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(accountRepo.getProgress(1, 'DVA-C02')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(
      'Some progress could not sync and was restored from your account.',
    )
  })

  it('signs out and stores a login message after a 401 dirty sync response', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)

    renderGateWithProgressScope()

    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }))
    expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBeNull()
    expect(localStorage.getItem(ACCOUNT_PROGRESS_SYNC_KEY)).toBeNull()
    expect(sessionStorage.getItem('ace-aws/sync-login-message/v1')).toBe('expired')
  })

  it('keeps dirty progress and retries temporary sync failures with lightweight backoff', async () => {
    vi.useFakeTimers()
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function SyncStatus() {
      const { status } = useAccountProgressSync()
      return <div>Sync state: {status}</div>
    }

    renderGateWithProgressScope(undefined, <SyncStatus />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({ dirtySince: expect.any(Number) })
    expect(screen.getByText('Sync state: failed')).not.toBeNull()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Sync state: synced')).not.toBeNull()
  })

  it('prioritizes provider sync status as syncing, failed, dirty, then synced', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>(() => {
            // Keep manual sync in flight so the public status can be observed as syncing.
          }),
      )
    const accountRepo = new LocalProgressRepository('account')
    function SyncStatus() {
      const { enqueueDirtySync, status, syncNow } = useAccountProgressSync()
      return (
        <>
          <div>Sync state: {status}</div>
          <button
            type="button"
            onClick={() => {
              accountRepo.recordAnswer(1, ['A'], true, 'DVA-C02')
              enqueueDirtySync('DVA-C02')
            }}
          >
            Mark dirty
          </button>
          <button
            type="button"
            onClick={() => {
              void syncNow()
            }}
          >
            Sync now
          </button>
        </>
      )
    }

    renderGateWithProgressScope(undefined, <SyncStatus />)
    await waitFor(() => expect(screen.getByText('Sync state: synced')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Mark dirty' }))
    await waitFor(() => expect(screen.getByText('Sync state: dirty')).not.toBeNull())

    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.getByText('Sync state: failed')).not.toBeNull())
    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({ dirtySince: expect.any(Number) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByText('Sync state: syncing')).not.toBeNull())
  })

  it('stops current-page automatic retry after a payload-level 400 and keeps local progress', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 400 } as Response)

    renderGateWithProgressScope(
      undefined,
      <>
        <div>App content</div>
        <ToastHost />
      </>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('online'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({ dirtySince: expect.any(Number) })
    expect(screen.queryByRole('button', { name: /recover/i })).toBeNull()
  })

  it('stops syncing an unknown certification response without changing the selected certification', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 404 } as Response)

    renderGateWithProgressScope(
      undefined,
      <>
        <div>App content</div>
        <ToastHost />
      </>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('online'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
    expect(screen.getByRole('status').textContent).toBe(
      'Progress sync stopped for this certification.',
    )
  })

  it('keeps local changes dirty when they happen after sync requires a snapshot', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], false, 'DVA-C02')
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    accountRepo.recordAnswer(1, ['C'], true, 'DVA-C02')
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          progress: [
            {
              qid: 1,
              correctCount: 0,
              wrongCount: 1,
              lastPicks: ['A'],
              lastCorrect: false,
              lastAnsweredAt: '2023-11-14T22:13:20.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['C'],
      lastCorrect: true,
      dirtySince: expect.any(Number),
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 4,
    })
  })

  it('does not start overlapping sync flows for the same certification', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveSync: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSync = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('online'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSync({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not apply dirty sync responses after account scope is cleared', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveSync: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSync = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    LocalProgressRepository.clearScope('account')
    await act(async () => {
      resolveSync({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
  })

  it('does not apply dirty sync snapshots after account scope is cleared', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [],
          snapshotRequired: true,
        }),
      } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    LocalProgressRepository.clearScope('account')
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          progress: [
            {
              qid: 1,
              correctCount: 1,
              wrongCount: 0,
              lastPicks: ['A'],
              lastCorrect: true,
              lastAnsweredAt: '2026-01-01T00:00:00.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toBeNull()
  })

  it('keeps local in-flight changes dirty when an older sync response is accepted', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(1, ['A'], false, 'DVA-C02')
    let resolveSync: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSync = resolve
          }),
      )

    renderGateWithProgressScope()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    accountRepo.recordAnswer(1, ['C'], true, 'DVA-C02')
    await act(async () => {
      resolveSync({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [
            {
              qid: 1,
              correctCount: 0,
              wrongCount: 1,
              lastPicks: ['A'],
              lastCorrect: false,
              lastAnsweredAt: '2023-11-14T22:13:20.000Z',
              bookmarked: false,
              bookmarkUpdatedAt: null,
            },
          ],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
      await Promise.resolve()
    })

    expect(accountRepo.getProgress(1, 'DVA-C02')).toMatchObject({
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['C'],
      lastCorrect: true,
      dirtySince: expect.any(Number),
    })
    expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toMatchObject({
      revision: 4,
    })
  })

  it('manual sync bypasses debounce, flushes all dirty ready certifications, snapshots current cert, and shows a success toast', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'CLF-C02', 8, [])
    vi.mocked(fetch)
      .mockReset()
      .mockImplementation((url) => {
        if (String(url).includes('/dva-c02/snapshot')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ cert: 'DVA-C02', revision: 5, progress: [] }),
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cert: String(url).includes('/clf-c02/') ? 'CLF-C02' : 'DVA-C02',
            revision: String(url).includes('/clf-c02/') ? 9 : 4,
            accepted: [],
            rejected: [],
            snapshotRequired: false,
          }),
        } as Response)
      })
    function ManualSyncButton() {
      const { enqueueDirtySync, syncNow } = useAccountProgressSync()
      return (
        <button
          type="button"
          onClick={() => {
            const repo = new LocalProgressRepository('account')
            repo.recordAnswer(1, ['A'], true, 'CLF-C02')
            repo.recordAnswer(2, ['B'], false, 'DVA-C02')
            enqueueDirtySync('CLF-C02')
            void syncNow()
          }}
        >
          Sync now
        </button>
      )
    }

    renderGateWithProgressScope(
      undefined,
      <>
        <ManualSyncButton />
        <ToastHost />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/progress/dva-c02/sync', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/progress/clf-c02/sync', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/progress/dva-c02/snapshot', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('status').textContent).toBe('Progress synced.')
  })

  it('manual sync reports failure without clearing dirty progress', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValue({ ok: false, status: 503 } as Response)
    function ManualSyncStatus() {
      const { status, syncNow } = useAccountProgressSync()
      return (
        <>
          <div>Sync state: {status}</div>
          <button
            type="button"
            onClick={() => {
              new LocalProgressRepository('account').recordAnswer(1, ['A'], true, 'DVA-C02')
              void syncNow()
            }}
          >
            Sync now
          </button>
        </>
      )
    }

    renderGateWithProgressScope(
      undefined,
      <>
        <ManualSyncStatus />
        <ToastHost />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(screen.getByText('Sync state: failed')).not.toBeNull())
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toMatchObject({
      dirtySince: expect.any(Number),
    })
    expect(screen.getByRole('status').textContent).toBe(
      'Sync is unavailable. Your progress is still saved here.',
    )
  })

  it('keeps dirty progress written while manual current-cert snapshot is in flight', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    let resolveSnapshot: (response: Response) => void = () => {}
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 3,
          accepted: [],
          rejected: [],
          snapshotRequired: false,
        }),
      } as Response)
    function ManualSyncButton() {
      const { syncNow } = useAccountProgressSync()
      return (
        <button type="button" onClick={() => void syncNow()}>
          Sync now
        </button>
      )
    }

    renderGateWithProgressScope(undefined, <ManualSyncButton />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeNull())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSnapshot = resolve
        }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/snapshot', expect.any(Object)),
    )

    const accountRepo = new LocalProgressRepository('account')
    accountRepo.recordAnswer(9, ['C'], true, 'DVA-C02')
    const dirtyProgress = accountRepo.getProgress(9, 'DVA-C02')
    await act(async () => {
      resolveSnapshot({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 4, progress: [] }),
      } as Response)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(accountRepo.getProgress(9, 'DVA-C02')).toMatchObject({
      qid: 9,
      lastPicks: ['C'],
      lastAnsweredAt: dirtyProgress?.lastAnsweredAt,
      dirtySince: expect.any(Number),
    })
  })

  it('sync before sign-out treats validation rejection snapshot recovery as safe success', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
    LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', 'DVA-C02', 3, [])
    new LocalProgressRepository('account').recordAnswer(1, ['A'], false, 'DVA-C02')
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cert: 'DVA-C02',
          revision: 4,
          accepted: [],
          rejected: [{ index: 0, qid: 1, code: 'invalid_progress' }],
          snapshotRequired: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cert: 'DVA-C02', revision: 4, progress: [] }),
      } as Response)
    function SignOutSyncButton() {
      const { syncBeforeSignOut } = useAccountProgressSync()
      return (
        <button
          type="button"
          onClick={async () => {
            const result = await syncBeforeSignOut()
            if (result.ok) authMocks.signOut({ callbackUrl: '/login' })
          }}
        >
          Sign out
        </button>
      )
    }

    renderGateWithProgressScope(
      undefined,
      <>
        <SignOutSyncButton />
        <ToastHost />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }))
    expect(new LocalProgressRepository('account').getProgress(1, 'DVA-C02')).toBeNull()
  })
})
