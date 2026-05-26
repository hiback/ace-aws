import type { CertCode, Letter, Question } from '@/data/types'
import { getMockExamProfile, getMockExamProfileDomainQuotas, type MockExamProfile } from './profile'

export type MockExamQuestionSnapshot = {
  qid: number
  domain: string
  topic: string
  correctAnswer: Letter[]
  type: Question['type']
  userPicks: Letter[]
  correct: boolean | null
  flagged: boolean
  answered: boolean
}

export type MockExamAttempt = {
  id: string
  cert: CertCode
  draftStatus?: 'active' | 'saved'
  currentIndex: number
  questionCount: number
  timeLimitSeconds: number
  startedAt: number
  elapsedSeconds?: number
  updatedAt: number
  questions: MockExamQuestionSnapshot[]
}

type StartAttemptInput = {
  bank: Question[]
  cert: CertCode
  random?: () => number
  now?: () => number
  id?: () => string
}

export function startMockExamAttempt({
  bank,
  cert,
  random = Math.random,
  now = Date.now,
  id = defaultAttemptId,
}: StartAttemptInput): MockExamAttempt {
  const profile = getMockExamProfile(cert)
  const selected = sampleMockExamQuestions(bank, profile, random)

  return {
    id: id(),
    cert,
    draftStatus: 'active',
    currentIndex: 0,
    questionCount: profile.questionCount,
    timeLimitSeconds: profile.timeLimitMinutes * 60,
    startedAt: now(),
    elapsedSeconds: 0,
    updatedAt: now(),
    questions: selected.map(toSnapshot),
  }
}

function sampleMockExamQuestions(
  bank: Question[],
  profile: MockExamProfile,
  random: () => number,
): Question[] {
  const currentBank = bank.filter((question) => question.cert === profile.cert)
  const quotas = getMockExamProfileDomainQuotas(profile)
  const selected: Question[] = []
  const selectedIds = new Set<number>()

  for (const domain of profile.domains) {
    const quota = quotas[domain.name]
    const candidates = shuffled(
      currentBank.filter(
        (question) => domain.bankTopics.includes(question.topic) && !selectedIds.has(question.id),
      ),
      random,
    )
    for (const question of candidates.slice(0, quota)) {
      selected.push(question)
      selectedIds.add(question.id)
    }
  }

  if (selected.length < profile.questionCount) {
    const fallback = shuffled(
      currentBank.filter((question) => !selectedIds.has(question.id)),
      random,
    )
    for (const question of fallback.slice(0, profile.questionCount - selected.length)) {
      selected.push(question)
      selectedIds.add(question.id)
    }
  }

  return shuffled(selected.slice(0, profile.questionCount), random)
}

function toSnapshot(question: Question): MockExamQuestionSnapshot {
  return {
    qid: question.id,
    domain: domainForQuestion(question),
    topic: question.topic,
    correctAnswer: question.correct_answer,
    type: question.type,
    userPicks: [],
    correct: null,
    flagged: false,
    answered: false,
  }
}

function domainForQuestion(question: Question): string {
  const profile = getMockExamProfile(question.cert)
  return (
    profile.domains.find((domain) => domain.bankTopics.includes(question.topic))?.name ??
    question.topic
  )
}

function shuffled<T>(items: T[], random: () => number): T[] {
  return items
    .map((item, index) => ({ item, index, rank: random() }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}

function defaultAttemptId() {
  return globalThis.crypto?.randomUUID?.() ?? `mock-${Date.now()}`
}
