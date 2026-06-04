import { describe, expect, it } from 'vitest'
import {
  type RawQuestion,
  sortedKey,
  transformQuestion,
  unwrapCite,
} from '../scripts/build-questions'

describe('ETL: unwrapCite', () => {
  it('removes <cite> wrapper but keeps inner content', () => {
    expect(unwrapCite('Hello <cite index="1-2">world</cite>!')).toBe('Hello world!')
  })

  it('handles multiple cites and multiline content', () => {
    const md = '<cite index="1">first</cite> middle <cite index="2-3">second\nline</cite>'
    expect(unwrapCite(md)).toBe('first middle second\nline')
  })

  it('passes through markdown without cite tags untouched', () => {
    expect(unwrapCite('## Header\n\nplain text')).toBe('## Header\n\nplain text')
  })
})

describe('ETL: sortedKey', () => {
  it('sorts and joins letters', () => {
    expect(sortedKey(['B', 'D'])).toBe('BD')
    expect(sortedKey(['D', 'B'])).toBe('BD')
    expect(sortedKey(['A'])).toBe('A')
  })

  it('uppercases input', () => {
    expect(sortedKey(['c', 'a'])).toBe('AC')
  })

  it('supports F for six-option SAA questions', () => {
    expect(sortedKey(['f', 'c', 'e'])).toBe('CEF')
  })
})

describe('ETL: transformQuestion (single)', () => {
  const single: RawQuestion = {
    id: 1,
    correct_answer: ['C'],
    vote_distribution: { C: 88, A: 8, D: 4 },
    domain: 'Security',
    en: {
      question: 'EN q',
      options: { A: 'a', B: 'b', C: 'c', D: 'd' },
      explanation_md: 'EN <cite index="1">ref</cite> end',
    },
    zh: {
      question: 'ZH q',
      options: { A: 'a', B: 'b', C: 'c', D: 'd' },
      explanation_md: 'ZH 解释',
    },
  }

  it('produces single-type question', () => {
    const out = transformQuestion(single, 'DVA-C02')
    expect(out.type).toBe('single')
    if (out.type !== 'single') throw new Error('narrowing failed')
    expect(out.id).toBe(1)
    expect(out.cert).toBe('DVA-C02')
    expect(out.topic).toBe('Security')
    expect(out.correct_answer).toEqual(['C'])
    expect(out.vote_distribution).toEqual({ C: 88, A: 8, D: 4 })
    expect(out.en.explanation).toBe('EN ref end')
    expect(out.zh.explanation).toBe('ZH 解释')
  })

  it('uses the configured cert code', () => {
    const out = transformQuestion(single, 'CLF-C02')
    expect(out.cert).toBe('CLF-C02')
  })

  it('aggregates non-single-letter vote keys into Other', () => {
    const out = transformQuestion(
      {
        ...single,
        vote_distribution: { C: 80, BD: 7, AF: 5, ABC: 3, Other: 2 },
      },
      'SAA-C03',
    )

    expect(out.type).toBe('single')
    if (out.type !== 'single') throw new Error('narrowing failed')
    expect(out.vote_distribution.C).toBe(80)
    expect(out.vote_distribution.Other).toBe(17)
    expect(Object.hasOwn(out.vote_distribution, 'BD')).toBe(false)
    expect(Object.hasOwn(out.vote_distribution, 'AF')).toBe(false)
    expect(Object.hasOwn(out.vote_distribution, 'ABC')).toBe(false)
  })

  it('aggregates empty and repeated vote keys into Other', () => {
    const out = transformQuestion(
      {
        ...single,
        vote_distribution: { C: 80, '': 4, AA: 3, AAB: 2 },
      },
      'SAA-C03',
    )

    expect(out.type).toBe('single')
    if (out.type !== 'single') throw new Error('narrowing failed')
    expect(out.vote_distribution.C).toBe(80)
    expect(out.vote_distribution.Other).toBe(9)
    expect(Object.hasOwn(out.vote_distribution, '')).toBe(false)
    expect(Object.hasOwn(out.vote_distribution, 'AA')).toBe(false)
    expect(Object.hasOwn(out.vote_distribution, 'AAB')).toBe(false)
  })
})

describe('ETL: transformQuestion (multi)', () => {
  const multi: RawQuestion = {
    id: 7,
    correct_answer: ['D', 'B'], // unsorted on input
    vote_distribution: { DB: 63, BC: 33, CD: 4, Other: 2 }, // 'DB' must normalize to 'BD'
    domain: 'Deployment',
    en: { question: 'EN q', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, explanation_md: 'x' },
    zh: { question: 'ZH q', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, explanation_md: 'x' },
  }

  it('produces multi-type question with sorted correct_answer', () => {
    const out = transformQuestion(multi, 'DVA-C02')
    expect(out.type).toBe('multi')
    if (out.type !== 'multi') throw new Error('narrowing failed')
    expect(out.correct_answer).toEqual(['B', 'D'])
    expect(out.answer_count).toBe(2)
  })

  it('normalizes vote_distribution keys to sorted letters', () => {
    const out = transformQuestion(multi, 'DVA-C02')
    if (out.type !== 'multi') throw new Error('narrowing failed')
    expect(out.vote_distribution.BD).toBe(63)
    expect(out.vote_distribution.BC).toBe(33)
    expect(out.vote_distribution.CD).toBe(4)
    expect(out.vote_distribution.DB).toBeUndefined()
  })

  it('preserves real Other vote bucket without letter-sorting it', () => {
    const out = transformQuestion(multi, 'DVA-C02')
    if (out.type !== 'multi') throw new Error('narrowing failed')
    expect(out.vote_distribution.Other).toBe(2)
    expect(out.vote_distribution.EHOORT).toBeUndefined()
  })

  it('supports SAA three-answer questions with F options and three-letter votes', () => {
    const out = transformQuestion(
      {
        id: 101,
        correct_answer: ['F', 'C', 'A'],
        vote_distribution: { FCE: 21, BDF: 9, u: 3, Other: 2 },
        domain: 'Design Resilient Architectures',
        en: {
          question: 'EN q',
          options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e', F: 'f' },
          explanation_md: 'x',
        },
        zh: {
          question: 'ZH q',
          options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e', F: 'f' },
          explanation_md: 'x',
        },
      },
      'SAA-C03',
    )

    expect(out.type).toBe('multi')
    if (out.type !== 'multi') throw new Error('narrowing failed')
    expect(out.cert).toBe('SAA-C03')
    expect(out.correct_answer).toEqual(['A', 'C', 'F'])
    expect(out.answer_count).toBe(3)
    expect(out.en.options.F).toBe('f')
    expect(out.vote_distribution.CEF).toBe(21)
    expect(out.vote_distribution.BDF).toBe(9)
    expect(out.vote_distribution.Other).toBe(5)
    expect(out.vote_distribution.u).toBeUndefined()
  })

  it('aggregates empty and repeated multi-answer vote keys into Other', () => {
    const out = transformQuestion(
      {
        ...multi,
        vote_distribution: { DB: 63, '': 5, AA: 4, AAB: 3, Other: 2 },
      },
      'SAA-C03',
    )

    expect(out.type).toBe('multi')
    if (out.type !== 'multi') throw new Error('narrowing failed')
    expect(out.vote_distribution.BD).toBe(63)
    expect(out.vote_distribution.Other).toBe(14)
    expect(out.vote_distribution['']).toBeUndefined()
    expect(out.vote_distribution.AA).toBeUndefined()
    expect(out.vote_distribution.AAB).toBeUndefined()
  })
})
