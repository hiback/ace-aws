import type { AnswerRecord, CertCode, Letter } from '@/data/types'
import type { ProgressRepository } from './progress-repository'

const PROGRESS_KEY = 'ace-aws/progress/v2'

interface ProgressData {
  byCert: Partial<Record<CertCode, CertProgressData>>
}

interface CertProgressData {
  answers: Record<number, AnswerRecord>
  bookmarks: number[]
}

const EMPTY_CERT_PROGRESS: CertProgressData = { answers: {}, bookmarks: [] }
const EMPTY: ProgressData = { byCert: {} }

function emptyCertProgress(): CertProgressData {
  return { answers: {}, bookmarks: [] }
}

export class LocalProgressRepository implements ProgressRepository {
  private read(): ProgressData {
    if (typeof window === 'undefined') return EMPTY
    const raw = window.localStorage.getItem(PROGRESS_KEY)
    if (!raw) return { byCert: {} }
    try {
      const parsed = JSON.parse(raw) as ProgressData
      return parsed && typeof parsed === 'object' && 'byCert' in parsed ? parsed : { byCert: {} }
    } catch {
      return { byCert: {} }
    }
  }

  private write(data: ProgressData): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(data))
  }

  private certData(data: ProgressData, cert: CertCode): CertProgressData {
    const existing = data.byCert[cert]
    if (existing) return existing
    const next = emptyCertProgress()
    data.byCert[cert] = next
    return next
  }

  private readCert(cert: CertCode): CertProgressData {
    return this.read().byCert[cert] ?? EMPTY_CERT_PROGRESS
  }

  getAnswer(qid: number, cert: CertCode): AnswerRecord | null {
    return this.readCert(cert).answers[qid] ?? null
  }

  saveAnswer(qid: number, picks: Letter[], correct: boolean, cert: CertCode): void {
    const data = this.read()
    this.certData(data, cert).answers[qid] = {
      qid,
      picks: [...picks].sort() as Letter[],
      correct,
      answeredAt: Date.now(),
    }
    this.write(data)
  }

  listAnswers(cert: CertCode): AnswerRecord[] {
    return Object.values(this.readCert(cert).answers)
  }

  listWrong(cert: CertCode): AnswerRecord[] {
    return this.listAnswers(cert).filter((a) => !a.correct)
  }

  toggleBookmark(qid: number, cert: CertCode): void {
    const data = this.read()
    const certData = this.certData(data, cert)
    const idx = certData.bookmarks.indexOf(qid)
    if (idx >= 0) certData.bookmarks.splice(idx, 1)
    else certData.bookmarks.push(qid)
    this.write(data)
  }

  isBookmarked(qid: number, cert: CertCode): boolean {
    return this.readCert(cert).bookmarks.includes(qid)
  }

  listBookmarks(cert: CertCode): number[] {
    return [...this.readCert(cert).bookmarks]
  }

  getStats(cert: CertCode): { answered: number; correct: number; total: number } {
    const all = this.listAnswers(cert)
    return {
      answered: all.length,
      correct: all.filter((a) => a.correct).length,
      total: 0,
    }
  }
}

export const progressRepo: LocalProgressRepository = new LocalProgressRepository()
