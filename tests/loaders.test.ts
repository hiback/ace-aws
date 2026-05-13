import { describe, expect, it } from 'vitest'
import { loadBank, normalizeCert } from '../src/data/loaders'

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
})
