import { describe, expect, it } from 'vitest'
import { loadBank, normalizeCert } from '../src/data/loaders'
import { getCertOption, READY_CERTS } from '../src/lib/cert-catalog'

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

  it('normalizes SAP cert input and marks it ready', () => {
    expect(normalizeCert('sap-c02')).toBe('SAP-C02')
    expect(READY_CERTS).toContain('SAP-C02')
  })

  it('normalizes DOP cert input and marks it ready without marking it hot', () => {
    expect(normalizeCert('dop-c02')).toBe('DOP-C02')
    expect(READY_CERTS).toContain('DOP-C02')
    expect(getCertOption('DOP-C02').hot).not.toBe(true)
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

  it('loads the SAP bank', async () => {
    const bank = await loadBank('sap-c02')
    expect(bank).toHaveLength(529)
    expect(bank[0]?.cert).toBe('SAP-C02')
  })

  it('loads a complete bilingual DOP bank', async () => {
    const bank = await loadBank('dop-c02')

    expect(bank).toHaveLength(429)
    expect(bank.every((question) => question.cert === 'DOP-C02')).toBe(true)
    expect(bank.some((question) => question.type === 'multi' && question.answer_count === 3)).toBe(
      true,
    )
    expect(bank.some((question) => Object.hasOwn(question.en.options, 'F'))).toBe(true)
    expect(new Set(bank.map((question) => question.id)).size).toBe(bank.length)

    for (const question of bank) {
      expect(question.en.question).not.toBe('')
      expect(question.en.explanation).not.toBe('')
      expect(question.zh.question).not.toBe('')
      expect(question.zh.explanation).not.toBe('')
      expect(Object.keys(question.zh.options).sort()).toEqual(
        Object.keys(question.en.options).sort(),
      )
      for (const answer of question.correct_answer) {
        expect(question.en.options[answer]).toBeTruthy()
        expect(question.zh.options[answer]).toBeTruthy()
      }
    }
  })
})
