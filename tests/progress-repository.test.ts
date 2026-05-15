import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalProgressRepository } from '../src/repositories/local-progress-repository'

const CERT = 'DVA-C02'

describe('LocalProgressRepository', () => {
  let repo: LocalProgressRepository

  beforeEach(() => {
    localStorage.clear()
    repo = new LocalProgressRepository('anonymous')
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('progress records', () => {
    it('returns null when no progress exists for a question', () => {
      expect(repo.getProgress(1, CERT)).toBeNull()
    })

    it('creates progress with sorted last picks and a correct count', () => {
      repo.recordAnswer(1, ['D', 'B'], true, CERT)

      expect(repo.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_000,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      })
    })

    it('increments counts across repeat attempts and keeps the latest answer state', () => {
      repo.recordAnswer(1, ['A'], false, CERT)
      vi.setSystemTime(1_700_000_000_500)
      repo.recordAnswer(1, ['C'], true, CERT)

      expect(repo.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_500,
      })
    })

    it('lists answered records and excludes bookmark-only records', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.toggleBookmark(2, CERT)

      expect(repo.listAnswered(CERT).map((p) => p.qid)).toEqual([1])
      expect(
        repo
          .listProgress(CERT)
          .map((p) => p.qid)
          .sort((a, b) => a - b),
      ).toEqual([1, 2])
    })

    it('lists wrong records by latest answer state', () => {
      repo.recordAnswer(1, ['A'], false, CERT)
      repo.recordAnswer(2, ['B'], false, CERT)
      repo.recordAnswer(2, ['C'], true, CERT)

      const wrong = repo.listWrong(CERT)

      expect(wrong).toHaveLength(1)
      expect(wrong[0]).toMatchObject({ qid: 1, lastCorrect: false, wrongCount: 1 })
    })

    it('isolates progress by cert', () => {
      repo.recordAnswer(1, ['A'], true, 'DVA-C02')
      repo.recordAnswer(1, ['B'], false, 'CLF-C02')

      expect(repo.getProgress(1, 'DVA-C02')?.lastPicks).toEqual(['A'])
      expect(repo.getProgress(1, 'CLF-C02')?.lastPicks).toEqual(['B'])
      expect(repo.listWrong('DVA-C02')).toHaveLength(0)
      expect(repo.listWrong('CLF-C02')).toHaveLength(1)
    })
  })

  describe('bookmarks', () => {
    it('creates a bookmark-only progress record', () => {
      repo.toggleBookmark(5, CERT)

      expect(repo.getProgress(5, CERT)).toMatchObject({
        qid: 5,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_000_000,
      })
    })

    it('keeps a tombstone when an unanswered bookmark is removed', () => {
      repo.toggleBookmark(5, CERT)
      vi.setSystemTime(1_700_000_001_000)
      repo.toggleBookmark(5, CERT)

      expect(repo.isBookmarked(5, CERT)).toBe(false)
      expect(repo.listBookmarks(CERT)).toEqual([])
      expect(repo.getProgress(5, CERT)).toMatchObject({
        qid: 5,
        bookmarked: false,
        bookmarkUpdatedAt: 1_700_000_001_000,
        lastAnsweredAt: null,
      })
    })

    it('preserves answer counts when toggling bookmarks', () => {
      repo.recordAnswer(3, ['A'], false, CERT)
      repo.toggleBookmark(3, CERT)
      repo.toggleBookmark(3, CERT)

      expect(repo.getProgress(3, CERT)).toMatchObject({
        wrongCount: 1,
        lastCorrect: false,
        bookmarked: false,
      })
    })
  })

  describe('stats', () => {
    it('returns zeros initially', () => {
      expect(repo.getStats(CERT)).toEqual({ answered: 0, correct: 0, total: 0 })
    })

    it('counts answered questions and latest-correct questions', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.recordAnswer(2, ['B'], false, CERT)
      repo.recordAnswer(3, ['C'], false, CERT)
      repo.recordAnswer(3, ['D'], true, CERT)
      repo.toggleBookmark(4, CERT)

      expect(repo.getStats(CERT)).toEqual({ answered: 3, correct: 2, total: 0 })
    })
  })

  describe('storage scopes', () => {
    it('isolates anonymous and account progress keys', () => {
      repo.recordAnswer(1, ['A'], true, CERT)

      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['B'], false, CERT)

      expect(repo.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(accountRepo.getProgress(1, CERT)?.lastPicks).toEqual(['B'])
    })

    it('survives across new repository instances in the same scope', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.toggleBookmark(2, CERT)

      const repo2 = new LocalProgressRepository('anonymous')

      expect(repo2.getProgress(1, CERT)).not.toBeNull()
      expect(repo2.isBookmarked(2, CERT)).toBe(true)
    })

    it('treats invalid cert progress data as empty progress', () => {
      localStorage.setItem(
        'ace-aws/anonymous-progress/v1',
        JSON.stringify({ byCert: { 'DVA-C02': {}, 'CLF-C02': { progress: null } } }),
      )

      expect(repo.getProgress(1, 'DVA-C02')).toBeNull()
      expect(repo.listProgress('CLF-C02')).toEqual([])
    })

    it('normalizes malformed question progress entries', () => {
      localStorage.setItem(
        'ace-aws/anonymous-progress/v1',
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {},
                2: null,
                nope: { qid: 99, lastAnsweredAt: 1_700_000_000_000 },
              },
            },
          },
        }),
      )

      expect(repo.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      })
      expect(repo.listProgress(CERT).map((p) => p.qid)).toEqual([1])
      expect(repo.listAnswered(CERT)).toEqual([])
      expect(repo.listWrong(CERT)).toEqual([])
      expect(repo.listBookmarks(CERT)).toEqual([])
    })
  })
})
