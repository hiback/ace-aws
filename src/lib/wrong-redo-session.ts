import type { QuestionProgress } from '@/data/types'

export function buildWrongRedoSessionQids(
  bankQids: readonly number[],
  progress: readonly QuestionProgress[],
  random: () => number = Math.random,
): number[] {
  const bankIds = new Set(bankQids)
  const seen = new Set<number>()
  const qids: number[] = []

  for (const entry of progress) {
    if (entry.lastCorrect !== false || !bankIds.has(entry.qid) || seen.has(entry.qid)) continue
    seen.add(entry.qid)
    qids.push(entry.qid)
  }

  for (let i = qids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const current = qids[i]
    qids[i] = qids[j]
    qids[j] = current
  }

  return qids
}
