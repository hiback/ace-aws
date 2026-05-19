import type { CertCode, Letter, ProgressScope, QuestionProgress } from '@/data/types'
import { isReadyCertCode, READY_CERTS } from '@/lib/cert-catalog'
import type { ProgressRepository } from './progress-repository'

const PROGRESS_KEYS: Record<ProgressScope, string> = {
  anonymous: 'ace-aws/progress/v1',
  account: 'ace-aws/account-progress/v1',
}

export const ACCOUNT_PROGRESS_OWNER_KEY = 'ace-aws/account-owner/v1'
export const ACCOUNT_PROGRESS_SYNC_KEY = 'ace-aws/account-progress-sync/v1'
export const ANONYMOUS_IMPORT_DISMISSAL_KEY = 'ace-aws/anonymous-import-dismissal/v1'

export interface AccountSyncBaseline {
  revision: number
  lastSyncedAt: number
}

interface AccountSyncData {
  byUser: Record<string, Partial<Record<CertCode, AccountSyncBaseline>>>
}

interface ProgressData {
  byCert: Partial<Record<CertCode, CertProgressData>>
}

export interface AnonymousImportSummary {
  certs: CertCode[]
  certCount: number
  recordCount: number
}

interface CertProgressData {
  progress: Record<number, QuestionProgress>
}

const EMPTY_CERT_PROGRESS: CertProgressData = { progress: {} }
const EMPTY: ProgressData = { byCert: {} }

function normalizeAccountSyncData(value: unknown): AccountSyncData {
  if (!value || typeof value !== 'object' || !('byUser' in value)) return { byUser: {} }
  const byUser = (value as { byUser: unknown }).byUser
  if (!byUser || typeof byUser !== 'object') return { byUser: {} }

  return {
    byUser: Object.fromEntries(
      Object.entries(byUser).map(([userId, certs]) => [
        userId,
        certs && typeof certs === 'object'
          ? Object.fromEntries(
              Object.entries(certs)
                .map(([cert, baseline]) => {
                  if (!isReadyCertCode(cert)) return null
                  if (!baseline || typeof baseline !== 'object') return null
                  const { revision, lastSyncedAt } = baseline as Record<string, unknown>
                  if (
                    typeof revision !== 'number' ||
                    !Number.isFinite(revision) ||
                    typeof lastSyncedAt !== 'number' ||
                    !Number.isFinite(lastSyncedAt)
                  ) {
                    return null
                  }
                  return [cert, { revision, lastSyncedAt }] as [CertCode, AccountSyncBaseline]
                })
                .filter((entry): entry is [CertCode, AccountSyncBaseline] => entry !== null),
            )
          : {},
      ]),
    ) as AccountSyncData['byUser'],
  }
}

function readAccountSyncData(): AccountSyncData {
  if (typeof window === 'undefined') return { byUser: {} }
  const raw = window.localStorage.getItem(ACCOUNT_PROGRESS_SYNC_KEY)
  if (!raw) return { byUser: {} }
  try {
    return normalizeAccountSyncData(JSON.parse(raw))
  } catch {
    return { byUser: {} }
  }
}

function writeAccountSyncData(data: AccountSyncData): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACCOUNT_PROGRESS_SYNC_KEY, JSON.stringify(data))
}

function readAnonymousImportDismissals(): Record<string, true> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(ANONYMOUS_IMPORT_DISMISSAL_KEY)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value).filter(([, dismissed]) => dismissed === true),
    ) as Record<string, true>
  } catch {
    return {}
  }
}

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

function hasProgressContent(progress: QuestionProgress): boolean {
  return (
    progress.correctCount > 0 ||
    progress.wrongCount > 0 ||
    progress.lastAnsweredAt !== null ||
    progress.bookmarked ||
    progress.bookmarkUpdatedAt !== null
  )
}

function sameCanonicalProgress(a: QuestionProgress | undefined, b: QuestionProgress): boolean {
  if (!a) return false
  return (
    a.qid === b.qid &&
    a.correctCount === b.correctCount &&
    a.wrongCount === b.wrongCount &&
    a.lastCorrect === b.lastCorrect &&
    a.lastAnsweredAt === b.lastAnsweredAt &&
    a.bookmarked === b.bookmarked &&
    a.bookmarkUpdatedAt === b.bookmarkUpdatedAt &&
    a.lastPicks.length === b.lastPicks.length &&
    a.lastPicks.every((pick, index) => pick === b.lastPicks[index])
  )
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
  private readonly scope: ProgressScope

  constructor(scope: ProgressScope = 'anonymous') {
    this.scope = scope
    this.storageKey = PROGRESS_KEYS[scope]
  }

  static clearScope(scope: ProgressScope): void {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(PROGRESS_KEYS[scope])
    if (scope === 'account') {
      window.localStorage.removeItem(ACCOUNT_PROGRESS_OWNER_KEY)
      window.localStorage.removeItem(ACCOUNT_PROGRESS_SYNC_KEY)
    }
  }

  static getAccountSyncBaseline(userId: string, cert: CertCode): AccountSyncBaseline | null {
    return readAccountSyncData().byUser[userId]?.[cert] ?? null
  }

  static isAccountOwner(userId: string): boolean {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY) === userId
  }

  static replaceAccountCertFromSnapshot(
    userId: string,
    cert: CertCode,
    revision: number,
    progress: QuestionProgress[],
  ): void {
    const repo = new LocalProgressRepository('account')
    const data = repo.read()
    data.byCert[cert] = {
      progress: Object.fromEntries(
        progress.map((entry) => [
          entry.qid,
          normalizeProgress(entry.qid, entry as unknown as Record<string, unknown>),
        ]),
      ),
    }
    repo.write(data)

    const syncData = readAccountSyncData()
    syncData.byUser[userId] = {
      ...syncData.byUser[userId],
      [cert]: { revision, lastSyncedAt: Date.now() },
    }
    writeAccountSyncData(syncData)
  }

  static replaceAccountCertFromSnapshotPreservingDirty(
    userId: string,
    cert: CertCode,
    revision: number,
    progress: QuestionProgress[],
    uploaded: QuestionProgress[],
    preserveUploaded = false,
  ): void {
    const uploadedByQid = new Map(uploaded.map((entry) => [entry.qid, entry]))
    const laterDirty = LocalProgressRepository.listDirtyAccountProgress(cert).filter((current) => {
      const uploadedEntry = uploadedByQid.get(current.qid)
      return preserveUploaded || !uploadedEntry || !sameCanonicalProgress(current, uploadedEntry)
    })

    LocalProgressRepository.replaceAccountCertFromSnapshot(userId, cert, revision, progress)

    if (laterDirty.length === 0) return
    const repo = new LocalProgressRepository('account')
    const data = repo.read()
    const certData = repo.certData(data, cert)
    for (const entry of laterDirty) {
      certData.progress[entry.qid] = entry
    }
    repo.write(data)
  }

  static clearAccountCert(userId: string, cert: CertCode): void {
    const repo = new LocalProgressRepository('account')
    const data = repo.read()
    delete data.byCert[cert]
    repo.write(data)

    LocalProgressRepository.clearAccountSyncBaseline(userId, cert)
  }

  static clearAccountSyncBaseline(userId: string, cert: CertCode): void {
    const syncData = readAccountSyncData()
    if (syncData.byUser[userId]) {
      delete syncData.byUser[userId][cert]
      writeAccountSyncData(syncData)
    }
  }

  static markAccountSyncBaselineChecked(userId: string, cert: CertCode, revision: number): void {
    const syncData = readAccountSyncData()
    syncData.byUser[userId] = {
      ...syncData.byUser[userId],
      [cert]: { revision, lastSyncedAt: Date.now() },
    }
    writeAccountSyncData(syncData)
  }

  static listDirtyAccountProgress(cert: CertCode): QuestionProgress[] {
    return new LocalProgressRepository('account')
      .listProgress(cert)
      .filter((progress) => progress.dirtySince !== undefined && hasProgressContent(progress))
  }

  static summarizeAnonymousImport(): AnonymousImportSummary {
    const repo = new LocalProgressRepository('anonymous')
    const certs: CertCode[] = []
    let recordCount = 0

    for (const cert of READY_CERTS) {
      const records = repo.listProgress(cert).filter(hasProgressContent)
      if (records.length === 0) continue
      certs.push(cert)
      recordCount += records.length
    }

    return { certs, certCount: certs.length, recordCount }
  }

  static listAnonymousImportProgress(cert: CertCode): QuestionProgress[] {
    return new LocalProgressRepository('anonymous').listProgress(cert).filter(hasProgressContent)
  }

  static clearAnonymousImportCert(cert: CertCode): void {
    if (typeof window === 'undefined') return
    const repo = new LocalProgressRepository('anonymous')
    const data = repo.read()
    delete data.byCert[cert]
    repo.write(data)
  }

  static hasDismissedAnonymousImport(userId: string): boolean {
    return readAnonymousImportDismissals()[userId] === true
  }

  static dismissAnonymousImport(userId: string): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      ANONYMOUS_IMPORT_DISMISSAL_KEY,
      JSON.stringify({ ...readAnonymousImportDismissals(), [userId]: true }),
    )
  }

  static clearAnonymousImportDismissal(userId: string): void {
    if (typeof window === 'undefined') return
    const dismissals = readAnonymousImportDismissals()
    delete dismissals[userId]
    window.localStorage.setItem(ANONYMOUS_IMPORT_DISMISSAL_KEY, JSON.stringify(dismissals))
  }

  static applyAcceptedAccountSync(
    userId: string,
    cert: CertCode,
    revision: number,
    accepted: QuestionProgress[],
    uploaded: QuestionProgress[] = accepted,
  ): void {
    const repo = new LocalProgressRepository('account')
    const data = repo.read()
    const certData = repo.certData(data, cert)
    const uploadedByQid = new Map(uploaded.map((entry) => [entry.qid, entry]))
    for (const entry of accepted) {
      const uploadedEntry = uploadedByQid.get(entry.qid)
      if (!uploadedEntry || !sameCanonicalProgress(certData.progress[entry.qid], uploadedEntry)) {
        continue
      }
      certData.progress[entry.qid] = normalizeProgress(
        entry.qid,
        entry as unknown as Record<string, unknown>,
      )
      delete certData.progress[entry.qid].dirtySince
    }
    repo.write(data)

    const syncData = readAccountSyncData()
    syncData.byUser[userId] = {
      ...syncData.byUser[userId],
      [cert]: { revision, lastSyncedAt: Date.now() },
    }
    writeAccountSyncData(syncData)
  }

  static applyImportedAccountSync(
    userId: string,
    cert: CertCode,
    revision: number,
    accepted: QuestionProgress[],
    uploaded: QuestionProgress[] = accepted,
  ): void {
    const repo = new LocalProgressRepository('account')
    const data = repo.read()
    const certData = repo.certData(data, cert)
    const uploadedByQid = new Map(uploaded.map((entry) => [entry.qid, entry]))
    for (const entry of accepted) {
      const uploadedEntry = uploadedByQid.get(entry.qid)
      if (
        uploadedEntry &&
        certData.progress[entry.qid] &&
        certData.progress[entry.qid].dirtySince !== undefined &&
        !sameCanonicalProgress(certData.progress[entry.qid], uploadedEntry)
      ) {
        continue
      }
      certData.progress[entry.qid] = normalizeProgress(
        entry.qid,
        entry as unknown as Record<string, unknown>,
      )
      delete certData.progress[entry.qid].dirtySince
    }
    repo.write(data)

    const syncData = readAccountSyncData()
    syncData.byUser[userId] = {
      ...syncData.byUser[userId],
      [cert]: { revision, lastSyncedAt: Date.now() },
    }
    writeAccountSyncData(syncData)
  }

  static prepareAccountOwner(userId: string): boolean {
    if (typeof window === 'undefined') return false
    const ownerId = window.localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)
    if (ownerId !== userId) {
      LocalProgressRepository.clearScope('account')
      window.localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, userId)
      return true
    }
    window.localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, userId)
    return false
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

  private markDirty(progress: QuestionProgress): void {
    if (this.scope === 'account' && progress.dirtySince === undefined) {
      progress.dirtySince = Date.now()
    }
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
    this.markDirty(progress)

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
    this.markDirty(progress)

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

export function clearProgressScope(scope: ProgressScope): void {
  LocalProgressRepository.clearScope(scope)
}

export const progressRepo: LocalProgressRepository = new LocalProgressRepository()
