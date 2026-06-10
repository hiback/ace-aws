'use client'
import { useQuery } from '@tanstack/react-query'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'

export interface RecentDailyQuestionStats {
  date: string
  correctCount: number
  wrongCount: number
  answered: number
  isToday: boolean
}

export interface WeakAreaStats {
  topic: string
  answered: number
  correct: number
  wrong: number
  accuracy: number
}

const MIN_WEAK_AREA_ANSWERS = 2
const WEAK_AREA_ACCURACY_THRESHOLD = 80

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function useProgressStats(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'stats', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const base = progress.getStats(cert)
      return { ...base, total: bank.length }
    },
    staleTime: 0,
  })
}

export function useDailyQuestionStats(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'daily-stats', cert],
    queryFn: () => {
      const today = new Date()
      const todayKey = localDateKey(today)
      const statsByDate = new Map(progress.listDailyStats(cert).map((entry) => [entry.date, entry]))

      return Array.from({ length: 7 }, (_, index): RecentDailyQuestionStats => {
        const date = localDateKey(addLocalDays(today, index - 6))
        const stats = statsByDate.get(date)
        const correctCount = stats?.correctCount ?? 0
        const wrongCount = stats?.wrongCount ?? 0
        return {
          date,
          correctCount,
          wrongCount,
          answered: correctCount + wrongCount,
          isToday: date === todayKey,
        }
      })
    },
    staleTime: 0,
  })
}

export function useStatsStreak(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'streak', cert],
    queryFn: () => {
      const answeredDates = new Set(
        progress
          .listDailyStats(cert)
          .filter((entry) => entry.correctCount + entry.wrongCount > 0)
          .map((entry) => entry.date),
      )
      let streak = 0
      let cursor = new Date()

      while (answeredDates.has(localDateKey(cursor))) {
        streak += 1
        cursor = addLocalDays(cursor, -1)
      }

      return streak
    },
    staleTime: 0,
  })
}

export function useWeakAreaStats(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'weak-areas', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const topicsByQid = new Map(bank.map((question) => [question.id, question.topic]))
      const byTopic = new Map<string, { answered: number; correct: number; wrong: number }>()

      for (const entry of progress.listAnswered(cert)) {
        const topic = topicsByQid.get(entry.qid)
        if (!topic) continue
        const stats = byTopic.get(topic) ?? { answered: 0, correct: 0, wrong: 0 }
        stats.answered += 1
        if (entry.lastCorrect === true) stats.correct += 1
        else stats.wrong += 1
        byTopic.set(topic, stats)
      }

      return Array.from(byTopic, ([topic, stats]): WeakAreaStats => {
        const accuracy = Math.round((stats.correct / stats.answered) * 100)
        return { topic, ...stats, accuracy }
      })
        .filter(
          (area) =>
            area.answered >= MIN_WEAK_AREA_ANSWERS && area.accuracy < WEAK_AREA_ACCURACY_THRESHOLD,
        )
        .sort(
          (a, b) =>
            a.accuracy - b.accuracy || b.answered - a.answered || a.topic.localeCompare(b.topic),
        )
    },
    staleTime: 0,
  })
}

export function useWrongList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'wrong', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const bankIds = new Set(bank.map((question) => question.id))
      return progress.listWrong(cert).filter((entry) => bankIds.has(entry.qid))
    },
    staleTime: 0,
  })
}

export function useWrongRedoCount(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'wrong-redo-count', cert],
    queryFn: async () => {
      const bank = await loadBank(cert)
      const allProgress = progress.listProgress(cert)
      const bankIds = new Set(bank.map((question) => question.id))
      return allProgress.filter((entry) => entry.lastCorrect === false && bankIds.has(entry.qid))
        .length
    },
    staleTime: 0,
  })
}

export function useBookmarksList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'bookmarks', cert],
    queryFn: () => progress.listBookmarks(cert),
    staleTime: 0,
  })
}

export function useProgressList(cert: CertCode) {
  const { progress, scope } = useProgressScope()
  return useQuery({
    queryKey: ['progress', scope, 'list', cert],
    queryFn: () => progress.listProgress(cert),
    staleTime: 0,
  })
}
