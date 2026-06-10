import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Letter, ProgressScope } from '../src/data/types'
import { useMockExamRuntime } from '../src/hooks/use-mock-exam-runtime'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import {
  getLocalMockExamSubmittedAttempt,
  saveLocalMockExamSubmittedAttempt,
} from '../src/lib/mock-exam/local-repository'
import type { MockExamDraftRepository } from '../src/lib/mock-exam/repository'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'

const DAILY_STATS_NOW = new Date(2020, 0, 15, 12).getTime()
const DAILY_STATS_DATE = localDateKey(DAILY_STATS_NOW)

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

const progressScopeMocks = vi.hoisted(() => ({
  scope: 'anonymous' as ProgressScope,
  progress: null as unknown as BrowserProgressModule,
}))

const progressSyncMocks = vi.hoisted(() => ({
  enqueueDirtySync: vi.fn(),
}))

const queryClientMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

const repositoryMocks = vi.hoisted(() => ({
  repository: null as MockExamDraftRepository | null,
  getMockExamDraftRepository: vi.fn(),
}))

const mockExamHookMocks = vi.hoisted(() => ({
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
  submitAttempt: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => toastMocks,
}))

vi.mock('@/hooks/use-t', () => ({
  useT: () => (key: string) =>
    key === 'mockExamAutoSubmittedToast' ? 'Time expired. Your mock exam was submitted.' : key,
}))

vi.mock('@/components/providers/progress-scope-provider', () => ({
  useProgressScope: () => progressScopeMocks,
}))

vi.mock('@/components/providers/account-progress-sync-provider', () => ({
  useAccountProgressSync: () => progressSyncMocks,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClientMocks,
}))

vi.mock('@/lib/mock-exam/repository', () => ({
  getMockExamDraftRepository: repositoryMocks.getMockExamDraftRepository,
}))

vi.mock('@/hooks/use-mock-exam', () => ({
  useSaveMockExamDraft: () => ({ mutateAsync: mockExamHookMocks.saveDraft }),
  useDeleteMockExamDraft: () => ({ mutateAsync: mockExamHookMocks.deleteDraft }),
  useSubmitMockExamAttempt: () => ({ mutateAsync: mockExamHookMocks.submitAttempt }),
}))

beforeEach(() => {
  localStorage.clear()
  routerMocks.push.mockReset()
  routerMocks.replace.mockReset()
  toastMocks.toast.mockReset()
  progressSyncMocks.enqueueDirtySync.mockReset()
  queryClientMocks.invalidateQueries.mockReset()
  mockExamHookMocks.saveDraft.mockReset()
  mockExamHookMocks.saveDraft.mockResolvedValue(undefined)
  mockExamHookMocks.deleteDraft.mockReset()
  mockExamHookMocks.deleteDraft.mockResolvedValue(undefined)
  mockExamHookMocks.submitAttempt.mockReset()
  mockExamHookMocks.submitAttempt.mockImplementation(
    async (submitted: SubmittedMockExamAttempt) => submitted,
  )
  progressScopeMocks.scope = 'anonymous'
  progressScopeMocks.progress = new BrowserProgressModule('anonymous')
  repositoryMocks.repository = createRepository()
  repositoryMocks.getMockExamDraftRepository.mockReset()
  repositoryMocks.getMockExamDraftRepository.mockImplementation(() => repositoryMocks.repository)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useMockExamRuntime', () => {
  it('loads an attempt by id and exposes current question runtime state', async () => {
    const attempt = makeAttempt('attempt-runtime-load', [
      { qid: 101, userPicks: ['B'], correctAnswer: ['A'] },
      { qid: 102, type: 'multi', correctAnswer: ['A', 'B'] },
    ])
    attempt.currentIndex = 0
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))

    expect(result.current.attempt).toBeUndefined()

    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    expect(repositoryMocks.repository?.getAttempt).toHaveBeenCalledWith(attempt.id)
    expect(result.current.remainingSeconds).toBe(7800)
    expect(result.current.timerWarning).toBe(false)
    expect(result.current.isLocked).toBe(false)
    expect(result.current.currentPicks).toEqual(['B'])
    expect(result.current.requiredPickCount).toBe(1)
    expect(result.current.multiSelectionComplete).toBe(true)
    expect(result.current.lastError).toBeNull()
  })

  it('deselects a selected single-choice option and marks the snapshot unanswered', async () => {
    const attempt = makeAttempt('attempt-runtime-single-pick', [{ qid: 101 }])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.attempt?.id).toBe(attempt.id)

    await act(async () => {
      await result.current.pick('B')
    })

    expect(mockExamHookMocks.saveDraft).toHaveBeenCalledTimes(1)
    expect(result.current.currentPicks).toEqual(['B'])
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: ['B'],
      answered: true,
      correct: false,
    })

    await act(async () => {
      await result.current.pick('B')
    })

    expect(result.current.currentPicks).toEqual([])
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: [],
      answered: false,
      correct: null,
    })
  })

  it('keeps multi-choice picks in insertion order while storing canonical snapshots', async () => {
    const attempt = makeAttempt('attempt-runtime-multi-pick', [
      { qid: 101, type: 'multi', correctAnswer: ['A', 'B'] },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.pick('B')
    })
    await act(async () => {
      await result.current.pick('A')
    })

    expect(result.current.currentPicks).toEqual(['B', 'A'])
    expect(result.current.multiSelectionComplete).toBe(true)
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: ['A', 'B'],
      answered: true,
      correct: true,
    })

    await act(async () => {
      await result.current.pick('C')
    })

    expect(result.current.currentPicks).toEqual(['A', 'C'])
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: ['A', 'C'],
      answered: true,
      correct: false,
    })

    await act(async () => {
      await result.current.pick('A')
    })

    expect(result.current.currentPicks).toEqual(['C'])
    expect(result.current.multiSelectionComplete).toBe(false)
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: ['C'],
      answered: false,
      correct: null,
    })
  })

  it('toggles and persists the current question flag', async () => {
    const attempt = makeAttempt('attempt-runtime-flag', [{ qid: 101 }, { qid: 102, flagged: true }])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.attempt?.id).toBe(attempt.id)

    await act(async () => {
      await result.current.toggleFlag()
    })

    expect(mockExamHookMocks.saveDraft).toHaveBeenCalledTimes(1)
    expect(result.current.attempt?.questions[0]?.flagged).toBe(true)
    expect(result.current.attempt?.questions[1]?.flagged).toBe(true)
  })

  it('preserves active multi-choice pick order when toggling the current flag', async () => {
    const attempt = makeAttempt('attempt-runtime-flag-keeps-pick-order', [
      { qid: 101, type: 'multi', correctAnswer: ['A', 'B'] },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.pick('B')
    })
    await act(async () => {
      await result.current.pick('A')
    })

    expect(result.current.currentPicks).toEqual(['B', 'A'])
    expect(result.current.attempt?.questions[0]?.userPicks).toEqual(['A', 'B'])

    await act(async () => {
      await result.current.toggleFlag()
    })

    expect(result.current.currentPicks).toEqual(['B', 'A'])

    await act(async () => {
      await result.current.pick('C')
    })

    expect(result.current.currentPicks).toEqual(['A', 'C'])
    expect(result.current.attempt?.questions[0]?.userPicks).toEqual(['A', 'C'])
  })

  it('navigates within the attempt and exposes picks for the new current question', async () => {
    const attempt = makeAttempt('attempt-runtime-navigate', [
      { qid: 101, userPicks: ['A'] },
      { qid: 102, type: 'multi', correctAnswer: ['A', 'B'], userPicks: ['B'] },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.navigate(9)
    })

    expect(mockExamHookMocks.saveDraft).toHaveBeenCalledTimes(1)
    expect(routerMocks.push).not.toHaveBeenCalled()
    expect(result.current.attempt?.currentIndex).toBe(1)
    expect(result.current.currentPicks).toEqual(['B'])
    expect(result.current.requiredPickCount).toBe(2)
    expect(result.current.multiSelectionComplete).toBe(false)
  })

  it('resets multi-choice pick order from the canonical snapshot after navigating away and back', async () => {
    const attempt = makeAttempt('attempt-runtime-pick-order-reset', [
      { qid: 101, type: 'multi', correctAnswer: ['A', 'B'] },
      { qid: 102 },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.pick('B')
    })
    await act(async () => {
      await result.current.pick('A')
    })

    expect(result.current.currentPicks).toEqual(['B', 'A'])
    expect(result.current.attempt?.questions[0]?.userPicks).toEqual(['A', 'B'])

    await act(async () => {
      await result.current.navigate(1)
    })
    await act(async () => {
      await result.current.navigate(0)
    })

    expect(result.current.currentPicks).toEqual(['A', 'B'])

    await act(async () => {
      await result.current.pick('C')
    })

    expect(result.current.currentPicks).toEqual(['B', 'C'])
    expect(result.current.attempt?.questions[0]?.userPicks).toEqual(['B', 'C'])
  })

  it('saves and exits with accumulated elapsed time before routing home', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-save-exit', [{ qid: 101 }])
    attempt.startedAt = 10_000
    attempt.updatedAt = 10_000
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.attempt?.id).toBe(attempt.id)

    vi.setSystemTime(70_000)
    await act(async () => {
      await result.current.saveExit()
    })

    const saved = vi.mocked(mockExamHookMocks.saveDraft).mock.calls[0]?.[0]
    expect(saved).toMatchObject({
      id: attempt.id,
      draftStatus: 'saved',
      elapsedSeconds: 60,
      timeLimitSeconds: 7740,
      startedAt: 70_000,
    })
    expect(routerMocks.replace).toHaveBeenCalledWith('/')
  })

  it('keeps the active timer running when save-and-exit persistence fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-save-exit-fails', [{ qid: 101 }])
    attempt.startedAt = 10_000
    attempt.updatedAt = 10_000
    attempt.timeLimitSeconds = 100
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.saveDraft).mockRejectedValueOnce(new Error('save failed'))

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.remainingSeconds).toBe(100)

    vi.setSystemTime(40_000)
    await act(async () => {
      await result.current.saveExit()
    })

    expect(result.current.lastError).toBe('persist')
    expect(result.current.attempt?.draftStatus).toBe('active')
    expect(routerMocks.replace).not.toHaveBeenCalled()

    vi.setSystemTime(41_000)
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.remainingSeconds).toBeLessThan(70)
  })

  it('discards the draft and routes home', async () => {
    const attempt = makeAttempt('attempt-runtime-discard', [{ qid: 101 }])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.discard()
    })

    expect(mockExamHookMocks.deleteDraft).toHaveBeenCalledWith('DVA-C02')
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(result.current.attempt).toBeNull()
    expect(routerMocks.replace).toHaveBeenCalledWith('/')
  })

  it('submits the attempt, deletes the draft, locks, and routes to the result', async () => {
    const attempt = makeAttempt('attempt-runtime-submit', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.isLocked).toBe(true)
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: attempt.id, cert: 'DVA-C02' }),
    )
    expect(queryClientMocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['progress', 'anonymous'],
    })
    expect(queryClientMocks.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['progress', 'anonymous', 'question', 'DVA-C02', 101],
    })
    expect(queryClientMocks.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['progress', 'anonymous', 'daily-stats', 'DVA-C02'],
    })
    expect(progressSyncMocks.enqueueDirtySync).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)
  })

  it('treats manual submit after wall-clock expiration as an explicit submit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-submit-at-zero', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    attempt.startedAt = 10_000
    attempt.timeLimitSeconds = 1
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.attempt?.id).toBe(attempt.id)
    expect(result.current.remainingSeconds).toBe(1)

    vi.setSystemTime(11_000)

    await act(async () => {
      await result.current.submit()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
    const submitted = vi.mocked(mockExamHookMocks.submitAttempt).mock.calls[0]?.[0]
    expect(submitted?.summary.autoSubmitted).toBe(false)
    expect(toastMocks.toast).not.toHaveBeenCalled()
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)
  })

  it('submits account-scoped attempts without writing anonymous local history', async () => {
    progressScopeMocks.scope = 'account'
    progressScopeMocks.progress = new BrowserProgressModule('account')
    const attempt = makeAttempt('attempt-runtime-account-submit', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(localStorage.getItem('ace-aws/mock-exam/local/v1')).toBeNull()
    expect(progressScopeMocks.progress.getProgress(101, 'DVA-C02')).toMatchObject({
      correctCount: 1,
      wrongCount: 0,
    })
    expect(queryClientMocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['progress', 'account'],
    })
    expect(queryClientMocks.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['progress', 'account', 'question', 'DVA-C02', 101],
    })
    expect(queryClientMocks.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['progress', 'account', 'daily-stats', 'DVA-C02'],
    })
    expect(progressSyncMocks.enqueueDirtySync).toHaveBeenCalledWith('DVA-C02')
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
  })

  it('does not double-count account progress or daily stats when runtime reapplies the same submitted attempt', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(DAILY_STATS_NOW)
    progressScopeMocks.scope = 'account'
    progressScopeMocks.progress = new BrowserProgressModule('account')
    const attempt = makeAttempt('attempt-runtime-account-submit-reapply-daily-stats', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
      { qid: 102, userPicks: ['B'], answered: true, correct: false },
    ])
    setRepositoryAttempt(attempt)
    let persistedSubmitted: SubmittedMockExamAttempt | null = null
    vi.mocked(mockExamHookMocks.submitAttempt).mockImplementation(
      async (submitted: SubmittedMockExamAttempt) => {
        if (persistedSubmitted === null) persistedSubmitted = submitted
        return persistedSubmitted
      },
    )

    const first = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(first.result.current.attempt?.id).toBe(attempt.id))
    await act(async () => {
      await first.result.current.submit()
    })
    first.unmount()

    const second = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(second.result.current.attempt?.id).toBe(attempt.id))
    await act(async () => {
      await second.result.current.submit()
    })
    second.unmount()

    expect(progressScopeMocks.progress.getProgress(101, 'DVA-C02')).toMatchObject({
      correctCount: 1,
    })
    expect(progressScopeMocks.progress.getProgress(102, 'DVA-C02')).toMatchObject({
      wrongCount: 1,
    })
    expect(progressScopeMocks.progress.listDailyStats('DVA-C02')).toEqual([
      { date: DAILY_STATS_DATE, correctCount: 1, wrongCount: 1, updatedAt: DAILY_STATS_NOW },
    ])
    dateNowSpy.mockRestore()
  })

  it('auto-submits exactly once when the timer reaches zero', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-auto-submit', [{ qid: 101 }])
    attempt.startedAt = 10_000
    attempt.timeLimitSeconds = 2
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.remainingSeconds).toBe(2)

    await act(async () => {
      vi.advanceTimersByTime(2_000)
      await Promise.resolve()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(toastMocks.toast).toHaveBeenCalledWith('Time expired. Your mock exam was submitted.')
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)

    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
  })

  it('retries auto-submit on a later tick after transient persistence failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-auto-submit-retry', [{ qid: 101 }])
    attempt.startedAt = 10_000
    attempt.timeLimitSeconds = 1
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.submitAttempt).mockRejectedValueOnce(new Error('submit failed'))

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.remainingSeconds).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.lastError).toBe('submit')
    expect(result.current.isLocked).toBe(false)
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
    expect(routerMocks.replace).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(2)
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(toastMocks.toast).toHaveBeenCalledTimes(1)
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)

    await act(async () => {
      vi.advanceTimersByTime(5_000)
      await Promise.resolve()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(2)
  })

  it('ticks remaining seconds and derives the warning threshold', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const attempt = makeAttempt('attempt-runtime-timer-warning', [{ qid: 101 }])
    attempt.startedAt = 10_000
    attempt.timeLimitSeconds = 600
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.remainingSeconds).toBe(600)
    expect(result.current.timerWarning).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(result.current.remainingSeconds).toBe(599)
    expect(result.current.timerWarning).toBe(true)
  })

  it('sets lastError to load when the attempt cannot be read', async () => {
    vi.mocked(repositoryMocks.repository?.getAttempt).mockRejectedValue(new Error('load failed'))

    const { result } = renderHook(() => useMockExamRuntime('attempt-runtime-load-fails'))

    await waitFor(() => expect(result.current.lastError).toBe('load'))
    expect(result.current.attempt).toBeNull()
  })

  it('exposes a missing attempt without marking it as a load failure', async () => {
    setRepositoryAttempt(null)

    const { result } = renderHook(() => useMockExamRuntime('attempt-runtime-missing'))

    await waitFor(() => expect(result.current.attempt).toBeNull())
    expect(result.current.lastError).toBeNull()
  })

  it('sets lastError to persist when a draft command cannot be saved', async () => {
    const attempt = makeAttempt('attempt-runtime-persist-fails', [{ qid: 101 }])
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.saveDraft).mockRejectedValueOnce(new Error('save failed'))

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.pick('A')
    })

    expect(result.current.lastError).toBe('persist')
    expect(toastMocks.toast).not.toHaveBeenCalled()
  })

  it('resets the manual submit lock when submitted history cannot be saved', async () => {
    const attempt = makeAttempt('attempt-runtime-submit-fails', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.submitAttempt).mockRejectedValueOnce(new Error('submit failed'))

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.lastError).toBe('submit')
    expect(result.current.isLocked).toBe(false)
    expect(getLocalMockExamSubmittedAttempt(attempt.id)).toBeNull()
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(routerMocks.replace).not.toHaveBeenCalled()
    expect(toastMocks.toast).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.pick('B')
    })

    expect(mockExamHookMocks.saveDraft).toHaveBeenCalledTimes(1)
    expect(result.current.currentPicks).toEqual(['B'])
  })

  it('keeps account-scoped submits on the attempt when the submitted draft is not cleared', async () => {
    progressScopeMocks.scope = 'account'
    progressScopeMocks.progress = new BrowserProgressModule('account')
    const attempt = makeAttempt('attempt-runtime-submit-server-draft-wins', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.submitAttempt).mockRejectedValueOnce(
      new Error('Failed to clear account-backed Mock Exam Draft'),
    )

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.lastError).toBe('submit')
    expect(result.current.isLocked).toBe(false)
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: attempt.id, cert: 'DVA-C02' }),
    )
    expect(routerMocks.replace).not.toHaveBeenCalled()
    expect(toastMocks.toast).not.toHaveBeenCalled()
  })

  it('records progress from the persisted submitted snapshot when retrying submit', async () => {
    progressScopeMocks.scope = 'account'
    progressScopeMocks.progress = new BrowserProgressModule('account')
    const attempt = makeAttempt('attempt-runtime-submit-retry-uses-existing', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)
    let persistedSubmitted: SubmittedMockExamAttempt | null = null
    vi.mocked(mockExamHookMocks.submitAttempt).mockImplementation(
      async (submitted: SubmittedMockExamAttempt) => {
        if (persistedSubmitted === null) {
          persistedSubmitted = submitted
          throw new Error('draft clear failed')
        }
        return persistedSubmitted
      },
    )

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })
    expect(result.current.lastError).toBe('submit')
    expect(result.current.isLocked).toBe(false)

    await act(async () => {
      await result.current.pick('B')
    })
    expect(result.current.attempt?.questions[0]).toMatchObject({
      userPicks: ['B'],
      correct: false,
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledTimes(2)
    expect(vi.mocked(mockExamHookMocks.submitAttempt).mock.calls[1]?.[0]).toMatchObject({
      id: attempt.id,
      questions: [expect.objectContaining({ userPicks: ['B'], correct: false })],
    })
    expect(progressScopeMocks.progress.getProgress(101, 'DVA-C02')).toMatchObject({
      correctCount: 1,
      wrongCount: 0,
    })
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)
  })

  it('removes premature submitted history when manual submit archive fails', async () => {
    const attempt = makeAttempt('attempt-runtime-submit-archive-fails', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)
    vi.mocked(mockExamHookMocks.submitAttempt).mockImplementationOnce(
      async (submitted: SubmittedMockExamAttempt) => {
        saveLocalMockExamSubmittedAttempt(submitted)
        throw new Error('archive failed')
      },
    )

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.lastError).toBe('submit')
    expect(result.current.isLocked).toBe(false)
    expect(routerMocks.replace).not.toHaveBeenCalled()
    expect(toastMocks.toast).not.toHaveBeenCalled()
    expect(getLocalMockExamSubmittedAttempt(attempt.id)).toBeNull()
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.pick('B')
    })

    expect(mockExamHookMocks.saveDraft).toHaveBeenCalledTimes(1)
    expect(result.current.currentPicks).toEqual(['B'])
  })

  it('keeps submitted attempts locked when progress recording fails after archive', async () => {
    const attempt = makeAttempt('attempt-runtime-progress-fails-after-archive', [
      { qid: 101, userPicks: ['A'], answered: true, correct: true },
    ])
    setRepositoryAttempt(attempt)
    progressScopeMocks.progress = {
      recordAnswer: vi.fn(() => {
        throw new Error('progress failed')
      }),
    } as unknown as BrowserProgressModule
    vi.mocked(mockExamHookMocks.submitAttempt).mockImplementationOnce(
      async (submitted: SubmittedMockExamAttempt) => {
        saveLocalMockExamSubmittedAttempt(submitted)
        return submitted
      },
    )

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.attempt?.id).toBe(attempt.id))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.lastError).toBeNull()
    expect(result.current.isLocked).toBe(true)
    expect(getLocalMockExamSubmittedAttempt(attempt.id)?.id).toBe(attempt.id)
    expect(mockExamHookMocks.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: attempt.id, cert: 'DVA-C02' }),
    )
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(routerMocks.replace).toHaveBeenCalledWith(`/mock-exam/attempt/${attempt.id}/result`)

    await act(async () => {
      await result.current.pick('B')
    })

    expect(mockExamHookMocks.saveDraft).not.toHaveBeenCalled()
  })

  it('locks an already-submitted attempt and makes commands no-op', async () => {
    const attempt = makeAttempt('attempt-runtime-already-submitted', [{ qid: 101 }])
    saveLocalMockExamSubmittedAttempt(makeSubmitted(attempt))
    setRepositoryAttempt(attempt)

    const { result } = renderHook(() => useMockExamRuntime(attempt.id))
    await waitFor(() => expect(result.current.isLocked).toBe(true))

    await act(async () => {
      await result.current.pick('A')
      await result.current.toggleFlag()
      await result.current.navigate(0)
      await result.current.saveExit()
      await result.current.discard()
      await result.current.submit()
    })

    expect(mockExamHookMocks.saveDraft).not.toHaveBeenCalled()
    expect(mockExamHookMocks.submitAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.saveSubmittedAttempt).not.toHaveBeenCalled()
    expect(repositoryMocks.repository?.deleteDraft).not.toHaveBeenCalled()
    expect(routerMocks.replace).not.toHaveBeenCalled()
  })
})

function setRepositoryAttempt(attempt: MockExamAttempt | null) {
  vi.mocked(repositoryMocks.repository?.getAttempt).mockResolvedValue(attempt)
}

function createRepository(): MockExamDraftRepository {
  return {
    getDraft: vi.fn(),
    getAttempt: vi.fn(),
    getSubmittedAttempt: vi.fn(),
    getHistory: vi.fn(),
    saveDraft: vi.fn(),
    saveSubmittedAttempt: vi.fn(),
    deleteDraft: vi.fn(),
  }
}

function makeAttempt(
  id: string,
  questions: Array<{
    qid: number
    type?: 'single' | 'multi'
    correctAnswer?: Letter[]
    userPicks?: Letter[]
    flagged?: boolean
    answered?: boolean
    correct?: boolean | null
  }>,
): MockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    draftStatus: 'active',
    currentIndex: 0,
    questionCount: questions.length,
    timeLimitSeconds: 7800,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    updatedAt: Date.now(),
    questions: questions.map((question) => ({
      qid: question.qid,
      domain: 'Development with AWS Services',
      topic: 'Development',
      correctAnswer: question.correctAnswer ?? ['A'],
      type: question.type ?? 'single',
      userPicks: question.userPicks ?? [],
      correct: question.correct ?? null,
      flagged: question.flagged ?? false,
      answered: question.answered ?? (question.userPicks?.length ?? 0) > 0,
    })),
  }
}

function makeSubmitted(attempt: MockExamAttempt): SubmittedMockExamAttempt {
  return {
    id: attempt.id,
    cert: attempt.cert,
    submittedAt: Date.now(),
    questions: attempt.questions,
    summary: {
      score: 1000,
      passed: true,
      correctCount: 1,
      totalCount: attempt.questions.length,
      unansweredCount: 0,
      accuracy: 1,
      timeUsedSeconds: 0,
      autoSubmitted: false,
      domains: [],
    },
  }
}
