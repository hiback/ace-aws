import type { CertCode, Letter, ProgressScope, QuestionProgress } from '@/data/types'
import type { ProgressRepository } from './progress-repository'

const PROGRESS_KEYS: Record<ProgressScope, string> = {
  anonymous: 'ace-aws/anonymous-progress/v1',
  account: 'ace-aws/account-progress/v1',
}

interface ProgressData {
  byCert: Partial<Record<CertCode, CertProgressData>>
}

interface CertProgressData {
  progress: Record<number, QuestionProgress>
}

const EMPTY_CERT_PROGRESS: CertProgressData = { progress: {} }
const EMPTY: ProgressData = { byCert: {} }

function emptyCertProgress(): CertProgressData {
  return { progress: {} }
}

function createProgress(qid: number): QuestionProgress {
  return {
    qid,
    correctCount: 0,
    wrongCount: 0,
    lastPicks: [],
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: false,
    bookmarkUpdatedAt: null,
  }
}

function normalizeProgress(qid: number, value: Record<string, unknown>): QuestionProgress {
  return {
    qid,
    correctCount: typeof value.correctCount === 'number' ? value.correctCount : 0,
    wrongCount: typeof value.wrongCount === 'number' ? value.wrongCount : 0,
    lastPicks: Array.isArray(value.lastPicks) ? (value.lastPicks as Letter[]).sort() : [],
    lastCorrect: typeof value.lastCorrect === 'boolean' ? value.lastCorrect : null,
    lastAnsweredAt: typeof value.lastAnsweredAt === 'number' ? value.lastAnsweredAt : null,
    bookmarked: typeof value.bookmarked === 'boolean' ? value.bookmarked : false,
    bookmarkUpdatedAt: typeof value.bookmarkUpdatedAt === 'number' ? value.bookmarkUpdatedAt : null,
    ...(typeof value.dirtySince === 'number' ? { dirtySince: value.dirtySince } : {}),
  }
}

function normalizeProgressMap(value: unknown): Record<number, QuestionProgress> {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, progress]) => {
        const qid = Number(key)
        if (!Number.isInteger(qid) || qid <= 0 || !progress || typeof progress !== 'object') {
          return null
        }

        return [qid, normalizeProgress(qid, progress as Record<string, unknown>)]
      })
      .filter((entry): entry is [number, QuestionProgress] => entry !== null),
  )
}

function normalizeProgressData(value: unknown): ProgressData {
  if (!value || typeof value !== 'object' || !('byCert' in value)) return { byCert: {} }

  const byCert = (value as { byCert: unknown }).byCert
  if (!byCert || typeof byCert !== 'object') return { byCert: {} }

  return {
    byCert: Object.fromEntries(
      Object.entries(byCert).map(([cert, certData]) => {
        if (!certData || typeof certData !== 'object' || !('progress' in certData)) {
          return [cert, emptyCertProgress()]
        }

        return [
          cert,
          { progress: normalizeProgressMap((certData as { progress: unknown }).progress) },
        ]
      }),
    ) as ProgressData['byCert'],
  }
}

export class LocalProgressRepository implements ProgressRepository {
  private readonly storageKey: string

  constructor(scope: ProgressScope = 'anonymous') {
    this.storageKey = PROGRESS_KEYS[scope]
  }

  private read(): ProgressData {
    if (typeof window === 'undefined') return EMPTY
    const raw = window.localStorage.getItem(this.storageKey)
    if (!raw) return { byCert: {} }
    try {
      return normalizeProgressData(JSON.parse(raw))
    } catch {
      return { byCert: {} }
    }
  }

  private write(data: ProgressData): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(this.storageKey, JSON.stringify(data))
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

  private progressFor(certData: CertProgressData, qid: number): QuestionProgress {
    const existing = certData.progress[qid]
    if (existing) return existing
    const next = createProgress(qid)
    certData.progress[qid] = next
    return next
  }

  getProgress(qid: number, cert: CertCode): QuestionProgress | null {
    return this.readCert(cert).progress[qid] ?? null
  }

  recordAnswer(qid: number, picks: Letter[], correct: boolean, cert: CertCode): void {
    const data = this.read()
    const progress = this.progressFor(this.certData(data, cert), qid)

    if (correct) progress.correctCount += 1
    else progress.wrongCount += 1

    progress.lastPicks = [...picks].sort() as Letter[]
    progress.lastCorrect = correct
    progress.lastAnsweredAt = Date.now()

    this.write(data)
  }

  listProgress(cert: CertCode): QuestionProgress[] {
    return Object.values(this.readCert(cert).progress)
  }

  listAnswered(cert: CertCode): QuestionProgress[] {
    return this.listProgress(cert).filter((progress) => progress.lastAnsweredAt !== null)
  }

  listWrong(cert: CertCode): QuestionProgress[] {
    return this.listProgress(cert).filter((progress) => progress.lastCorrect === false)
  }

  toggleBookmark(qid: number, cert: CertCode): void {
    const data = this.read()
    const progress = this.progressFor(this.certData(data, cert), qid)

    progress.bookmarked = !progress.bookmarked
    progress.bookmarkUpdatedAt = Date.now()

    this.write(data)
  }

  isBookmarked(qid: number, cert: CertCode): boolean {
    return this.getProgress(qid, cert)?.bookmarked ?? false
  }

  listBookmarks(cert: CertCode): number[] {
    return this.listProgress(cert)
      .filter((progress) => progress.bookmarked)
      .map((progress) => progress.qid)
  }

  getStats(cert: CertCode): { answered: number; correct: number; total: number } {
    const answered = this.listAnswered(cert)
    return {
      answered: answered.length,
      correct: answered.filter((progress) => progress.lastCorrect === true).length,
      total: 0,
    }
  }
}

export const progressRepo: LocalProgressRepository = new LocalProgressRepository()
