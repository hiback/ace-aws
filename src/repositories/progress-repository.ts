import type { AnswerRecord, Letter, Prefs } from '@/data/types'

export interface ProgressRepository {
  // Answers
  getAnswer(qid: number): AnswerRecord | null
  saveAnswer(qid: number, picks: Letter[], correct: boolean): void
  listAnswers(): AnswerRecord[]
  listWrong(): AnswerRecord[]

  // Bookmarks
  toggleBookmark(qid: number): void
  isBookmarked(qid: number): boolean
  listBookmarks(): number[]

  // Prefs (delegated to Zustand store at runtime; defined here for completeness)
  getPrefs(): Prefs
  updatePrefs(patch: Partial<Prefs>): void

  // Stats — `total` filled by caller (we don't know question bank size here)
  getStats(): { answered: number; correct: number; total: number }
}
