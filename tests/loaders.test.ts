import { describe, expect, it } from 'vitest'
import { loadBank, normalizeCert } from '../src/data/loaders'
import { READY_CERTS } from '../src/lib/cert-catalog'

describe('normalizeCert', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeCert('dva-c02')).toBe('DVA-C02')
  })

  it('passes through already-canonical input', () => {
    expect(normalizeCert('DVA-C02')).toBe('DVA-C02')
  })

  it('handles mixed case', () => {
    expect(normalizeCert('Dva-C02')).toBe('DVA-C02')
  })

  it('normalizes CLF cert input', () => {
    expect(normalizeCert('clf-c02')).toBe('CLF-C02')
  })

  it('normalizes SAA cert input and marks it ready', () => {
    expect(normalizeCert('saa-c03')).toBe('SAA-C03')
    expect(READY_CERTS).toContain('SAA-C03')
  })

  it('throws on unknown cert', () => {
    expect(() => normalizeCert('unknown')).toThrow(/Unknown cert/)
  })
})

describe('loadBank (integration with normalization)', () => {
  it('accepts lowercase cert and returns the bank', async () => {
    const bank = await loadBank('dva-c02' as never)
    expect(Array.isArray(bank)).toBe(true)
    expect(bank.length).toBeGreaterThan(0)
    expect(bank[0]).toHaveProperty('id')
  })

  it('accepts canonical cert and returns the same bank', async () => {
    const bank = await loadBank('DVA-C02')
    expect(Array.isArray(bank)).toBe(true)
    expect(bank.length).toBeGreaterThan(0)
  })

  it('loads the CLF bank', async () => {
    const bank = await loadBank('CLF-C02')
    expect(bank).toHaveLength(719)
    expect(bank[0]?.cert).toBe('CLF-C02')
  })

  it('loads the SAA bank with six-option three-answer questions', async () => {
    const bank = await loadBank('saa-c03')
    expect(bank).toHaveLength(1019)
    expect(bank[0]?.cert).toBe('SAA-C03')
    expect(bank.some((q) => q.type === 'multi' && q.answer_count === 3)).toBe(true)
    expect(
      bank.some(
        (q) =>
          q.type === 'multi' &&
          q.answer_count === 3 &&
          (q.correct_answer.includes('F') || Object.hasOwn(q.en.options, 'F')),
      ),
    ).toBe(true)
  })
})
