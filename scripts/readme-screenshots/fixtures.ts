import type { Letter, Question, QuestionProgress } from '../../src/data/types'

export const README_SCREENSHOT_FIXED_NOW = Date.parse('2026-01-15T09:00:00.000Z')
export const README_SCREENSHOT_USER_ID = 'readme-user'
export const README_SCREENSHOT_REQUIRED_CLF_QIDS = Array.from(
  { length: 65 },
  (_, index) => index + 1,
)

const PROGRESS_KEY = 'ace-aws/progress/v1'
const ACCOUNT_PROGRESS_KEY = 'ace-aws/account-progress/v1'
const ACCOUNT_OWNER_KEY = 'ace-aws/account-owner/v1'
const ACCOUNT_SYNC_KEY = 'ace-aws/account-progress-sync/v1'
const MOCK_EXAM_KEY = 'ace-aws/mock-exam/local/v1'
const ACCOUNT_MOCK_EXAM_SYNC_KEY = 'ace-aws/mock-exam/account-sync/v1'

export interface ReadmeScreenshotFixtureState {
  localStorage: Record<string, string>
}

export interface ReadmeScreenshotFixtureOptions {
  fixture?: 'default' | 'stats'
}

type MockExamQuestionSnapshot = {
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

type MockExamAttempt = {
  id: string
  cert: 'CLF-C02'
  draftStatus?: 'active' | 'saved'
  currentIndex: number
  questionCount: number
  timeLimitSeconds: number
  startedAt: number
  elapsedSeconds?: number
  updatedAt: number
  questions: MockExamQuestionSnapshot[]
}

type SubmittedMockExamAttempt = {
  id: string
  cert: 'CLF-C02'
  submittedAt: number
  questions: MockExamQuestionSnapshot[]
  summary: {
    score: number
    passed: boolean
    correctCount: number
    totalCount: number
    accuracy: number
    timeUsedSeconds: number
    unansweredCount: number
    autoSubmitted: boolean
    domains: Array<{
      name: string
      correctCount: number
      totalCount: number
      accuracy: number
      weight: number
    }>
  }
}

export function buildReadmeScreenshotFixtureState(
  bank: readonly Question[],
  options: ReadmeScreenshotFixtureOptions = {},
): ReadmeScreenshotFixtureState {
  const questions = requiredClfQuestions(bank)
  const progress =
    options.fixture === 'stats' ? buildStatsProgressState(questions) : buildProgressState(questions)
  const mockExam = buildMockExamState(questions)

  return {
    localStorage: {
      [PROGRESS_KEY]: JSON.stringify(progress),
      [ACCOUNT_PROGRESS_KEY]: JSON.stringify(progress),
      [ACCOUNT_OWNER_KEY]: README_SCREENSHOT_USER_ID,
      [ACCOUNT_SYNC_KEY]: JSON.stringify({
        byUser: {
          [README_SCREENSHOT_USER_ID]: {
            'CLF-C02': {
              revision: 7,
              lastSyncedAt: README_SCREENSHOT_FIXED_NOW - 120_000,
            },
          },
        },
      }),
      [MOCK_EXAM_KEY]: JSON.stringify(mockExam.local),
      [ACCOUNT_MOCK_EXAM_SYNC_KEY]: JSON.stringify(mockExam.account),
    },
  }
}

function buildStatsProgressState(questions: readonly Question[]) {
  const progress: Record<number, QuestionProgress> = {}
  const specs = statsProgressSpecs(questions)

  for (const [index, { question, correct }] of specs.entries()) {
    const lastAnsweredAt = README_SCREENSHOT_FIXED_NOW - (specs.length - index) * 90_000
    progress[question.id] = progressEntry(question.id, {
      correctCount: correct ? 1 : 0,
      wrongCount: correct ? 0 : 1,
      lastCorrect: correct,
      lastPicks: correct ? question.correct_answer : wrongPicks(question),
      lastAnsweredAt,
      bookmarked: index % 8 === 0,
      bookmarkUpdatedAt: index % 8 === 0 ? lastAnsweredAt + 30_000 : null,
    })
  }

  return {
    byCert: {
      'CLF-C02': {
        progress,
        dailyStats: buildStatsDailyStats(),
      },
    },
  }
}

function statsProgressSpecs(questions: readonly Question[]) {
  const byTopic = new Map<string, Question[]>()
  for (const question of questions) {
    byTopic.set(question.topic, [...(byTopic.get(question.topic) ?? []), question])
  }

  const used = new Set<number>()
  const specs: Array<{ question: Question; correct: boolean }> = []

  for (const group of Array.from(byTopic.values())
    .filter((items) => items.length >= 3)
    .slice(0, 3)) {
    for (const [index, question] of group.slice(0, 3).entries()) {
      specs.push({ question, correct: index === 2 })
      used.add(question.id)
    }
  }

  for (const question of questions) {
    if (specs.length >= 18) break
    if (used.has(question.id)) continue
    specs.push({ question, correct: specs.length % 4 !== 0 })
    used.add(question.id)
  }

  return specs
}

function buildStatsDailyStats() {
  const rows = [
    { date: '2026-01-09', correctCount: 2, wrongCount: 1 },
    { date: '2026-01-10', correctCount: 3, wrongCount: 1 },
    { date: '2026-01-11', correctCount: 1, wrongCount: 2 },
    { date: '2026-01-12', correctCount: 4, wrongCount: 0 },
    { date: '2026-01-13', correctCount: 2, wrongCount: 2 },
    { date: '2026-01-14', correctCount: 5, wrongCount: 1 },
    { date: '2026-01-15', correctCount: 3, wrongCount: 1 },
  ]

  return Object.fromEntries(
    rows.map((row, index) => [
      row.date,
      {
        ...row,
        updatedAt: README_SCREENSHOT_FIXED_NOW - (rows.length - index) * 86_400_000,
      },
    ]),
  )
}

function requiredClfQuestions(bank: readonly Question[]): Question[] {
  const byId = new Map(bank.filter((q) => q.cert === 'CLF-C02').map((q) => [q.id, q]))
  const missing = README_SCREENSHOT_REQUIRED_CLF_QIDS.filter((qid) => !byId.has(qid))
  if (missing.length > 0) {
    throw new Error(
      `Missing fixed CLF-C02 README screenshot fixture questions: ${missing.join(', ')}`,
    )
  }
  return README_SCREENSHOT_REQUIRED_CLF_QIDS.map((qid) => byId.get(qid) as Question)
}

function buildProgressState(questions: readonly Question[]) {
  const [unanswered, correct, wrong, explanation] = questions
  const progress: Record<number, QuestionProgress> = {
    [unanswered.id]: progressEntry(unanswered.id, {
      bookmarked: true,
      bookmarkUpdatedAt: README_SCREENSHOT_FIXED_NOW - 600_000,
    }),
    [correct.id]: progressEntry(correct.id, {
      correctCount: 1,
      lastCorrect: true,
      lastPicks: correct.correct_answer,
      lastAnsweredAt: README_SCREENSHOT_FIXED_NOW - 500_000,
    }),
    [wrong.id]: progressEntry(wrong.id, {
      wrongCount: 1,
      lastCorrect: false,
      lastPicks: wrongPicks(wrong),
      lastAnsweredAt: README_SCREENSHOT_FIXED_NOW - 400_000,
      bookmarked: true,
      bookmarkUpdatedAt: README_SCREENSHOT_FIXED_NOW - 350_000,
    }),
    [explanation.id]: progressEntry(explanation.id, {
      correctCount: 1,
      lastCorrect: true,
      lastPicks: explanation.correct_answer,
      lastAnsweredAt: README_SCREENSHOT_FIXED_NOW - 300_000,
      bookmarked: true,
      bookmarkUpdatedAt: README_SCREENSHOT_FIXED_NOW - 250_000,
    }),
  }

  return {
    byCert: {
      'CLF-C02': {
        progress,
        dailyStats: {
          '2026-01-15': {
            date: '2026-01-15',
            correctCount: 2,
            wrongCount: 1,
            updatedAt: README_SCREENSHOT_FIXED_NOW - 300_000,
          },
        },
      },
    },
  }
}

function progressEntry(qid: number, overrides: Partial<QuestionProgress>): QuestionProgress {
  return {
    qid,
    correctCount: 0,
    wrongCount: 0,
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: false,
    bookmarkUpdatedAt: null,
    ...overrides,
    lastPicks: [...(overrides.lastPicks ?? [])].sort() as Letter[],
  }
}

function buildMockExamState(questions: readonly Question[]) {
  const draft: MockExamAttempt = {
    id: 'readme-clf-c02-draft',
    cert: 'CLF-C02',
    draftStatus: 'saved',
    currentIndex: 1,
    questionCount: 65,
    timeLimitSeconds: 80 * 60,
    startedAt: README_SCREENSHOT_FIXED_NOW - 600_000,
    elapsedSeconds: 600,
    updatedAt: README_SCREENSHOT_FIXED_NOW - 60_000,
    questions: questions.map((question, index) => toMockQuestion(question, index, 'draft')),
  }
  const submittedAttempt: MockExamAttempt = {
    ...draft,
    id: 'readme-clf-c02-submitted',
    currentIndex: 0,
    startedAt: README_SCREENSHOT_FIXED_NOW - 7_200_000,
    elapsedSeconds: 3_600,
    updatedAt: README_SCREENSHOT_FIXED_NOW - 3_600_000,
    questions: questions.map((question, index) => toMockQuestion(question, index, 'submitted')),
  }
  const submitted = submitAttempt(submittedAttempt, README_SCREENSHOT_FIXED_NOW - 3_600_000)
  const olderSubmitted = submitAttempt(
    {
      ...submittedAttempt,
      id: 'readme-clf-c02-older-submitted',
      startedAt: README_SCREENSHOT_FIXED_NOW - 172_800_000,
      updatedAt: README_SCREENSHOT_FIXED_NOW - 169_200_000,
      questions: questions.map((question, index) =>
        toMockQuestion(question, index, 'older-submitted'),
      ),
    },
    README_SCREENSHOT_FIXED_NOW - 169_200_000,
  )

  return {
    local: {
      attempts: { [draft.id]: draft },
      submittedAttempts: {
        'CLF-C02': {
          [submitted.id]: submitted,
          [olderSubmitted.id]: olderSubmitted,
        },
      },
      submissionProgress: {},
    },
    account: {
      byUser: {
        [README_SCREENSHOT_USER_ID]: {
          revisions: { 'CLF-C02': 5 },
          drafts: {},
          submittedAttempts: {
            'CLF-C02': {
              [submitted.id]: submitted,
              [olderSubmitted.id]: olderSubmitted,
            },
          },
          draftMutationIds: {},
          dirtyDrafts: {},
          dirtySubmittedAttempts: {},
        },
      },
    },
  }
}

function toMockQuestion(
  question: Question,
  index: number,
  variant: 'draft' | 'submitted' | 'older-submitted',
): MockExamQuestionSnapshot {
  const shouldAnswer =
    variant === 'draft' ? index < 11 : variant === 'submitted' ? index < 58 : index < 51
  const shouldBeCorrect =
    variant === 'older-submitted' ? index % 4 !== 0 : index % 5 !== 0 && index < 50
  const userPicks = shouldAnswer && shouldBeCorrect ? question.correct_answer : wrongPicks(question)

  return {
    qid: question.id,
    domain: question.topic,
    topic: question.topic,
    correctAnswer: [...question.correct_answer],
    type: question.type,
    userPicks: shouldAnswer ? userPicks : [],
    correct: shouldAnswer ? shouldBeCorrect : null,
    flagged: index === 1 || index === 7 || index === 23,
    answered: shouldAnswer,
  }
}

function submitAttempt(attempt: MockExamAttempt, submittedAt: number): SubmittedMockExamAttempt {
  const correctCount = attempt.questions.filter((question) => question.correct === true).length
  const totalCount = attempt.questions.length
  const domains = [
    { name: 'Cloud Concepts', weight: 24 },
    { name: 'Security and Compliance', weight: 30 },
    { name: 'Cloud Technology and Services', weight: 34 },
    { name: 'Billing, Pricing, and Support', weight: 12 },
  ].map((domain) => {
    const domainQuestions = attempt.questions.filter((question) => question.domain === domain.name)
    const domainCorrect = domainQuestions.filter((question) => question.correct === true).length
    return {
      ...domain,
      correctCount: domainCorrect,
      totalCount: domainQuestions.length,
      accuracy: domainQuestions.length === 0 ? 0 : domainCorrect / domainQuestions.length,
    }
  })

  return {
    id: attempt.id,
    cert: 'CLF-C02',
    submittedAt,
    questions: attempt.questions,
    summary: {
      score: Math.round(100 + (900 * correctCount) / totalCount),
      passed: Math.round(100 + (900 * correctCount) / totalCount) >= 700,
      correctCount,
      totalCount,
      accuracy: correctCount / totalCount,
      timeUsedSeconds:
        attempt.elapsedSeconds ?? Math.floor((submittedAt - attempt.startedAt) / 1000),
      unansweredCount: attempt.questions.filter((question) => !question.answered).length,
      autoSubmitted: false,
      domains,
    },
  }
}

function wrongPicks(question: Question): Letter[] {
  const correct = new Set(question.correct_answer)
  const wrong = (Object.keys(question.en.options) as Letter[]).filter(
    (letter) => !correct.has(letter),
  )
  return question.type === 'multi'
    ? wrong.slice(0, question.correct_answer.length).sort()
    : [wrong[0] ?? question.correct_answer[0]]
}
