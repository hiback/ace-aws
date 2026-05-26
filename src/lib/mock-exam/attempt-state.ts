import type { Letter } from '@/data/types'
import type { MockExamAttempt, MockExamQuestionSnapshot } from './start-attempt'

export function answerMockExamQuestion(
  attempt: MockExamAttempt,
  index: number,
  picks: Letter[],
): MockExamAttempt {
  const question = attempt.questions[index]
  if (!question) return attempt

  const nextPicks = canonicalPicks(picks)
  if (!isValidPickCount(question, nextPicks)) return attempt
  const requiredPickCount = question.type === 'multi' ? question.correctAnswer.length : 1
  const answered = nextPicks.length === requiredPickCount

  return updateQuestion(attempt, index, {
    userPicks: nextPicks,
    answered,
    correct: answered ? sameLetters(nextPicks, question.correctAnswer) : null,
  })
}

export function toggleMockExamFlag(attempt: MockExamAttempt, index: number): MockExamAttempt {
  const question = attempt.questions[index]
  if (!question) return attempt

  return updateQuestion(attempt, index, { flagged: !question.flagged })
}

export function navigateMockExamAttempt(attempt: MockExamAttempt, index: number): MockExamAttempt {
  if (attempt.questions.length === 0) {
    return attempt.currentIndex === 0
      ? attempt
      : { ...attempt, currentIndex: 0, updatedAt: nextUpdatedAt(attempt) }
  }
  const currentIndex = clamp(safeIndex(index), 0, attempt.questions.length - 1)
  if (currentIndex === attempt.currentIndex) return attempt
  return { ...attempt, currentIndex, updatedAt: nextUpdatedAt(attempt) }
}

export function saveAndExitMockExamDraft(attempt: MockExamAttempt, now: number): MockExamAttempt {
  const activeElapsedSeconds = activeElapsedSecondsFor(attempt, now)
  return {
    ...attempt,
    draftStatus: 'saved',
    elapsedSeconds: (attempt.elapsedSeconds ?? 0) + activeElapsedSeconds,
    startedAt: now,
    timeLimitSeconds: deriveMockExamRemainingSeconds(attempt, now),
    updatedAt: now,
  }
}

export function resumeSavedMockExamDraft(attempt: MockExamAttempt, now: number): MockExamAttempt {
  if (attempt.draftStatus !== 'saved') return attempt
  return { ...attempt, draftStatus: 'active', startedAt: now, updatedAt: now }
}

export function deriveMockExamRemainingSeconds(attempt: MockExamAttempt, now: number): number {
  if (attempt.draftStatus === 'saved') return attempt.timeLimitSeconds
  return Math.max(0, attempt.timeLimitSeconds - activeElapsedSecondsFor(attempt, now))
}

export function deriveMockExamTimeUsedSeconds(attempt: MockExamAttempt, now: number): number {
  return (attempt.elapsedSeconds ?? 0) + activeElapsedSecondsFor(attempt, now)
}

export const MOCK_EXAM_TIMER_WARNING_THRESHOLD_SECONDS = 10 * 60

export function isMockExamTimerWarning(remainingSeconds: number): boolean {
  return remainingSeconds < MOCK_EXAM_TIMER_WARNING_THRESHOLD_SECONDS
}

function activeElapsedSecondsFor(attempt: MockExamAttempt, now: number): number {
  return Math.max(0, Math.floor((now - attempt.startedAt) / 1000))
}

function updateQuestion(
  attempt: MockExamAttempt,
  index: number,
  patch: Partial<MockExamQuestionSnapshot>,
): MockExamAttempt {
  return {
    ...attempt,
    updatedAt: Date.now(),
    questions: attempt.questions.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    ),
  }
}

function nextUpdatedAt(attempt: MockExamAttempt) {
  return Math.max(Date.now(), attempt.updatedAt + 1)
}

function isValidPickCount(question: MockExamQuestionSnapshot, picks: Letter[]) {
  if (question.type === 'single') return picks.length <= 1
  return picks.length <= question.correctAnswer.length
}

function canonicalPicks(picks: Letter[]): Letter[] {
  return Array.from(new Set(picks)).sort() as Letter[]
}

function sameLetters(left: Letter[], right: Letter[]) {
  const sortedRight = canonicalPicks(right)
  return (
    left.length === sortedRight.length &&
    left.every((letter, index) => letter === sortedRight[index])
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function safeIndex(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : 0
}
