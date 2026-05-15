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
    expect(normalizePracticeSource('/list/wrong')).toBe('/list/wrong')
    expect(normalizePracticeSource('/list/bookmarks')).toBe('/list/bookmarks')
    expect(normalizePracticeSource('/settings')).toBe('/')
    expect(normalizePracticeSource(null)).toBe('/')
  })

  it('detects list practice sources', () => {
    expect(isListPracticeSource('/')).toBe(false)
    expect(isListPracticeSource('/list/wrong')).toBe(true)
    expect(isListPracticeSource('/list/bookmarks')).toBe(true)
  })

  it('builds encoded practice hrefs with optional set snapshots', () => {
    expect(buildPracticeHref('DVA-C02', 7, '/list/wrong', [7, 9])).toBe(
      '/practice/dva-c02/7?from=%2Flist%2Fwrong&set=7%2C9',
    )
    expect(buildPracticeHref('DVA-C02', 7, '/', null)).toBe('/practice/dva-c02/7?from=%2F')
    expect(buildPracticeHref('DVA-C02', 7, '/list/wrong', '7,9')).toBe(
      '/practice/dva-c02/7?from=%2Flist%2Fwrong&set=7%2C9',
    )
  })

  it('builds encoded completion hrefs', () => {
    expect(buildCompletionHref('DVA-C02', '/')).toBe('/practice/dva-c02/complete?from=%2F')
    expect(buildCompletionHref('DVA-C02', '/list/bookmarks')).toBe(
      '/practice/dva-c02/complete?from=%2Flist%2Fbookmarks',
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

  it('finds the next qid inside a parsed snapshot', () => {
    expect(findNextInPracticeSet(2, [1, 2, 3])).toBe(3)
    expect(findNextInPracticeSet(3, [1, 2, 3])).toBeNull()
    expect(findNextInPracticeSet(9, [1, 2, 3])).toBeNull()
  })
})
