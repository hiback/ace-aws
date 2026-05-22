import type { QuestionProgress } from '@/data/types'

export const SMART_PRACTICE_SESSION_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

type Candidate = {
  qid: number
  progress: QuestionProgress | null
}

function takeRandom(
  candidates: readonly number[],
  count: number,
  selected: Set<number>,
  random: () => number,
): number[] {
  const pool = candidates.filter((qid) => !selected.has(qid))
  const picked: number[] = []

  while (picked.length < count && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
    const [qid] = pool.splice(index, 1)
    selected.add(qid)
    picked.push(qid)
  }

  return picked
}

function recencyMultiplier(candidate: Candidate, now: number): number {
  const lastAnsweredAt = candidate.progress?.lastAnsweredAt
  if (!lastAnsweredAt) return 1

  const age = now - lastAnsweredAt
  if (age > 7 * DAY_MS) return 3
  if (age >= 3 * DAY_MS) return 2
  if (age >= DAY_MS) return 1.5
  return 1
}

function wrongRateMultiplier(candidate: Candidate): number {
  const entry = candidate.progress
  if (!entry) return 1

  const total = entry.correctCount + entry.wrongCount
  if (total === 0) return 1

  return 1 + (entry.wrongCount / total) * 3
}

function unifiedWeight(candidate: Candidate, now: number): number {
  const entry = candidate.progress
  if (!entry || entry.lastCorrect === null) return 5
  if (entry.lastCorrect === false) return 4 * recencyMultiplier(candidate, now)
  // One-attempt wrong answers are owned by Wrong Redo above; this is one correct attempt.
  if (entry.correctCount + entry.wrongCount === 1) return 3 * recencyMultiplier(candidate, now)
  if (entry.wrongCount > 0)
    return wrongRateMultiplier(candidate) * recencyMultiplier(candidate, now)
  return recencyMultiplier(candidate, now)
}

function takeWeighted(
  candidates: readonly Candidate[],
  count: number,
  selected: Set<number>,
  random: () => number,
  weight: (candidate: Candidate) => number,
): number[] {
  const pool = candidates.filter((candidate) => !selected.has(candidate.qid))
  const picked: number[] = []

  while (picked.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((sum, candidate) => sum + Math.max(0, weight(candidate)), 0)
    if (totalWeight <= 0) break

    let threshold = random() * totalWeight
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i += 1) {
      threshold -= Math.max(0, weight(pool[i]))
      if (threshold < 0) {
        index = i
        break
      }
    }

    const [candidate] = pool.splice(index, 1)
    selected.add(candidate.qid)
    picked.push(candidate.qid)
  }

  return picked
}

export function buildSmartPracticeSessionQids(
  bankQids: readonly number[],
  progress: readonly QuestionProgress[],
  random: () => number = Math.random,
  now: number = Date.now(),
): number[] {
  const bankIds: number[] = []
  const bankSet = new Set<number>()
  for (const qid of bankQids) {
    if (bankSet.has(qid)) continue
    bankSet.add(qid)
    bankIds.push(qid)
  }

  const progressByQid = new Map<number, QuestionProgress>()
  for (const entry of progress) {
    if (bankSet.has(entry.qid)) progressByQid.set(entry.qid, entry)
  }

  const unanswered: number[] = []
  const advancementWrongRedo: Candidate[] = []
  const advancementRecoveredWrong: Candidate[] = []
  const advancementCorrectOnly: Candidate[] = []
  const consolidationWrongRedo: Candidate[] = []
  const consolidationSingleAttempt: Candidate[] = []
  const consolidationRecoveredWrong: Candidate[] = []
  const consolidationCorrectOnly: Candidate[] = []
  const allCandidates: Candidate[] = []

  for (const qid of bankIds) {
    const entry = progressByQid.get(qid)
    const candidate = { qid, progress: entry ?? null }
    allCandidates.push(candidate)

    if (!entry || entry.lastCorrect === null) {
      unanswered.push(qid)
    } else if (entry.lastCorrect === false) {
      advancementWrongRedo.push(candidate)
      consolidationWrongRedo.push(candidate)
    } else if (entry.wrongCount > 0) {
      advancementRecoveredWrong.push(candidate)
      consolidationRecoveredWrong.push(candidate)
    } else {
      advancementCorrectOnly.push(candidate)
      if (entry.correctCount + entry.wrongCount === 1) consolidationSingleAttempt.push(candidate)
      else consolidationCorrectOnly.push(candidate)
    }
  }

  const selected = new Set<number>()
  const qids =
    unanswered.length > 0
      ? [
          ...takeRandom(unanswered, 7, selected, random),
          ...takeWeighted(advancementWrongRedo, 1, selected, random, (candidate) =>
            recencyMultiplier(candidate, now),
          ),
          ...takeWeighted(advancementRecoveredWrong, 1, selected, random, wrongRateMultiplier),
          ...takeWeighted(advancementCorrectOnly, 1, selected, random, (candidate) =>
            recencyMultiplier(candidate, now),
          ),
        ]
      : [
          ...takeWeighted(consolidationWrongRedo, 3, selected, random, (candidate) =>
            recencyMultiplier(candidate, now),
          ),
          ...takeWeighted(consolidationSingleAttempt, 3, selected, random, () => 1),
          ...takeWeighted(consolidationRecoveredWrong, 2, selected, random, wrongRateMultiplier),
          ...takeWeighted(consolidationCorrectOnly, 2, selected, random, (candidate) =>
            recencyMultiplier(candidate, now),
          ),
        ]

  qids.push(
    ...takeWeighted(
      allCandidates,
      Math.min(SMART_PRACTICE_SESSION_SIZE, bankIds.length) - qids.length,
      selected,
      random,
      (candidate) => unifiedWeight(candidate, now),
    ),
  )

  return qids
}
