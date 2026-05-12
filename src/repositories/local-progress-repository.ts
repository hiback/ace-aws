import type { AnswerRecord, Letter, Prefs } from '@/data/types'
import { DEFAULT_PREFS } from '@/data/types'
import type { ProgressRepository } from './progress-repository'

const PROGRESS_KEY = 'ace-aws/progress/v1'
const PREFS_KEY = 'ace-aws/prefs/v1'

interface ProgressData {
  answers: Record<number, AnswerRecord>
  bookmarks: number[]
}

const EMPTY: ProgressData = { answers: {}, bookmarks: [] }

export class LocalProgressRepository implements ProgressRepository {
  private read(): ProgressData {
    if (typeof window === 'undefined') return EMPTY
    const raw = window.localStorage.getItem(PROGRESS_KEY)
    if (!raw) return { answers: {}, bookmarks: [] }
    try {
      return JSON.parse(raw) as ProgressData
    } catch {
      return { answers: {}, bookmarks: [] }
    }
  }

  private write(data: ProgressData): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(data))
  }

  getAnswer(qid: number): AnswerRecord | null {
    return this.read().answers[qid] ?? null
  }

  saveAnswer(qid: number, picks: Letter[], correct: boolean): void {
    const data = this.read()
    data.answers[qid] = {
      qid,
      picks: [...picks].sort() as Letter[],
      correct,
      answeredAt: Date.now(),
    }
    this.write(data)
  }

  listAnswers(): AnswerRecord[] {
    return Object.values(this.read().answers)
  }

  listWrong(): AnswerRecord[] {
    return this.listAnswers().filter((a) => !a.correct)
  }

  toggleBookmark(qid: number): void {
    const data = this.read()
    const idx = data.bookmarks.indexOf(qid)
    if (idx >= 0) data.bookmarks.splice(idx, 1)
    else data.bookmarks.push(qid)
    this.write(data)
  }

  isBookmarked(qid: number): boolean {
    return this.read().bookmarks.includes(qid)
  }

  listBookmarks(): number[] {
    return [...this.read().bookmarks]
  }

  getPrefs(): Prefs {
    if (typeof window === 'undefined') return DEFAULT_PREFS
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    try {
      const wrapped = JSON.parse(raw) as { state?: Prefs }
      return { ...DEFAULT_PREFS, ...(wrapped.state ?? {}) }
    } catch {
      return DEFAULT_PREFS
    }
  }

  updatePrefs(patch: Partial<Prefs>): void {
    void patch
    throw new Error(
      'updatePrefs() should be called via usePrefsStore.setState, not the repository directly. See spec §5.3.',
    )
  }

  getStats(): { answered: number; correct: number; total: number } {
    const all = this.listAnswers()
    return {
      answered: all.length,
      correct: all.filter((a) => a.correct).length,
      total: 0,
    }
  }
}

export const progressRepo: LocalProgressRepository = new LocalProgressRepository()
