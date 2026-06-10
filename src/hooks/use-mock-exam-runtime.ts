'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccountProgressSync } from '@/components/providers/account-progress-sync-provider'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import type { Letter } from '@/data/types'
import {
  useDeleteMockExamDraft,
  useSaveMockExamDraft,
  useSubmitMockExamAttempt,
} from '@/hooks/use-mock-exam'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import {
  answerMockExamQuestion,
  deriveMockExamRemainingSeconds,
  isMockExamTimerWarning,
  navigateMockExamAttempt,
  saveAndExitMockExamDraft,
  toggleMockExamFlag,
} from '@/lib/mock-exam/attempt-state'
import {
  deleteLocalMockExamSubmittedAttempt,
  getLocalMockExamSubmittedAttempt,
} from '@/lib/mock-exam/local-repository'
import { getMockExamDraftRepository } from '@/lib/mock-exam/repository'
import type { MockExamAttempt } from '@/lib/mock-exam/start-attempt'
import { recordSubmittedMockExamProgress, submitMockExamAttempt } from '@/lib/mock-exam/submission'

export type MockExamRuntimeLastError = 'load' | 'persist' | 'submit' | null

export type MockExamRuntime = {
  attempt: MockExamAttempt | null | undefined
  remainingSeconds: number
  timerWarning: boolean
  isLocked: boolean
  currentPicks: Letter[]
  requiredPickCount: number
  multiSelectionComplete: boolean
  lastError: MockExamRuntimeLastError
  pick: (letter: Letter) => Promise<void>
  toggleFlag: () => Promise<void>
  navigate: (index: number) => Promise<void>
  saveExit: () => Promise<void>
  discard: () => Promise<void>
  submit: () => Promise<void>
}

export function useMockExamRuntime(attemptId: string): MockExamRuntime {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { scope, progress } = useProgressScope()
  const { enqueueDirtySync } = useAccountProgressSync()
  const t = useT()
  const { toast } = useToast()
  const [attempt, setAttempt] = useState<MockExamAttempt | null | undefined>(undefined)
  const [currentPicks, setCurrentPicks] = useState<Letter[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [lastError, setLastError] = useState<MockExamRuntimeLastError>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [submissionStarted, setSubmissionStarted] = useState(false)
  const autoSubmitStarted = useRef(false)
  const autoSubmitAttemptedAt = useRef<number | null>(null)
  const { mutateAsync: saveMockExamDraft } = useSaveMockExamDraft()
  const { mutateAsync: deleteMockExamDraft } = useDeleteMockExamDraft()
  const { mutateAsync: submitMockExamAttemptMutation } = useSubmitMockExamAttempt()

  const detectLocked = useCallback(() => {
    if (submissionStarted || alreadySubmitted) return true
    if (getLocalMockExamSubmittedAttempt(attemptId) === null) return false
    setAlreadySubmitted(true)
    return true
  }, [alreadySubmitted, attemptId, submissionStarted])

  useEffect(() => {
    let cancelled = false
    async function loadAttempt() {
      setAttempt(undefined)
      setLastError(null)
      try {
        const nextAttempt = await getMockExamDraftRepository(scope).getAttempt(attemptId)
        if (cancelled) return
        setAttempt(nextAttempt)
        setAlreadySubmitted(getLocalMockExamSubmittedAttempt(attemptId) !== null)
        setCurrentPicks(nextAttempt?.questions[nextAttempt.currentIndex]?.userPicks ?? [])
      } catch {
        if (cancelled) return
        setAttempt(null)
        setCurrentPicks([])
        setAlreadySubmitted(false)
        setLastError('load')
      }
    }
    void loadAttempt()
    return () => {
      cancelled = true
    }
  }, [attemptId, scope])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const snapshot = attempt?.questions[attempt.currentIndex]
  const requiredPickCount = snapshot?.type === 'multi' ? snapshot.correctAnswer.length : 1
  const multiSelectionComplete =
    snapshot?.type !== 'multi' || currentPicks.length === requiredPickCount
  const remainingSeconds = attempt ? deriveMockExamRemainingSeconds(attempt, now) : 0

  const persistDraft = useCallback(
    async (nextAttempt: MockExamAttempt, nextCurrentPicks?: Letter[]) => {
      setAttempt(nextAttempt)
      setCurrentPicks(
        nextCurrentPicks ?? nextAttempt.questions[nextAttempt.currentIndex]?.userPicks ?? [],
      )
      try {
        await saveMockExamDraft(nextAttempt)
        setLastError(null)
      } catch {
        setLastError('persist')
      }
    },
    [saveMockExamDraft],
  )

  const pick = useCallback(
    async (letter: Letter) => {
      if (!attempt || detectLocked()) return
      const activeSnapshot = attempt.questions[attempt.currentIndex]
      if (!activeSnapshot) return

      if (activeSnapshot.type !== 'multi') {
        const nextPicks = currentPicks.includes(letter) ? [] : [letter]
        await persistDraft(
          answerMockExamQuestion(attempt, attempt.currentIndex, nextPicks),
          nextPicks,
        )
        return
      }

      const nextPicks = currentPicks.includes(letter)
        ? currentPicks.filter((pick) => pick !== letter)
        : currentPicks.length >= activeSnapshot.correctAnswer.length
          ? [...currentPicks.slice(1), letter]
          : [...currentPicks, letter]
      await persistDraft(
        answerMockExamQuestion(attempt, attempt.currentIndex, nextPicks),
        nextPicks,
      )
    },
    [attempt, currentPicks, detectLocked, persistDraft],
  )

  const toggleFlag = useCallback(async () => {
    if (!attempt || detectLocked()) return
    await persistDraft(toggleMockExamFlag(attempt, attempt.currentIndex), currentPicks)
  }, [attempt, currentPicks, detectLocked, persistDraft])

  const navigate = useCallback(
    async (index: number) => {
      if (!attempt || detectLocked()) return
      const nextAttempt = navigateMockExamAttempt(attempt, index)
      if (nextAttempt === attempt) return
      await persistDraft(nextAttempt)
    },
    [attempt, detectLocked, persistDraft],
  )

  const saveExit = useCallback(async () => {
    if (!attempt || detectLocked()) return
    const savedAttempt = saveAndExitMockExamDraft(attempt, Date.now())
    try {
      await saveMockExamDraft(savedAttempt)
      setAttempt(savedAttempt)
      setCurrentPicks(savedAttempt.questions[savedAttempt.currentIndex]?.userPicks ?? [])
      setLastError(null)
      router.replace('/')
    } catch {
      setLastError('persist')
    }
  }, [attempt, detectLocked, router, saveMockExamDraft])

  const discard = useCallback(async () => {
    if (!attempt || detectLocked()) return
    try {
      await deleteMockExamDraft(attempt.cert)
      setAttempt(null)
      setCurrentPicks([])
      setLastError(null)
      router.replace('/')
    } catch {
      setLastError('persist')
    }
  }, [attempt, deleteMockExamDraft, detectLocked, router])

  const finishSubmit = useCallback(
    async (autoSubmitted: boolean, resetLockOnFailure: boolean) => {
      if (!attempt) return
      setSubmissionStarted(true)
      const submitted = submitMockExamAttempt(attempt, {
        progress,
        now: () => Date.now(),
        autoSubmitted,
        persistLocalHistory: false,
        applyProgress: false,
      })
      let persistedSubmitted = submitted
      try {
        persistedSubmitted = await submitMockExamAttemptMutation(submitted)
      } catch {
        setLastError('submit')
        if (resetLockOnFailure) {
          deleteLocalMockExamSubmittedAttempt(attempt.id)
          if (autoSubmitted) autoSubmitStarted.current = false
          setSubmissionStarted(false)
        }
        return
      }
      try {
        recordSubmittedMockExamProgress(persistedSubmitted, progress, scope !== 'account')
        queryClient.invalidateQueries({ queryKey: ['progress', scope] })
        if (scope === 'account') enqueueDirtySync(persistedSubmitted.cert)
      } catch {
        // Submitted history is already persisted; later retries should use that immutable snapshot.
      }
      if (autoSubmitted) toast(t('mockExamAutoSubmittedToast'))
      setAlreadySubmitted(true)
      setLastError(null)
      router.replace(`/mock-exam/attempt/${persistedSubmitted.id}/result`)
    },
    [
      attempt,
      enqueueDirtySync,
      progress,
      queryClient,
      router,
      scope,
      submitMockExamAttemptMutation,
      t,
      toast,
    ],
  )

  const submit = useCallback(async () => {
    if (!attempt || detectLocked()) return
    setSubmissionStarted(true)
    await finishSubmit(false, true)
  }, [attempt, detectLocked, finishSubmit])

  useEffect(() => {
    if (!attempt || submissionStarted || alreadySubmitted || autoSubmitStarted.current) return
    if (remainingSeconds > 0) return
    if (autoSubmitAttemptedAt.current === now) return
    if (getLocalMockExamSubmittedAttempt(attempt.id) !== null) {
      setAlreadySubmitted(true)
      return
    }
    autoSubmitStarted.current = true
    autoSubmitAttemptedAt.current = now
    void finishSubmit(true, true)
  }, [alreadySubmitted, attempt, finishSubmit, now, remainingSeconds, submissionStarted])

  return useMemo(
    () => ({
      attempt,
      remainingSeconds,
      timerWarning: isMockExamTimerWarning(remainingSeconds),
      isLocked: submissionStarted || alreadySubmitted,
      currentPicks,
      requiredPickCount,
      multiSelectionComplete,
      lastError,
      pick,
      toggleFlag,
      navigate,
      saveExit,
      discard,
      submit,
    }),
    [
      alreadySubmitted,
      attempt,
      currentPicks,
      discard,
      lastError,
      multiSelectionComplete,
      navigate,
      pick,
      remainingSeconds,
      requiredPickCount,
      saveExit,
      submissionStarted,
      submit,
      toggleFlag,
    ],
  )
}
