import { deriveMockExamTimeUsedSeconds } from './attempt-state'
import type { MockExamProfile } from './profile'
import type { MockExamAttempt } from './start-attempt'

export type MockExamDomainResult = {
  name: string
  correctCount: number
  totalCount: number
  accuracy: number
  weight: number
}

export type MockExamScoreSummary = {
  score: number
  passed: boolean
  correctCount: number
  totalCount: number
  accuracy: number
  timeUsedSeconds: number
  unansweredCount: number
  autoSubmitted: boolean
  domains: MockExamDomainResult[]
}

export function scoreMockExamAttempt(
  attempt: MockExamAttempt,
  profile: MockExamProfile,
  submittedAt: number,
  autoSubmitted = false,
): MockExamScoreSummary {
  const totalCount = attempt.questions.length
  const correctCount = attempt.questions.filter((question) => question.correct === true).length
  const score = totalCount === 0 ? 100 : Math.round(100 + (900 * correctCount) / totalCount)
  const timeUsedSeconds = deriveMockExamTimeUsedSeconds(attempt, submittedAt)

  return {
    score,
    passed: score >= profile.passingScore,
    correctCount,
    totalCount,
    accuracy: totalCount === 0 ? 0 : correctCount / totalCount,
    timeUsedSeconds,
    unansweredCount: attempt.questions.filter((question) => !question.answered).length,
    autoSubmitted,
    domains: summarizeDomains(attempt, profile),
  }
}

function summarizeDomains(
  attempt: MockExamAttempt,
  profile: MockExamProfile,
): MockExamDomainResult[] {
  return profile.domains.map((domain) => {
    const questions = attempt.questions.filter((question) => question.domain === domain.name)
    const correctCount = questions.filter((question) => question.correct === true).length
    return {
      name: domain.name,
      correctCount,
      totalCount: questions.length,
      accuracy: questions.length === 0 ? 0 : correctCount / questions.length,
      weight: domain.weight,
    }
  })
}
