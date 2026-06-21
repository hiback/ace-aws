import { describe, expect, it } from 'vitest'
import {
  buildReadmeScreenshotFixtureState,
  README_SCREENSHOT_FIXED_NOW,
  README_SCREENSHOT_REQUIRED_CLF_QIDS,
} from '../scripts/readme-screenshots/fixtures'
import clfBank from '../src/data/clf-c02.json'

describe('README screenshot fixture state', () => {
  it('fails clearly when fixed CLF-C02 fixture questions are unavailable', () => {
    expect(() => buildReadmeScreenshotFixtureState([])).toThrow(
      /Missing fixed CLF-C02 README screenshot fixture questions: 1, 2, 3, 4/,
    )
  })

  it('constructs deterministic local state for practice, lists, mock exam, and settings', () => {
    const state = buildReadmeScreenshotFixtureState(clfBank)
    const progress = JSON.parse(state.localStorage['ace-aws/progress/v1'])
    const mockExam = JSON.parse(state.localStorage['ace-aws/mock-exam/local/v1'])
    const accountProgress = JSON.parse(state.localStorage['ace-aws/account-progress/v1'])
    const accountSync = JSON.parse(state.localStorage['ace-aws/account-progress-sync/v1'])

    expect(Object.keys(progress.byCert['CLF-C02'].progress).sort()).toEqual(['1', '2', '3', '4'])
    expect(progress.byCert['CLF-C02'].progress[2]).toMatchObject({
      qid: 2,
      correctCount: 1,
      wrongCount: 0,
      lastCorrect: true,
      bookmarked: false,
    })
    expect(progress.byCert['CLF-C02'].progress[3]).toMatchObject({
      qid: 3,
      correctCount: 0,
      wrongCount: 1,
      lastCorrect: false,
      bookmarked: true,
    })
    expect(mockExam.attempts['readme-clf-c02-draft']).toMatchObject({
      id: 'readme-clf-c02-draft',
      cert: 'CLF-C02',
      draftStatus: 'saved',
      currentIndex: 1,
      elapsedSeconds: 600,
    })
    expect(
      mockExam.attempts['readme-clf-c02-draft'].questions.map((q: { qid: number }) => q.qid),
    ).toEqual(README_SCREENSHOT_REQUIRED_CLF_QIDS)
    const submittedAttempts = Object.values(mockExam.submittedAttempts['CLF-C02']) as Array<{
      summary: { passed: boolean; score: number }
      submittedAt: number
    }>
    expect(submittedAttempts).toHaveLength(4)
    expect(
      submittedAttempts
        .filter((attempt) => attempt.summary.passed)
        .map((attempt) => attempt.summary.score)
        .sort((a, b) => a - b),
    ).toEqual([723, 820])
    expect(mockExam.submittedAttempts['CLF-C02']['readme-clf-c02-submitted'].submittedAt).toBe(
      README_SCREENSHOT_FIXED_NOW - 3_600_000,
    )
    expect(accountProgress.byCert['CLF-C02'].progress[2]).toMatchObject({ qid: 2 })
    expect(accountSync.byUser['readme-user']['CLF-C02']).toEqual({
      revision: 7,
      lastSyncedAt: README_SCREENSHOT_FIXED_NOW - 120_000,
    })
  })

  it('constructs richer deterministic state for Stats screenshots', () => {
    const state = buildReadmeScreenshotFixtureState(clfBank, { fixture: 'stats' })
    const progress = JSON.parse(state.localStorage['ace-aws/progress/v1'])
    const stats = progress.byCert['CLF-C02']

    expect(Object.keys(stats.dailyStats).sort()).toEqual([
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
    ])
    expect(Object.keys(stats.progress).length).toBeGreaterThan(12)
    expect(stats.dailyStats['2026-01-15']).toMatchObject({
      correctCount: 3,
      wrongCount: 1,
    })
  })
})
