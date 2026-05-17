import { describe, expect, it } from 'vitest'
import { mergeQuestionProgress } from '../src/server/progress-sync/merge'

const oldIso = '2026-01-01T00:00:00.000Z'
const newIso = '2026-01-02T00:00:00.000Z'

describe('Question Progress deterministic merge', () => {
  it('accepts newer answer state while keeping field-wise maximum counts', () => {
    const merged = mergeQuestionProgress(
      {
        qid: 1,
        correctCount: 5,
        wrongCount: 4,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: oldIso,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
      {
        qid: 1,
        correctCount: 2,
        wrongCount: 9,
        lastPicks: ['B'],
        lastCorrect: false,
        lastAnsweredAt: newIso,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
    )

    expect(merged).toEqual({
      qid: 1,
      correctCount: 5,
      wrongCount: 9,
      lastPicks: ['B'],
      lastCorrect: false,
      lastAnsweredAt: newIso,
      bookmarked: false,
      bookmarkUpdatedAt: null,
    })
  })

  it('keeps server answer and bookmark state on equal timestamps or null upload timestamps', () => {
    const server = {
      qid: 1,
      correctCount: 1,
      wrongCount: 1,
      lastPicks: ['A'],
      lastCorrect: true,
      lastAnsweredAt: oldIso,
      bookmarked: true,
      bookmarkUpdatedAt: oldIso,
    } as const

    expect(
      mergeQuestionProgress(server, {
        qid: 1,
        correctCount: 9,
        wrongCount: 0,
        lastPicks: ['B'],
        lastCorrect: false,
        lastAnsweredAt: oldIso,
        bookmarked: false,
        bookmarkUpdatedAt: oldIso,
      }),
    ).toEqual({ ...server, correctCount: 9 })

    expect(
      mergeQuestionProgress(server, {
        qid: 1,
        correctCount: 0,
        wrongCount: 9,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      }),
    ).toEqual({ ...server, wrongCount: 9 })
  })

  it('preserves a newer Bookmark Tombstone as canonical Question Progress', () => {
    expect(
      mergeQuestionProgress(
        {
          qid: 1,
          correctCount: 0,
          wrongCount: 0,
          lastPicks: [],
          lastCorrect: null,
          lastAnsweredAt: null,
          bookmarked: true,
          bookmarkUpdatedAt: oldIso,
        },
        {
          qid: 1,
          correctCount: 0,
          wrongCount: 0,
          lastPicks: [],
          lastCorrect: null,
          lastAnsweredAt: null,
          bookmarked: false,
          bookmarkUpdatedAt: newIso,
        },
      ),
    ).toEqual({
      qid: 1,
      correctCount: 0,
      wrongCount: 0,
      lastPicks: [],
      lastCorrect: null,
      lastAnsweredAt: null,
      bookmarked: false,
      bookmarkUpdatedAt: newIso,
    })
  })
})
