import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('@/data/loaders')
  vi.resetModules()
})

describe('Progress Sync question bank index cache', () => {
  it('caches constructed indexes by certification and shares concurrent cold construction', async () => {
    const loadBank = vi.fn(async () => [
      {
        id: 1,
        type: 'single',
        answer_count: undefined,
        en: { options: { A: 'A', B: 'B' } },
        zh: { options: { A: 'A', B: 'B' } },
      },
    ])
    vi.doMock('@/data/loaders', () => ({ loadBank }))
    const { getQuestionBankIndex } = await import('../src/server/progress-sync/question-bank-index')

    const [left, right] = await Promise.all([
      getQuestionBankIndex('DVA-C02'),
      getQuestionBankIndex('DVA-C02'),
    ])
    const cached = await getQuestionBankIndex('DVA-C02')
    await getQuestionBankIndex('CLF-C02')

    expect(left).toBe(right)
    expect(cached).toBe(left)
    expect(loadBank).toHaveBeenCalledTimes(2)
    expect(loadBank).toHaveBeenNthCalledWith(1, 'DVA-C02')
    expect(loadBank).toHaveBeenNthCalledWith(2, 'CLF-C02')
  })

  it('retries construction after a failed cold build', async () => {
    const loadBank = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([
        {
          id: 1,
          type: 'single',
          answer_count: undefined,
          en: { options: { A: 'A' } },
          zh: { options: { A: 'A' } },
        },
      ])
    vi.doMock('@/data/loaders', () => ({ loadBank }))
    const { getQuestionBankIndex } = await import('../src/server/progress-sync/question-bank-index')

    await expect(getQuestionBankIndex('DVA-C02')).rejects.toThrow('boom')
    await expect(getQuestionBankIndex('DVA-C02')).resolves.toMatchObject({ questionCount: 1 })

    expect(loadBank).toHaveBeenCalledTimes(2)
  })
})
