import { describe, expect, it, vi } from 'vitest'
import type { QuestionProgress } from '../src/data/types'
import { buildWrongRedoSessionQids } from '../src/lib/wrong-redo-session'

function makeProgress(qid: number, lastCorrect: boolean | null): QuestionProgress {
  return {
    qid,
    correctCount: lastCorrect ? 1 : 0,
    wrongCount: lastCorrect === false ? 1 : 0,
    lastPicks: ['A'],
    lastCorrect,
    lastAnsweredAt: lastCorrect === null ? null : 1,
    bookmarked: false,
    bookmarkUpdatedAt: null,
  }
}

describe('buildWrongRedoSessionQids', () => {
  it('captures only current-bank latest incorrect qids exactly once', () => {
    const qids = buildWrongRedoSessionQids(
      [1, 2, 3],
      [
        makeProgress(1, false),
        makeProgress(2, true),
        makeProgress(3, false),
        makeProgress(4, false),
        makeProgress(5, null),
      ],
      vi.fn(() => 0),
    )

    expect(qids.toSorted()).toEqual([1, 3])
    expect(new Set(qids).size).toBe(qids.length)
  })

  it('deduplicates repeated progress entries for the same qid', () => {
    const qids = buildWrongRedoSessionQids(
      [1, 2, 3],
      [makeProgress(1, false), makeProgress(1, false), makeProgress(2, false)],
      vi.fn(() => 0),
    )

    expect(qids.toSorted()).toEqual([1, 2])
    expect(new Set(qids).size).toBe(qids.length)
  })

  it('can produce a fresh order without changing the captured set', () => {
    const progress = [makeProgress(1, false), makeProgress(2, false), makeProgress(3, false)]

    const first = buildWrongRedoSessionQids(
      [1, 2, 3],
      progress,
      vi.fn(() => 0),
    )
    const second = buildWrongRedoSessionQids(
      [1, 2, 3],
      progress,
      vi.fn(() => 0.99),
    )

    expect(first.toSorted()).toEqual([1, 2, 3])
    expect(second.toSorted()).toEqual([1, 2, 3])
    expect(first).not.toEqual(second)
  })
})
