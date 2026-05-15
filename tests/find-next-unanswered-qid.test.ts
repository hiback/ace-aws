import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/loaders', () => ({
  loadBank: vi.fn(),
  normalizeCert: (cert: string) => cert.toUpperCase(),
}))

import { loadBank } from '../src/data/loaders'
import { findNextUnansweredQid } from '../src/hooks/use-answer'
import { progressRepo } from '../src/repositories/local-progress-repository'

const CERT = 'DVA-C02'

describe('findNextUnansweredQid', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(loadBank).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: i + 1 })) as never,
    )
  })

  it('returns 1 when no questions answered and currentQid is 0', async () => {
    expect(await findNextUnansweredQid(0, CERT)).toBe(1)
  })

  it('returns next id when current qid is in the middle', async () => {
    expect(await findNextUnansweredQid(2, CERT)).toBe(3)
  })

  it('skips already answered questions', async () => {
    progressRepo.recordAnswer(2, ['A'], true, CERT)
    progressRepo.recordAnswer(3, ['A'], true, CERT)
    expect(await findNextUnansweredQid(1, CERT)).toBe(4)
  })

  it('only skips answers for the requested cert', async () => {
    progressRepo.recordAnswer(1, ['A'], true, 'DVA-C02')
    expect(await findNextUnansweredQid(0, 'CLF-C02')).toBe(1)
  })

  it('wraps around to find earlier unanswered when at end', async () => {
    progressRepo.recordAnswer(4, ['A'], true, CERT)
    progressRepo.recordAnswer(5, ['A'], true, CERT)
    expect(await findNextUnansweredQid(3, CERT)).toBe(1)
  })

  it('returns null when all questions answered', async () => {
    for (let i = 1; i <= 5; i++) progressRepo.recordAnswer(i, ['A'], true, CERT)
    expect(await findNextUnansweredQid(0, CERT)).toBeNull()
  })

  it('returns null on empty bank', async () => {
    vi.mocked(loadBank).mockResolvedValue([])
    expect(await findNextUnansweredQid(0, CERT)).toBeNull()
  })

  it('finds the next qid from a valid list-review set', async () => {
    const { findNextListReviewQid } = await import('../src/hooks/use-answer')

    expect(await findNextListReviewQid(2, CERT, '/list/wrong', '5,2,4')).toBe(4)
  })

  it('returns null when the list-review set ends at the current qid', async () => {
    const { findNextListReviewQid } = await import('../src/hooks/use-answer')

    expect(await findNextListReviewQid(4, CERT, '/list/wrong', '5,2,4')).toBeNull()
  })

  it('falls back to the live wrong-list order when set is invalid', async () => {
    const { findNextListReviewQid } = await import('../src/hooks/use-answer')
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000)

    try {
      progressRepo.recordAnswer(1, ['A'], false, CERT)
      progressRepo.recordAnswer(2, ['A'], false, CERT)
    } finally {
      now.mockRestore()
    }

    expect(await findNextListReviewQid(2, CERT, '/list/wrong', 'missing')).toBe(1)
  })

  it('falls back to the live bookmark-list order when set is missing', async () => {
    const { findNextListReviewQid } = await import('../src/hooks/use-answer')
    progressRepo.toggleBookmark(1, CERT)
    progressRepo.toggleBookmark(3, CERT)

    expect(await findNextListReviewQid(1, CERT, '/list/bookmarks', null)).toBe(3)
  })
})
