import { beforeEach, describe, expect, it } from 'vitest'
import { LocalProgressRepository } from '../src/repositories/local-progress-repository'

const CERT = 'DVA-C02'

describe('LocalProgressRepository', () => {
  let repo: LocalProgressRepository

  beforeEach(() => {
    localStorage.clear()
    repo = new LocalProgressRepository()
  })

  describe('answers', () => {
    it('returns null for unanswered question', () => {
      expect(repo.getAnswer(1, CERT)).toBeNull()
    })

    it('saves and retrieves an answer with sorted picks', () => {
      repo.saveAnswer(1, ['D', 'B'], true, CERT)
      const a = repo.getAnswer(1, CERT)
      expect(a).not.toBeNull()
      expect(a?.qid).toBe(1)
      expect(a?.picks).toEqual(['B', 'D'])
      expect(a?.correct).toBe(true)
      expect(typeof a?.answeredAt).toBe('number')
    })

    it('lists all answers', () => {
      repo.saveAnswer(1, ['A'], true, CERT)
      repo.saveAnswer(2, ['B'], false, CERT)
      const all = repo.listAnswers(CERT)
      expect(all).toHaveLength(2)
      expect(all.map((a) => a.qid).sort()).toEqual([1, 2])
    })

    it('lists only wrong answers', () => {
      repo.saveAnswer(1, ['A'], true, CERT)
      repo.saveAnswer(2, ['B'], false, CERT)
      repo.saveAnswer(3, ['C'], false, CERT)
      const wrong = repo.listWrong(CERT)
      expect(wrong).toHaveLength(2)
      expect(wrong.every((a) => !a.correct)).toBe(true)
    })

    it('overwrites existing answer (most recent wins)', () => {
      repo.saveAnswer(1, ['A'], false, CERT)
      repo.saveAnswer(1, ['C'], true, CERT)
      const a = repo.getAnswer(1, CERT)
      expect(a?.picks).toEqual(['C'])
      expect(a?.correct).toBe(true)
    })

    it('isolates answers by cert', () => {
      repo.saveAnswer(1, ['A'], true, 'DVA-C02')
      repo.saveAnswer(1, ['B'], false, 'CLF-C02')

      expect(repo.getAnswer(1, 'DVA-C02')?.picks).toEqual(['A'])
      expect(repo.getAnswer(1, 'CLF-C02')?.picks).toEqual(['B'])
      expect(repo.listAnswers('DVA-C02')).toHaveLength(1)
      expect(repo.listWrong('CLF-C02')).toHaveLength(1)
    })
  })

  describe('bookmarks', () => {
    it('toggle adds and removes', () => {
      expect(repo.isBookmarked(5, CERT)).toBe(false)
      repo.toggleBookmark(5, CERT)
      expect(repo.isBookmarked(5, CERT)).toBe(true)
      repo.toggleBookmark(5, CERT)
      expect(repo.isBookmarked(5, CERT)).toBe(false)
    })

    it('listBookmarks returns array of qids', () => {
      repo.toggleBookmark(1, CERT)
      repo.toggleBookmark(3, CERT)
      repo.toggleBookmark(5, CERT)
      expect(repo.listBookmarks(CERT).sort((a, b) => a - b)).toEqual([1, 3, 5])
    })

    it('isolates bookmarks by cert', () => {
      repo.toggleBookmark(1, 'DVA-C02')
      repo.toggleBookmark(1, 'CLF-C02')
      repo.toggleBookmark(2, 'CLF-C02')

      expect(repo.listBookmarks('DVA-C02')).toEqual([1])
      expect(repo.listBookmarks('CLF-C02').sort((a, b) => a - b)).toEqual([1, 2])
    })
  })

  describe('stats', () => {
    it('returns zeros initially', () => {
      expect(repo.getStats(CERT)).toEqual({ answered: 0, correct: 0, total: 0 })
    })

    it('counts answered + correct after saves', () => {
      repo.saveAnswer(1, ['A'], true, CERT)
      repo.saveAnswer(2, ['B'], true, CERT)
      repo.saveAnswer(3, ['C'], false, CERT)
      expect(repo.getStats(CERT)).toEqual({ answered: 3, correct: 2, total: 0 })
    })
  })

  describe('persistence', () => {
    it('survives across new repository instances', () => {
      repo.saveAnswer(1, ['A'], true, CERT)
      repo.toggleBookmark(2, CERT)
      const repo2 = new LocalProgressRepository()
      expect(repo2.getAnswer(1, CERT)).not.toBeNull()
      expect(repo2.isBookmarked(2, CERT)).toBe(true)
    })
  })
})
