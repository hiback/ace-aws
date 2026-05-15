import type { AnswerRecord, CertCode, Letter } from '@/data/types'

export interface ProgressRepository {
  // Answers
  getAnswer(qid: number, cert: CertCode): AnswerRecord | null
  saveAnswer(qid: number, picks: Letter[], correct: boolean, cert: CertCode): void
  listAnswers(cert: CertCode): AnswerRecord[]
  listWrong(cert: CertCode): AnswerRecord[]

  // Bookmarks
  toggleBookmark(qid: number, cert: CertCode): void
  isBookmarked(qid: number, cert: CertCode): boolean
  listBookmarks(cert: CertCode): number[]

  // Stats — `total` filled by caller (we don't know question bank size here)
  getStats(cert: CertCode): { answered: number; correct: number; total: number }
}
