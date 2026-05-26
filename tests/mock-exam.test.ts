import { describe, expect, it, vi } from 'vitest'
import type { Question } from '../src/data/types'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import {
  answerMockExamQuestion,
  deriveMockExamRemainingSeconds,
  isMockExamTimerWarning,
  navigateMockExamAttempt,
  resumeSavedMockExamDraft,
  saveAndExitMockExamDraft,
  toggleMockExamFlag,
} from '../src/lib/mock-exam/attempt-state'
import {
  deleteLocalMockExamDraft,
  getLocalMockExamAttempt,
  getLocalMockExamDraft,
  getLocalMockExamHistory,
  getLocalMockExamSubmittedAttempt,
  saveLocalMockExamAttempt,
  saveLocalMockExamSubmittedAttempt,
} from '../src/lib/mock-exam/local-repository'
import { getMockExamProfile, getMockExamProfileDomainQuotas } from '../src/lib/mock-exam/profile'
import { getMockExamReviewOptionState } from '../src/lib/mock-exam/review'
import { scoreMockExamAttempt } from '../src/lib/mock-exam/scoring'
import { type MockExamAttempt, startMockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import { submitMockExamAttempt } from '../src/lib/mock-exam/submission'

const LOCAL_MOCK_EXAM_STORAGE_KEY = 'ace-aws/mock-exam/local/v1'

function makeQuestion(
  id: number,
  topic: string,
  cert: 'DVA-C02' | 'CLF-C02' = 'DVA-C02',
): Question {
  return {
    id,
    cert,
    topic,
    type: 'single',
    correct_answer: ['A'],
    en: { question: `Question ${id}`, options: { A: 'A', B: 'B' }, explanation: 'Explain' },
    zh: { question: `题目 ${id}`, options: { A: 'A', B: 'B' }, explanation: '解释' },
    vote_distribution: {},
  }
}

describe('Mock Exam profile', () => {
  it('exposes certification-specific exam rules and explicit topic mappings', () => {
    const dva = getMockExamProfile('DVA-C02')
    const clf = getMockExamProfile('clf-c02')

    expect(dva).toMatchObject({
      cert: 'DVA-C02',
      questionCount: 65,
      timeLimitMinutes: 130,
      passingScore: 720,
    })
    expect(dva.domains.map((domain) => [domain.name, domain.weight, domain.bankTopics])).toEqual([
      ['Development with AWS Services', 32, ['Development']],
      ['Security', 26, ['Security']],
      ['Deployment', 24, ['Deployment']],
      ['Troubleshooting and Optimization', 18, ['Troubleshooting']],
    ])

    expect(clf).toMatchObject({
      cert: 'CLF-C02',
      questionCount: 65,
      timeLimitMinutes: 90,
      passingScore: 700,
    })
    expect(clf.domains.map((domain) => [domain.name, domain.weight, domain.bankTopics])).toEqual([
      ['Cloud Concepts', 24, ['Cloud Concepts']],
      ['Security and Compliance', 30, ['Security and Compliance']],
      ['Cloud Technology and Services', 34, ['Cloud Technology and Services']],
      ['Billing, Pricing, and Support', 12, ['Billing, Pricing, and Support']],
    ])
  })

  it('allocates largest-remainder quotas that preserve the total question count', () => {
    expect(getMockExamProfileDomainQuotas(getMockExamProfile('DVA-C02'))).toEqual({
      'Development with AWS Services': 21,
      Security: 17,
      Deployment: 15,
      'Troubleshooting and Optimization': 12,
    })
    expect(getMockExamProfileDomainQuotas(getMockExamProfile('CLF-C02'))).toEqual({
      'Cloud Concepts': 16,
      'Security and Compliance': 19,
      'Cloud Technology and Services': 22,
      'Billing, Pricing, and Support': 8,
    })
  })
})

describe('Mock Exam attempt sampling', () => {
  it('creates a fixed snapshot from profile quotas without duplicates', () => {
    const bank = [
      ...Array.from({ length: 25 }, (_, index) => makeQuestion(index + 1, 'Development')),
      ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 101, 'Security')),
      ...Array.from({ length: 18 }, (_, index) => makeQuestion(index + 201, 'Deployment')),
      ...Array.from({ length: 14 }, (_, index) => makeQuestion(index + 301, 'Troubleshooting')),
    ]

    const attempt = startMockExamAttempt({
      bank,
      cert: 'DVA-C02',
      random: () => 0,
      now: () => 1000,
      id: () => 'attempt-1',
    })

    expect(attempt).toMatchObject({
      id: 'attempt-1',
      cert: 'DVA-C02',
      currentIndex: 0,
      questionCount: 65,
      timeLimitSeconds: 130 * 60,
      startedAt: 1000,
    })
    expect(attempt.questions).toHaveLength(65)
    expect(new Set(attempt.questions.map((question) => question.qid))).toHaveLength(65)
    expect(countByDomain(attempt.questions)).toEqual({
      'Development with AWS Services': 21,
      Security: 17,
      Deployment: 15,
      'Troubleshooting and Optimization': 12,
    })
    expect(attempt.questions[0]).toEqual({
      qid: 1,
      domain: 'Development with AWS Services',
      topic: 'Development',
      correctAnswer: ['A'],
      type: 'single',
      userPicks: [],
      correct: null,
      flagged: false,
      answered: false,
    })
  })

  it('returns a deterministic fixed order when the injected random source changes sorting', () => {
    const bank = makeFullDvaBank()
    let nextRank = 1000

    const attempt = startMockExamAttempt({
      bank,
      cert: 'DVA-C02',
      random: () => nextRank--,
      now: () => 1000,
      id: () => 'attempt-randomized-order',
    })

    const orderedQids = attempt.questions.map((question) => question.qid)

    expect(orderedQids).toEqual([
      ...range(303, 314),
      ...range(204, 218),
      ...range(104, 120),
      ...range(5, 25),
    ])
    expect(orderedQids).not.toEqual([
      ...range(25, 5, -1),
      ...range(120, 104, -1),
      ...range(218, 204, -1),
      ...range(314, 303, -1),
    ])
  })

  it('fills domain shortages from other same-certification questions', () => {
    const bank = [
      ...Array.from({ length: 5 }, (_, index) => makeQuestion(index + 1, 'Development')),
      ...Array.from({ length: 40 }, (_, index) => makeQuestion(index + 101, 'Security')),
      ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 201, 'Deployment')),
      ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 301, 'Troubleshooting')),
      makeQuestion(999, 'Development', 'CLF-C02'),
    ]

    const attempt = startMockExamAttempt({
      bank,
      cert: 'DVA-C02',
      random: () => 0,
      now: () => 1000,
      id: () => 'attempt-2',
    })

    expect(attempt.questions).toHaveLength(65)
    expect(attempt.questions.some((question) => question.qid === 999)).toBe(false)
    expect(countByDomain(attempt.questions)['Development with AWS Services']).toBe(5)
  })
})

describe('Local Mock Exam repository', () => {
  it('recovers from a malformed local state while saving the next attempt', () => {
    localStorage.setItem(LOCAL_MOCK_EXAM_STORAGE_KEY, JSON.stringify({}))
    const attempt = makeAttempt('attempt-after-malformed-state')

    expect(() => saveLocalMockExamAttempt(attempt)).not.toThrow()
    expect(getLocalMockExamAttempt(attempt.id)?.id).toBe(attempt.id)
  })

  it('stores one local draft per certification while isolating the current certification', () => {
    const firstDva = makeAttempt('attempt-dva-first')
    const nextDva = makeAttempt('attempt-dva-next')
    const clf = { ...makeAttempt('attempt-clf'), cert: 'CLF-C02' as const }

    saveLocalMockExamAttempt(firstDva)
    saveLocalMockExamAttempt(clf)
    saveLocalMockExamAttempt(nextDva)

    expect(getLocalMockExamDraft('DVA-C02')?.id).toBe(nextDva.id)
    expect(getLocalMockExamAttempt(firstDva.id)).toBeNull()
    expect(getLocalMockExamDraft('CLF-C02')?.id).toBe(clf.id)

    deleteLocalMockExamDraft('DVA-C02')

    expect(getLocalMockExamDraft('DVA-C02')).toBeNull()
    expect(getLocalMockExamDraft('CLF-C02')?.id).toBe(clf.id)
  })

  it('lists submitted local history newest first for the current certification', () => {
    saveLocalMockExamSubmittedAttempt(makeSubmitted('old-dva', 'DVA-C02', 1000, 700))
    saveLocalMockExamSubmittedAttempt(makeSubmitted('new-clf', 'CLF-C02', 3000, 800))
    saveLocalMockExamSubmittedAttempt(makeSubmitted('new-dva', 'DVA-C02', 2000, 900))

    expect(getLocalMockExamHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'new-dva',
      'old-dva',
    ])
    expect(getLocalMockExamHistory('CLF-C02').map((attempt) => attempt.id)).toEqual(['new-clf'])
  })

  it('keeps submitted local history with the same attempt id separate per certification', () => {
    localStorage.clear()
    saveLocalMockExamSubmittedAttempt(makeSubmitted('same-id', 'DVA-C02', 1000, 850))
    saveLocalMockExamSubmittedAttempt(makeSubmitted('same-id', 'CLF-C02', 2000, 700))

    expect(getLocalMockExamHistory('DVA-C02')).toMatchObject([
      { id: 'same-id', cert: 'DVA-C02', summary: { score: 850 } },
    ])
    expect(getLocalMockExamHistory('CLF-C02')).toMatchObject([
      { id: 'same-id', cert: 'CLF-C02', summary: { score: 700 } },
    ])
  })

  it('treats legacy flat submitted local history as empty state', () => {
    localStorage.setItem(
      LOCAL_MOCK_EXAM_STORAGE_KEY,
      JSON.stringify({
        attempts: {},
        submittedAttempts: {
          'legacy-flat': makeSubmitted('legacy-flat', 'DVA-C02', 1000, 850),
        },
        submissionProgress: {},
      }),
    )

    expect(getLocalMockExamHistory('DVA-C02')).toEqual([])
    expect(getLocalMockExamSubmittedAttempt('legacy-flat')).toBeNull()

    saveLocalMockExamSubmittedAttempt(makeSubmitted('bucketed', 'DVA-C02', 2000, 900))

    expect(getLocalMockExamHistory('DVA-C02').map((attempt) => attempt.id)).toEqual(['bucketed'])
  })

  it('uses attempt id as a deterministic tie-breaker when submitted times match', () => {
    localStorage.clear()
    saveLocalMockExamSubmittedAttempt(makeSubmitted('same-time-b', 'DVA-C02', 2000, 800))
    saveLocalMockExamSubmittedAttempt(makeSubmitted('same-time-a', 'DVA-C02', 2000, 700))
    saveLocalMockExamSubmittedAttempt(makeSubmitted('newest', 'DVA-C02', 3000, 900))

    expect(getLocalMockExamHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'newest',
      'same-time-a',
      'same-time-b',
    ])
  })
})

describe('Mock Exam scoring and submission', () => {
  it('scores submitted attempts from immutable snapshot facts', () => {
    const attempt = makeAttempt('attempt-score')
    attempt.questionCount = 4
    attempt.questions = [
      makeSnapshot(1, 'Development with AWS Services', ['A'], true),
      makeSnapshot(2, 'Development with AWS Services', ['B'], false),
      makeSnapshot(3, 'Security', [], null),
      makeSnapshot(4, 'Security', ['A'], true),
    ]

    const result = scoreMockExamAttempt(attempt, getMockExamProfile('DVA-C02'), 601000)

    expect(result).toMatchObject({
      score: 550,
      passed: false,
      correctCount: 2,
      totalCount: 4,
      unansweredCount: 1,
      accuracy: 0.5,
      timeUsedSeconds: 600,
    })
    expect(result.domains).toEqual([
      {
        name: 'Development with AWS Services',
        correctCount: 1,
        totalCount: 2,
        accuracy: 0.5,
        weight: 32,
      },
      { name: 'Security', correctCount: 1, totalCount: 2, accuracy: 0.5, weight: 26 },
      { name: 'Deployment', correctCount: 0, totalCount: 0, accuracy: 0, weight: 24 },
      {
        name: 'Troubleshooting and Optimization',
        correctCount: 0,
        totalCount: 0,
        accuracy: 0,
        weight: 18,
      },
    ])
  })

  it('applies CLF-C02 and DVA-C02 passing thresholds at the boundary', () => {
    const clfAttempt = makeAttempt('attempt-clf-threshold')
    clfAttempt.cert = 'CLF-C02'
    clfAttempt.questionCount = 3
    clfAttempt.questions = [
      makeSnapshot(1, 'Cloud Concepts', ['A'], true),
      makeSnapshot(2, 'Cloud Concepts', ['A'], true),
      makeSnapshot(3, 'Cloud Concepts', ['B'], false),
    ]

    const dvaAttempt = makeAttempt('attempt-dva-threshold')
    dvaAttempt.questionCount = 45
    dvaAttempt.questions = [
      ...Array.from({ length: 31 }, (_, index) =>
        makeSnapshot(index + 1, 'Development with AWS Services', ['A'], true),
      ),
      ...Array.from({ length: 14 }, (_, index) =>
        makeSnapshot(index + 32, 'Development with AWS Services', ['B'], false),
      ),
    ]

    const clfResult = scoreMockExamAttempt(clfAttempt, getMockExamProfile('CLF-C02'), 1000)
    const dvaResult = scoreMockExamAttempt(dvaAttempt, getMockExamProfile('DVA-C02'), 1000)

    expect(clfResult).toMatchObject({ score: 700, passed: true })
    expect(
      scoreMockExamAttempt(
        { ...clfAttempt, questions: clfAttempt.questions.slice(1), questionCount: 2 },
        getMockExamProfile('CLF-C02'),
        1000,
      ),
    ).toMatchObject({ score: 550, passed: false })
    expect(dvaResult).toMatchObject({ score: 720, passed: true })
    expect(
      scoreMockExamAttempt(
        {
          ...dvaAttempt,
          questions: dvaAttempt.questions.map((question, index) =>
            index === 30 ? { ...question, userPicks: ['B'], correct: false } : question,
          ),
        },
        getMockExamProfile('DVA-C02'),
        1000,
      ),
    ).toMatchObject({ score: 700, passed: false })
  })

  it('stores an immutable submitted attempt and records only answered questions as progress', () => {
    vi.setSystemTime(2000)
    const progress = new BrowserProgressModule('anonymous')
    const attempt = makeAttempt('attempt-submit')
    attempt.questionCount = 3
    attempt.questions = [
      makeSnapshot(1, 'Development with AWS Services', ['A'], true),
      makeSnapshot(2, 'Security', ['B'], false),
      makeSnapshot(3, 'Security', [], null),
    ]

    const submitted = submitMockExamAttempt(attempt, {
      progress,
      now: () => 2000,
    })

    expect(submitted.summary).toMatchObject({ score: 400, passed: false, unansweredCount: 1 })
    expect(getLocalMockExamSubmittedAttempt(attempt.id)?.id).toBe(attempt.id)
    attempt.questions[0] = { ...attempt.questions[0], userPicks: ['B'] }
    expect(getLocalMockExamSubmittedAttempt(attempt.id)?.questions[0]?.userPicks).toEqual(['A'])

    expect(progress.getProgress(1, 'DVA-C02')).toMatchObject({
      correctCount: 1,
      wrongCount: 0,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: 2000,
    })
    expect(progress.getProgress(2, 'DVA-C02')).toMatchObject({
      correctCount: 0,
      wrongCount: 1,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: 2000,
    })
    expect(progress.getProgress(3, 'DVA-C02')).toBeNull()

    submitMockExamAttempt(attempt, { progress, now: () => 3000 })
    expect(progress.getProgress(1, 'DVA-C02')).toMatchObject({ correctCount: 1, wrongCount: 0 })
    expect(progress.getProgress(2, 'DVA-C02')).toMatchObject({ correctCount: 0, wrongCount: 1 })
  })

  it('submits a deselected answer as unanswered without recording question progress', () => {
    const progress = new BrowserProgressModule('anonymous')
    const attempt = makeAttempt('attempt-submit-deselected')
    attempt.questions[0] = { ...attempt.questions[0], qid: 999 }
    const answered = answerMockExamQuestion(attempt, 0, ['B'])
    const deselected = answerMockExamQuestion(answered, 0, [])

    const submitted = submitMockExamAttempt(deselected, {
      progress,
      now: () => 2000,
    })

    expect(submitted.questions[0]).toMatchObject({
      userPicks: [],
      answered: false,
      correct: null,
    })
    expect(submitted.summary).toMatchObject({
      score: 100,
      correctCount: 0,
      totalCount: 1,
      unansweredCount: 1,
      accuracy: 0,
    })
    expect(progress.getProgress(999, 'DVA-C02')).toBeNull()
  })

  it('records when a submitted attempt was auto-submitted after time expired', () => {
    const attempt = makeAttempt('attempt-auto-submit')
    attempt.questionCount = 1
    attempt.questions = [makeSnapshot(1, 'Development with AWS Services', ['A'], true)]

    const submitted = submitMockExamAttempt(attempt, {
      progress: new RecordingProgress(),
      now: () => attempt.startedAt + attempt.timeLimitSeconds * 1000,
      autoSubmitted: true,
    })

    expect(submitted.summary).toMatchObject({ autoSubmitted: true, score: 1000 })
    expect(getLocalMockExamSubmittedAttempt(attempt.id)?.summary.autoSubmitted).toBe(true)
  })

  it('accumulates active time across save, resume, and submit while freezing remaining time', () => {
    const attempt = makeAttempt('attempt-save-resume-time-used')

    const saved = saveAndExitMockExamDraft(attempt, attempt.startedAt + 60_000)
    const resumed = resumeSavedMockExamDraft(saved, attempt.startedAt + 10 * 60_000)
    const submitted = submitMockExamAttempt(resumed, {
      progress: new RecordingProgress(),
      now: () => resumed.startedAt + 120_000,
    })

    expect(saved.timeLimitSeconds).toBe(7740)
    expect(deriveMockExamRemainingSeconds(saved, saved.startedAt + 60_000)).toBe(7740)
    expect(submitted.summary.timeUsedSeconds).toBe(180)
  })

  it('does not apply progress when submitted history cannot be saved', () => {
    const attempt = makeAttempt('attempt-save-fails')
    attempt.questionCount = 1
    attempt.questions = [makeSnapshot(1, 'Development with AWS Services', ['A'], true)]
    const progress = new RecordingProgress()
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    setItemSpy.mockImplementation((key) => {
      if (key === LOCAL_MOCK_EXAM_STORAGE_KEY) {
        throw new Error('history failed')
      }
    })

    expect(() => submitMockExamAttempt(attempt, { progress, now: () => 2000 })).toThrow(
      'history failed',
    )
    expect(progress.answers).toEqual([])

    setItemSpy.mockRestore()
  })

  it('stores submitted history before progress and retries missing progress without duplicates', () => {
    const attempt = makeAttempt('attempt-submit-retry')
    attempt.questionCount = 2
    attempt.questions = [
      makeSnapshot(1, 'Development with AWS Services', ['A'], true),
      makeSnapshot(2, 'Security', ['B'], false),
    ]
    const failingProgress = new FailingOnceProgress(2)

    expect(() =>
      submitMockExamAttempt(attempt, {
        progress: failingProgress,
        now: () => 2000,
      }),
    ).toThrow('progress failed')
    expect(
      getLocalMockExamSubmittedAttempt(attempt.id)?.questions.map((question) => question.qid),
    ).toEqual([1, 2])

    const submitted = submitMockExamAttempt(attempt, {
      progress: failingProgress,
      now: () => 3000,
    })

    expect(submitted.id).toBe(attempt.id)
    expect(getLocalMockExamSubmittedAttempt(attempt.id)?.id).toBe(attempt.id)
    expect(failingProgress.answers).toEqual([
      { qid: 1, picks: ['A'], correct: true, cert: 'DVA-C02' },
      { qid: 2, picks: ['B'], correct: false, cert: 'DVA-C02' },
    ])

    submitMockExamAttempt(attempt, { progress: failingProgress, now: () => 4000 })
    expect(failingProgress.answers).toHaveLength(2)
  })

  it('does not delete a newer same-certification draft when an old attempt submits', () => {
    const oldAttempt = makeAttempt('attempt-old-tab-submit')
    oldAttempt.questionCount = 1
    oldAttempt.questions = [makeSnapshot(1, 'Development with AWS Services', ['A'], true)]
    const newDraft = makeAttempt('attempt-new-current-draft')
    saveLocalMockExamAttempt(newDraft)

    submitMockExamAttempt(oldAttempt, { progress: new RecordingProgress(), now: () => 2000 })

    expect(getLocalMockExamSubmittedAttempt(oldAttempt.id)?.id).toBe(oldAttempt.id)
    expect(getLocalMockExamAttempt(newDraft.id)?.id).toBe(newDraft.id)

    submitMockExamAttempt(oldAttempt, { progress: new RecordingProgress(), now: () => 3000 })

    expect(getLocalMockExamAttempt(newDraft.id)?.id).toBe(newDraft.id)
  })

  it('retries progress from the immutable submitted snapshot when the draft attempt changes', () => {
    const attempt = makeAttempt('attempt-retry-from-history')
    attempt.questionCount = 2
    attempt.questions = [
      makeSnapshot(1, 'Development with AWS Services', ['A'], true),
      makeSnapshot(2, 'Security', ['B'], false),
    ]
    const failingProgress = new FailingOnceProgress(2)

    expect(() =>
      submitMockExamAttempt(attempt, { progress: failingProgress, now: () => 2000 }),
    ).toThrow('progress failed')

    const modifiedAttempt = {
      ...attempt,
      questions: [
        makeSnapshot(1, 'Development with AWS Services', ['B'], false),
        makeSnapshot(2, 'Security', ['A'], true),
      ],
    }
    submitMockExamAttempt(modifiedAttempt, { progress: failingProgress, now: () => 3000 })

    expect(failingProgress.answers).toEqual([
      { qid: 1, picks: ['A'], correct: true, cert: 'DVA-C02' },
      { qid: 2, picks: ['B'], correct: false, cert: 'DVA-C02' },
    ])
    expect(
      getLocalMockExamSubmittedAttempt(attempt.id)?.questions.map((question) => question.userPicks),
    ).toEqual([['A'], ['B']])
  })
})

describe('Mock Exam review', () => {
  it('classifies selected, wrong, and missed-correct option states from the submitted snapshot', () => {
    const snapshot = {
      ...makeSnapshot(1, 'Development with AWS Services', ['B'], false),
      correctAnswer: ['A'] as Array<'A'>,
    }

    expect(getMockExamReviewOptionState('A', snapshot)).toBe('missed-correct')
    expect(getMockExamReviewOptionState('B', snapshot)).toBe('wrong')
    expect(getMockExamReviewOptionState('C', snapshot)).toBe('dim')
    expect(
      getMockExamReviewOptionState('A', {
        ...snapshot,
        userPicks: ['A'],
        correct: true,
      }),
    ).toBe('correct')
  })
})

describe('Mock Exam attempt state', () => {
  it('selects, revises, and deselects a single-answer question', () => {
    const attempt = makeAttempt('attempt-single-answer')

    const answered = answerMockExamQuestion(attempt, 0, ['B'])
    const revised = answerMockExamQuestion(answered, 0, ['A'])
    const deselected = answerMockExamQuestion(revised, 0, [])

    expect(revised.questions[0]).toMatchObject({
      userPicks: ['A'],
      answered: true,
      correct: true,
    })
    expect(answered.questions[0]).toMatchObject({ userPicks: ['B'], correct: false })
    expect(deselected.questions[0]).toMatchObject({
      userPicks: [],
      answered: false,
      correct: null,
    })
  })

  it('persists partial multi-answer picks while enforcing completion before answered state', () => {
    const attempt = makeAttempt('attempt-multi-answer', 'multi')

    expect(answerMockExamQuestion(attempt, 0, ['A', 'B', 'C'])).toBe(attempt)

    const partial = answerMockExamQuestion(attempt, 0, ['A'])
    expect(partial.questions[0]).toMatchObject({
      userPicks: ['A'],
      answered: false,
      correct: null,
    })

    const answered = answerMockExamQuestion(attempt, 0, ['B', 'A'])
    const revised = answerMockExamQuestion(answered, 0, ['C', 'A'])

    expect(answered.questions[0]).toMatchObject({
      userPicks: ['A', 'B'],
      answered: true,
      correct: true,
    })
    expect(revised.questions[0]).toMatchObject({
      userPicks: ['A', 'C'],
      answered: true,
      correct: false,
    })
  })

  it('toggles flags, navigates by bounded attempt index, and derives remaining time', () => {
    const attempt = makeAttempt('attempt-navigation')
    attempt.questions.push({ ...attempt.questions[0], qid: 2, flagged: false })
    attempt.questionCount = 2

    const flagged = toggleMockExamFlag(attempt, 0)
    const moved = navigateMockExamAttempt(flagged, 5)

    expect(flagged.questions[0]?.flagged).toBe(true)
    expect(attempt.questions[0]?.flagged).toBe(false)
    expect(moved.currentIndex).toBe(1)
    expect(navigateMockExamAttempt(moved, -1).currentIndex).toBe(0)
    expect(deriveMockExamRemainingSeconds(attempt, 1000 + 120_500)).toBe(7680)
  })

  it('uses warning timer color only below the ten minute boundary', () => {
    expect(isMockExamTimerWarning(601)).toBe(false)
    expect(isMockExamTimerWarning(600)).toBe(false)
    expect(isMockExamTimerWarning(599)).toBe(true)
    expect(isMockExamTimerWarning(0)).toBe(true)
  })

  it('updates the draft timestamp when navigation changes the current index', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(2000)
      const attempt = makeAttempt('attempt-navigation-timestamp')
      attempt.questions.push({ ...attempt.questions[0], qid: 2, flagged: false })
      attempt.questionCount = 2

      const moved = navigateMockExamAttempt(attempt, 1)

      expect(moved).toMatchObject({ currentIndex: 1, updatedAt: 2000 })
      expect(navigateMockExamAttempt(moved, 1)).toBe(moved)

      const empty = {
        ...attempt,
        currentIndex: 1,
        updatedAt: 1000,
        questionCount: 0,
        questions: [],
      }

      expect(navigateMockExamAttempt(empty, 5)).toMatchObject({
        currentIndex: 0,
        updatedAt: 2000,
      })

      vi.setSystemTime(1000)
      const sameMillisecond = navigateMockExamAttempt(attempt, 1)

      expect(sameMillisecond).toMatchObject({ currentIndex: 1, updatedAt: 1001 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an empty attempt at index 0 when navigation is requested', () => {
    const attempt = makeAttempt('attempt-empty-navigation')
    attempt.questions = []
    attempt.questionCount = 0

    expect(navigateMockExamAttempt(attempt, 5).currentIndex).toBe(0)
  })

  it('treats malformed navigation indexes as index 0', () => {
    const attempt = makeAttempt('attempt-malformed-navigation')
    attempt.currentIndex = 1
    attempt.questions.push({ ...attempt.questions[0], qid: 2, flagged: false })
    attempt.questionCount = 2

    expect(navigateMockExamAttempt(attempt, Number.NaN).currentIndex).toBe(0)
    expect(navigateMockExamAttempt(attempt, Number.POSITIVE_INFINITY).currentIndex).toBe(0)
    expect(navigateMockExamAttempt(attempt, 1.8).currentIndex).toBe(1)
  })

  it('freezes remaining time on deliberate save and reactivates from the saved question', () => {
    const attempt = makeAttempt('attempt-save-exit')
    const answered = toggleMockExamFlag(answerMockExamQuestion(attempt, 0, ['A']), 0)
    const moved = { ...answered, currentIndex: 0 }

    const saved = saveAndExitMockExamDraft(moved, 1000 + 125_000)

    expect(saved).toMatchObject({ draftStatus: 'saved', timeLimitSeconds: 7675, startedAt: 126000 })
    expect(deriveMockExamRemainingSeconds(saved, 1000 + 600_000)).toBe(7675)
    expect(saved.questions[0]).toMatchObject({ userPicks: ['A'], flagged: true })

    const resumed = resumeSavedMockExamDraft(saved, 1000 + 700_000)

    expect(resumed).toMatchObject({
      draftStatus: 'active',
      timeLimitSeconds: 7675,
      startedAt: 701000,
    })
    expect(deriveMockExamRemainingSeconds(resumed, 1000 + 701_500)).toBe(7674)
    expect(resumed.questions[0]).toMatchObject({ userPicks: ['A'], flagged: true })
  })
})

function makeFullDvaBank(): Question[] {
  return [
    ...Array.from({ length: 25 }, (_, index) => makeQuestion(index + 1, 'Development')),
    ...Array.from({ length: 20 }, (_, index) => makeQuestion(index + 101, 'Security')),
    ...Array.from({ length: 18 }, (_, index) => makeQuestion(index + 201, 'Deployment')),
    ...Array.from({ length: 14 }, (_, index) => makeQuestion(index + 301, 'Troubleshooting')),
  ]
}

function range(start: number, end: number, step = 1): number[] {
  const values: number[] = []
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    values.push(value)
  }
  return values
}

function countByDomain(questions: Array<{ domain: string }>) {
  return questions.reduce<Record<string, number>>((counts, question) => {
    counts[question.domain] = (counts[question.domain] ?? 0) + 1
    return counts
  }, {})
}

function makeAttempt(id: string, type: Question['type'] = 'single'): MockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    currentIndex: 0,
    questionCount: 1,
    timeLimitSeconds: 7800,
    startedAt: 1000,
    updatedAt: 1000,
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: type === 'multi' ? ['A', 'B'] : ['A'],
        type,
        userPicks: [],
        correct: null,
        flagged: false,
        answered: false,
      },
    ],
  }
}

function makeSnapshot(
  qid: number,
  domain: string,
  picks: Array<'A' | 'B'>,
  correct: boolean | null,
) {
  return {
    qid,
    domain,
    topic: domain,
    correctAnswer: ['A'] as Array<'A'>,
    type: 'single' as const,
    userPicks: picks,
    correct,
    flagged: false,
    answered: picks.length > 0,
  }
}

function makeSubmitted(
  id: string,
  cert: 'DVA-C02' | 'CLF-C02',
  submittedAt: number,
  score: number,
) {
  const attempt = makeAttempt(id)
  return {
    id,
    cert,
    submittedAt,
    questions: attempt.questions,
    summary: {
      score,
      passed: score >= (cert === 'CLF-C02' ? 700 : 720),
      correctCount: 1,
      totalCount: 1,
      unansweredCount: 0,
      accuracy: 1,
      timeUsedSeconds: 600,
      autoSubmitted: false,
      domains: [],
    },
  }
}

class FailingOnceProgress extends BrowserProgressModule {
  readonly answers: Array<{
    qid: number
    picks: Array<'A' | 'B'>
    correct: boolean
    cert: 'DVA-C02' | 'CLF-C02'
  }> = []
  private failed = false

  constructor(private readonly failingQid: number) {
    super('anonymous')
  }

  override recordAnswer(
    qid: number,
    picks: Array<'A' | 'B'>,
    correct: boolean,
    cert: 'DVA-C02' | 'CLF-C02',
  ): void {
    if (qid === this.failingQid && !this.failed) {
      this.failed = true
      throw new Error('progress failed')
    }
    this.answers.push({ qid, picks, correct, cert })
  }
}

class RecordingProgress extends BrowserProgressModule {
  readonly answers: Array<{
    qid: number
    picks: Array<'A' | 'B'>
    correct: boolean
    cert: 'DVA-C02' | 'CLF-C02'
  }> = []

  constructor() {
    super('anonymous')
  }

  override recordAnswer(
    qid: number,
    picks: Array<'A' | 'B'>,
    correct: boolean,
    cert: 'DVA-C02' | 'CLF-C02',
  ): void {
    this.answers.push({ qid, picks, correct, cert })
  }
}
