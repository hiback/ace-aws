import { describe, expect, it, vi } from 'vitest'
import type { QuestionProgress } from '../src/data/types'
import { buildSmartPracticeSessionQids } from '../src/lib/smart-practice-session'

const NOW = Date.parse('2026-05-22T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function progress(
  qid: number,
  lastCorrect: boolean | null,
  wrongCount = 0,
  options: { correctCount?: number; lastAnsweredAt?: number | null } = {},
): QuestionProgress {
  return {
    qid,
    correctCount: options.correctCount ?? (lastCorrect ? 1 : 0),
    wrongCount,
    lastPicks: ['A'],
    lastCorrect,
    lastAnsweredAt: options.lastAnsweredAt ?? (lastCorrect === null ? null : NOW - DAY),
    bookmarked: false,
    bookmarkUpdatedAt: null,
  }
}

describe('buildSmartPracticeSessionQids', () => {
  it('builds an advancement phase session from current-bank candidates without duplicates', () => {
    const random = vi.fn(() => 0)

    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [progress(1, false, 1), progress(2, true, 1), progress(3, true, 0), progress(99, false, 1)],
      random,
    )

    expect(qids).toHaveLength(10)
    expect(new Set(qids).size).toBe(qids.length)
    expect(qids).toContain(1)
    expect(qids).toContain(2)
    expect(qids).toContain(3)
    expect(qids).not.toContain(99)
  })

  it('returns fewer than ten ids only when the current bank has fewer than ten questions', () => {
    expect(buildSmartPracticeSessionQids([1, 2, 3], [], () => 0)).toEqual([1, 2, 3])

    const qids = buildSmartPracticeSessionQids([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [], () => 0)

    expect(qids).toHaveLength(10)
  })

  it('uses advancement phase quotas whenever unanswered questions remain', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [progress(8, false, 1), progress(9, true, 1), progress(10, true, 0, { correctCount: 2 })],
      () => 0,
      NOW,
    )

    expect(qids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('uses consolidation phase quotas once no unanswered questions remain', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [
        progress(1, false, 2),
        progress(2, false, 1),
        progress(3, false, 1),
        progress(4, true, 0),
        progress(5, true, 0),
        progress(6, true, 0),
        progress(7, true, 2, { correctCount: 2 }),
        progress(8, true, 1, { correctCount: 2 }),
        progress(9, true, 0, { correctCount: 2 }),
        progress(10, true, 0, { correctCount: 3 }),
      ],
      () => 0,
      NOW,
    )

    expect(qids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('fills bucket shortages from a unified weighted candidate pool', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5],
      [
        progress(1, false, 1),
        progress(2, true, 0),
        progress(3, true, 0, { correctCount: 2 }),
        progress(4, true, 0, { correctCount: 2 }),
        progress(5, true, 0, { correctCount: 2 }),
      ],
      () => 0.95,
      NOW,
    )

    expect(qids).toEqual([1, 2, 5, 4, 3])
  })

  it('uses recency to weight wrong redo and correct-only candidates', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4],
      [
        progress(1, false, 1, { lastAnsweredAt: NOW - 12 * 60 * 60 * 1000 }),
        progress(2, false, 1, { lastAnsweredAt: NOW - 8 * DAY }),
        progress(3, true, 0, { correctCount: 2, lastAnsweredAt: NOW - 12 * 60 * 60 * 1000 }),
        progress(4, true, 0, { correctCount: 2, lastAnsweredAt: NOW - 8 * DAY }),
      ],
      () => 0.7,
      NOW,
    )

    expect(qids.slice(0, 2)).toEqual([2, 1])
    expect(qids.slice(2)).toEqual([4, 3])
  })

  it('uses recovered wrong rate as a weighting signal', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2],
      [progress(1, true, 1, { correctCount: 4 }), progress(2, true, 4, { correctCount: 1 })],
      () => 0.75,
      NOW,
    )

    expect(qids).toEqual([2, 1])
  })

  it('weights single-attempt questions above ordinary correct-only questions during consolidation fill', () => {
    const values = [0, 0, 0, 0, 0, 0.5, 0.5, 0]
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8],
      [
        progress(1, true, 0),
        progress(2, true, 0),
        progress(3, true, 0),
        progress(4, true, 0),
        progress(5, true, 0, { correctCount: 2 }),
        progress(6, true, 0, { correctCount: 2 }),
        progress(7, true, 0, { correctCount: 2 }),
        progress(8, true, 0, { correctCount: 2 }),
      ],
      () => values.shift() ?? 0,
      NOW,
    )

    expect(qids).toEqual([1, 2, 3, 5, 6, 4, 8, 7])
  })

  it('does not use bookmark state as a weighting signal in buckets or unified fill', () => {
    const progressWithoutBookmark = [
      progress(8, true, 0, { correctCount: 2 }),
      progress(9, true, 0, { correctCount: 2 }),
      progress(10, true, 0, { correctCount: 2 }),
    ]
    const progressWithBookmark = progressWithoutBookmark.map((entry) =>
      entry.qid === 10 ? { ...entry, bookmarked: true, bookmarkUpdatedAt: NOW } : entry,
    )
    const makeRandom = () => {
      const randomValues = [0, 0, 0, 0, 0, 0, 0, 0.2, 0.49, 0]
      return () => randomValues.shift() ?? 0
    }

    const unbookmarkedQids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      progressWithoutBookmark,
      makeRandom(),
      NOW,
    )
    const bookmarkedQids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      progressWithBookmark,
      makeRandom(),
      NOW,
    )

    expect(unbookmarkedQids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(bookmarkedQids).toEqual(unbookmarkedQids)
  })

  it('does not duplicate questions that match multiple consolidation signals and ignores stale progress', () => {
    const qids = buildSmartPracticeSessionQids(
      [1, 2, 3, 4],
      [
        progress(1, false, 1),
        progress(2, true, 0),
        progress(3, true, 1),
        progress(4, true, 0, { correctCount: 2 }),
        progress(99, false, 1),
      ],
      () => 0,
      NOW,
    )

    expect(qids).toEqual([1, 2, 3, 4])
    expect(new Set(qids).size).toBe(qids.length)
    expect(qids).not.toContain(99)
  })

  it('uses production randomness by default so repeated starts can vary', () => {
    const values = [0, 0, 0, 0.99, 0.99, 0.99]
    const random = vi.fn(() => values.shift() ?? 0)
    const spy = vi.spyOn(Math, 'random').mockImplementation(random)

    try {
      const first = buildSmartPracticeSessionQids([1, 2, 3], [])
      const second = buildSmartPracticeSessionQids([1, 2, 3], [])

      expect(first).not.toEqual(second)
    } finally {
      spy.mockRestore()
    }
  })
})
