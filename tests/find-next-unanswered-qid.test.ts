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
    progressRepo.saveAnswer(2, ['A'], true, CERT)
    progressRepo.saveAnswer(3, ['A'], true, CERT)
    expect(await findNextUnansweredQid(1, CERT)).toBe(4)
  })

  it('only skips answers for the requested cert', async () => {
    progressRepo.saveAnswer(1, ['A'], true, 'DVA-C02')
    expect(await findNextUnansweredQid(0, 'CLF-C02')).toBe(1)
  })

  it('wraps around to find earlier unanswered when at end', async () => {
    progressRepo.saveAnswer(4, ['A'], true, CERT)
    progressRepo.saveAnswer(5, ['A'], true, CERT)
    expect(await findNextUnansweredQid(3, CERT)).toBe(1)
  })

  it('returns null when all questions answered', async () => {
    for (let i = 1; i <= 5; i++) progressRepo.saveAnswer(i, ['A'], true, CERT)
    expect(await findNextUnansweredQid(0, CERT)).toBeNull()
  })

  it('returns null on empty bank', async () => {
    vi.mocked(loadBank).mockResolvedValue([])
    expect(await findNextUnansweredQid(0, CERT)).toBeNull()
  })
})
