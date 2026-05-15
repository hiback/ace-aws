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
})
