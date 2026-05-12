import { beforeEach, describe, expect, it } from 'vitest'
import { LocalProgressRepository } from '../src/repositories/local-progress-repository'

describe('LocalProgressRepository', () => {
  let repo: LocalProgressRepository

  beforeEach(() => {
    localStorage.clear()
    repo = new LocalProgressRepository()
  })

  describe('answers', () => {
    it('returns null for unanswered question', () => {
      expect(repo.getAnswer(1)).toBeNull()
    })

    it('saves and retrieves an answer with sorted picks', () => {
      repo.saveAnswer(1, ['D', 'B'], true)
      const a = repo.getAnswer(1)
      expect(a).not.toBeNull()
      expect(a!.qid).toBe(1)
      expect(a!.picks).toEqual(['B', 'D'])
      expect(a!.correct).toBe(true)
      expect(typeof a!.answeredAt).toBe('number')
    })

    it('lists all answers', () => {
      repo.saveAnswer(1, ['A'], true)
      repo.saveAnswer(2, ['B'], false)
      const all = repo.listAnswers()
      expect(all).toHaveLength(2)
      expect(all.map((a) => a.qid).sort()).toEqual([1, 2])
    })

    it('lists only wrong answers', () => {
      repo.saveAnswer(1, ['A'], true)
      repo.saveAnswer(2, ['B'], false)
      repo.saveAnswer(3, ['C'], false)
      const wrong = repo.listWrong()
      expect(wrong).toHaveLength(2)
      expect(wrong.every((a) => !a.correct)).toBe(true)
    })

    it('overwrites existing answer (most recent wins)', () => {
      repo.saveAnswer(1, ['A'], false)
      repo.saveAnswer(1, ['C'], true)
      const a = repo.getAnswer(1)
      expect(a!.picks).toEqual(['C'])
      expect(a!.correct).toBe(true)
    })
  })

  describe('bookmarks', () => {
    it('toggle adds and removes', () => {
      expect(repo.isBookmarked(5)).toBe(false)
      repo.toggleBookmark(5)
      expect(repo.isBookmarked(5)).toBe(true)
      repo.toggleBookmark(5)
      expect(repo.isBookmarked(5)).toBe(false)
    })

    it('listBookmarks returns array of qids', () => {
      repo.toggleBookmark(1)
      repo.toggleBookmark(3)
      repo.toggleBookmark(5)
      expect(repo.listBookmarks().sort((a, b) => a - b)).toEqual([1, 3, 5])
    })
  })

  describe('stats', () => {
    it('returns zeros initially', () => {
      expect(repo.getStats()).toEqual({ answered: 0, correct: 0, total: 0 })
    })

    it('counts answered + correct after saves', () => {
      repo.saveAnswer(1, ['A'], true)
      repo.saveAnswer(2, ['B'], true)
      repo.saveAnswer(3, ['C'], false)
      expect(repo.getStats()).toEqual({ answered: 3, correct: 2, total: 0 })
    })
  })

  describe('persistence', () => {
    it('survives across new repository instances', () => {
      repo.saveAnswer(1, ['A'], true)
      repo.toggleBookmark(2)
      const repo2 = new LocalProgressRepository()
      expect(repo2.getAnswer(1)).not.toBeNull()
      expect(repo2.isBookmarked(2)).toBe(true)
    })
  })
})
