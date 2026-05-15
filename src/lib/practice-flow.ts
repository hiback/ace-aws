import type { CertCode } from '@/data/types'
import { certPath } from '@/lib/cert-catalog'

export const PRACTICE_SOURCES = ['/', '/list/wrong', '/list/bookmarks'] as const

export type PracticeSource = (typeof PRACTICE_SOURCES)[number]
export type ListPracticeSource = Extract<PracticeSource, '/list/wrong' | '/list/bookmarks'>

const SOURCE_SET = new Set<string>(PRACTICE_SOURCES)
const MAX_SET_LENGTH = 4096

export function normalizePracticeSource(value: string | null | undefined): PracticeSource {
  return value && SOURCE_SET.has(value) ? (value as PracticeSource) : '/'
}

export function isListPracticeSource(source: PracticeSource): source is ListPracticeSource {
  return source === '/list/wrong' || source === '/list/bookmarks'
}

export function encodePracticeSet(qids: readonly number[]): string {
  return qids.join(',')
}

export function buildPracticeHref(
  cert: CertCode,
  qid: number,
  source: PracticeSource,
  set: readonly number[] | string | null = null,
): string {
  const params = new URLSearchParams({ from: source })
  if (Array.isArray(set) && set.length > 0) params.set('set', encodePracticeSet(set))
  else if (typeof set === 'string' && set.length > 0) params.set('set', set)

  return `/practice/${certPath(cert)}/${qid}?${params.toString()}`
}

export function buildCompletionHref(cert: CertCode, source: PracticeSource): string {
  const params = new URLSearchParams({ from: source })
  return `/practice/${certPath(cert)}/complete?${params.toString()}`
}

export function parsePracticeSet(
  raw: string | null,
  bankQids: ReadonlySet<number>,
): number[] | null {
  if (!raw || raw.length > MAX_SET_LENGTH) return null

  const parts = raw.split(',')
  if (parts.length === 0) return null

  const seen = new Set<number>()
  const parsed: number[] = []

  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const qid = Number(part)
    if (!Number.isSafeInteger(qid) || qid <= 0) return null
    if (!bankQids.has(qid)) continue
    if (seen.has(qid)) continue
    seen.add(qid)
    parsed.push(qid)
  }

  if (parsed.length === 0 || parsed.length > bankQids.size) return null
  return parsed
}

export function findNextInPracticeSet(currentQid: number, qids: readonly number[]): number | null {
  const currentIndex = qids.indexOf(currentQid)
  if (currentIndex < 0 || currentIndex >= qids.length - 1) return null
  return qids[currentIndex + 1]
}
