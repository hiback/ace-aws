import type { CertCode, Letter, QuestionProgress } from '@/data/types'

export interface ProgressRepository {
  getProgress(qid: number, cert: CertCode): QuestionProgress | null
  recordAnswer(qid: number, picks: Letter[], correct: boolean, cert: CertCode): void
  listProgress(cert: CertCode): QuestionProgress[]
  listAnswered(cert: CertCode): QuestionProgress[]
  listWrong(cert: CertCode): QuestionProgress[]

  toggleBookmark(qid: number, cert: CertCode): void
  isBookmarked(qid: number, cert: CertCode): boolean
  listBookmarks(cert: CertCode): number[]

  getStats(cert: CertCode): { answered: number; correct: number; total: number }
}
