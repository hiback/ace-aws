import type { BrowserQuestionProgressModule } from '@/lib/browser-progress-module'
import { browserProgress } from '@/lib/browser-progress-module'
import {
  deleteLocalMockExamDraftIfAttempt,
  getLocalMockExamSubmissionProgress,
  getLocalMockExamSubmittedAttempt,
  markLocalMockExamSubmissionProgress,
  saveLocalMockExamSubmittedAttempt,
} from './local-repository'
import { getMockExamProfile } from './profile'
import { type MockExamScoreSummary, scoreMockExamAttempt } from './scoring'
import type { MockExamAttempt, MockExamQuestionSnapshot } from './start-attempt'

const SUBMISSION_PROGRESS_COMPLETE = '__complete__'

export type SubmittedMockExamAttempt = {
  id: string
  cert: MockExamAttempt['cert']
  submittedAt: number
  questions: MockExamQuestionSnapshot[]
  summary: MockExamScoreSummary
}

type SubmitMockExamAttemptOptions = {
  progress?: BrowserQuestionProgressModule
  now?: () => number
  autoSubmitted?: boolean
  persistLocalHistory?: boolean
  applyProgress?: boolean
}

export function submitMockExamAttempt(
  attempt: MockExamAttempt,
  {
    progress = browserProgress,
    now = Date.now,
    autoSubmitted = false,
    persistLocalHistory = true,
    applyProgress = true,
  }: SubmitMockExamAttemptOptions = {},
): SubmittedMockExamAttempt {
  const existing = persistLocalHistory ? getLocalMockExamSubmittedAttempt(attempt.id) : null
  if (existing) {
    if (applyProgress) recordSubmittedMockExamProgress(existing, progress)
    deleteLocalMockExamDraftIfAttempt(existing.cert, existing.id)
    return existing
  }

  const submittedAt = now()
  const submitted: SubmittedMockExamAttempt = {
    id: attempt.id,
    cert: attempt.cert,
    submittedAt,
    questions: attempt.questions.map((question) => ({
      ...question,
      correctAnswer: [...question.correctAnswer],
      userPicks: [...question.userPicks],
    })),
    summary: scoreMockExamAttempt(
      attempt,
      getMockExamProfile(attempt.cert),
      submittedAt,
      autoSubmitted,
    ),
  }

  if (persistLocalHistory) saveLocalMockExamSubmittedAttempt(submitted)
  if (applyProgress) {
    recordSubmittedMockExamProgress(submitted, progress, persistLocalHistory)
  }
  deleteLocalMockExamDraftIfAttempt(submitted.cert, submitted.id)

  return submitted
}

export function recordSubmittedMockExamProgress(
  submitted: SubmittedMockExamAttempt,
  progress: BrowserQuestionProgressModule,
  useLocalIdempotency = true,
) {
  const appliedFingerprints = useLocalIdempotency
    ? getLocalMockExamSubmissionProgress(submitted.id)
    : new Set<string>()
  if (appliedFingerprints.has(SUBMISSION_PROGRESS_COMPLETE)) return

  for (const question of submitted.questions) {
    if (!question.answered) continue
    const fingerprint = submissionProgressFingerprint(question)
    if (appliedFingerprints.has(fingerprint)) continue
    progress.recordAnswer(
      question.qid,
      question.userPicks,
      question.correct === true,
      submitted.cert,
    )
    if (useLocalIdempotency) markLocalMockExamSubmissionProgress(submitted.id, fingerprint)
    appliedFingerprints.add(fingerprint)
  }

  if (useLocalIdempotency) {
    markLocalMockExamSubmissionProgress(submitted.id, SUBMISSION_PROGRESS_COMPLETE)
  }
}

function submissionProgressFingerprint(question: MockExamQuestionSnapshot) {
  return [
    question.qid,
    question.answered ? 'answered' : 'unanswered',
    question.correct === true ? 'correct' : question.correct === false ? 'wrong' : 'unknown',
    question.userPicks.join(''),
  ].join(':')
}
