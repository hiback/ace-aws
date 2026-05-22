import { describe, expect, it } from 'vitest'
import {
  buildCompletionHref,
  buildPracticeHref,
  findNextInPracticeSet,
  isListPracticeSource,
  normalizePracticeSource,
  parsePracticeSet,
} from '../src/lib/practice-flow'

describe('practice-flow helpers', () => {
  it('normalizes allowed practice sources and falls back to home', () => {
    expect(normalizePracticeSource('/')).toBe('/')
    expect(normalizePracticeSource('/list')).toBe('/list')
    expect(normalizePracticeSource('/list/wrong')).toBe('/list/wrong')
    expect(normalizePracticeSource('/list/bookmarks')).toBe('/list/bookmarks')
    expect(normalizePracticeSource('/list/unanswered')).toBe('/list/unanswered')
    expect(normalizePracticeSource('/wrong-redo')).toBe('/wrong-redo')
    expect(normalizePracticeSource('/smart-practice')).toBe('/smart-practice')
    expect(normalizePracticeSource('/settings')).toBe('/')
    expect(normalizePracticeSource(null)).toBe('/')
  })

  it('detects list practice sources', () => {
    expect(isListPracticeSource('/')).toBe(false)
    expect(isListPracticeSource('/list')).toBe(true)
    expect(isListPracticeSource('/list/wrong')).toBe(true)
    expect(isListPracticeSource('/list/bookmarks')).toBe(true)
    expect(isListPracticeSource('/list/unanswered')).toBe(true)
    expect(isListPracticeSource('/wrong-redo')).toBe(false)
    expect(isListPracticeSource('/smart-practice')).toBe(false)
  })

  it('builds encoded practice hrefs with optional set snapshots', () => {
    expect(buildPracticeHref('DVA-C02', 7, '/list/wrong', [7, 9])).toBe(
      '/practice/dva-c02/7?from=%2Flist%2Fwrong&set=7%2C9',
    )
    expect(buildPracticeHref('DVA-C02', 7, '/', null)).toBe('/practice/dva-c02/7?from=%2F')
    expect(buildPracticeHref('DVA-C02', 7, '/list/wrong', '7,9')).toBe(
      '/practice/dva-c02/7?from=%2Flist%2Fwrong&set=7%2C9',
    )
    expect(buildPracticeHref('DVA-C02', 7, '/smart-practice', [7, 9])).toBe(
      '/practice/dva-c02/7?from=%2Fsmart-practice&set=7%2C9',
    )
  })

  it('builds encoded completion hrefs', () => {
    expect(buildCompletionHref('DVA-C02', '/')).toBe('/practice/dva-c02/complete?from=%2F')
    expect(buildCompletionHref('DVA-C02', '/list/bookmarks')).toBe(
      '/practice/dva-c02/complete?from=%2Flist%2Fbookmarks',
    )
    expect(buildCompletionHref('DVA-C02', '/list/unanswered')).toBe(
      '/practice/dva-c02/complete?from=%2Flist%2Funanswered',
    )
    expect(buildCompletionHref('DVA-C02', '/smart-practice', [7, 9])).toBe(
      '/practice/dva-c02/complete?from=%2Fsmart-practice&set=7%2C9',
    )
  })

  it('parses a valid set against the current bank ids', () => {
    expect(parsePracticeSet('3,2,3,1', new Set([1, 2, 3]))).toEqual([3, 2, 1])
  })

  it('rejects missing, malformed, oversized, or non-matching sets', () => {
    expect(parsePracticeSet(null, new Set([1, 2, 3]))).toBeNull()
    expect(parsePracticeSet('', new Set([1, 2, 3]))).toBeNull()
    expect(parsePracticeSet('1,nope,2', new Set([1, 2, 3]))).toBeNull()
    expect(parsePracticeSet('1'.repeat(4097), new Set([1, 2, 3]))).toBeNull()
  })

  it('drops qids that do not exist in the current bank', () => {
    expect(parsePracticeSet('1,2,99,3', new Set([1, 2, 3]))).toEqual([1, 2, 3])
  })

  it('rejects sets above an explicit parsed item limit without globally capping parsed sets', () => {
    const bankIds = new Set(Array.from({ length: 11 }, (_value, index) => index + 1))
    const raw = '1,2,3,4,5,6,7,8,9,10,11'

    expect(parsePracticeSet(raw, bankIds, { maxItems: 10 })).toBeNull()
    expect(parsePracticeSet(raw, bankIds)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('finds the next qid inside a parsed snapshot', () => {
    expect(findNextInPracticeSet(2, [1, 2, 3])).toBe(3)
    expect(findNextInPracticeSet(3, [1, 2, 3])).toBeNull()
    expect(findNextInPracticeSet(9, [1, 2, 3])).toBeNull()
  })
})
