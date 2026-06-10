import type { CertCode, Letter, ProgressScope, QuestionProgress } from '@/data/types'
import { isReadyCertCode, READY_CERTS } from '@/lib/cert-catalog'

const PROGRESS_KEYS: Record<ProgressScope, string> = {
  anonymous: 'ace-aws/progress/v1',
  account: 'ace-aws/account-progress/v1',
}

const ACCOUNT_PROGRESS_OWNER_KEY = 'ace-aws/account-owner/v1'
const ACCOUNT_PROGRESS_SYNC_KEY = 'ace-aws/account-progress-sync/v1'
const ACCOUNT_PROGRESS_CLIENT_ID_KEY = 'ace-aws/account-progress-client-id/v1'

interface StoredQuestionProgress extends QuestionProgress {
  dirtySince?: number
  dedupeKeys?: Record<string, true>
}

export interface DailyQuestionStats {
  date: string
  correctCount: number
  wrongCount: number
  updatedAt: number
}

type SourceDailyQuestionStats = DailyQuestionStats & { sourceId?: string }

interface StoredDailyQuestionStats extends DailyQuestionStats {
  dirtySince?: number
  sourceBuckets?: Record<string, { correctCount: number; wrongCount: number; updatedAt: number }>
  dedupeKeys?: Record<string, true>
}

interface RecordAnswerOptions {
  updateDailyStats?: boolean
  answeredAt?: number
  progressDedupeKey?: string
  dailyStatsDedupeKey?: string
}

export interface BrowserQuestionProgressModule {
  getScope?(): ProgressScope
  getProgress(qid: number, cert: CertCode): QuestionProgress | null
  recordAnswer(
    qid: number,
    picks: Letter[],
    correct: boolean,
    cert: CertCode,
    options?: RecordAnswerOptions,
  ): void
  listProgress(cert: CertCode): QuestionProgress[]
  listAnswered(cert: CertCode): QuestionProgress[]
  listWrong(cert: CertCode): QuestionProgress[]

  toggleBookmark(qid: number, cert: CertCode): void
  isBookmarked(qid: number, cert: CertCode): boolean
  listBookmarks(cert: CertCode): number[]

  getStats(cert: CertCode): { answered: number; correct: number; total: number }
  listDailyStats(cert: CertCode): DailyQuestionStats[]
}

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
  progress: Record<number, StoredQuestionProgress>
  dailyStats: Record<string, StoredDailyQuestionStats>
}

const EMPTY_CERT_PROGRESS: CertProgressData = { progress: {}, dailyStats: {} }
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

function emptyCertProgress(): CertProgressData {
  return { progress: {}, dailyStats: {} }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createProgress(qid: number): StoredQuestionProgress {
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

function toQuestionProgress(progress: QuestionProgress): QuestionProgress {
  return {
    qid: progress.qid,
    correctCount: progress.correctCount,
    wrongCount: progress.wrongCount,
    lastPicks: [...progress.lastPicks],
    lastCorrect: progress.lastCorrect,
    lastAnsweredAt: progress.lastAnsweredAt,
    bookmarked: progress.bookmarked,
    bookmarkUpdatedAt: progress.bookmarkUpdatedAt,
  }
}

function toDailyQuestionStats(stats: DailyQuestionStats): DailyQuestionStats {
  return {
    date: stats.date,
    correctCount: stats.correctCount,
    wrongCount: stats.wrongCount,
    updatedAt: stats.updatedAt,
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

function sameDailyStats(a: DailyQuestionStats | undefined, b: DailyQuestionStats): boolean {
  return (
    a !== undefined &&
    a.date === b.date &&
    a.correctCount === b.correctCount &&
    a.wrongCount === b.wrongCount &&
    a.updatedAt === b.updatedAt
  )
}

function uploadedDailyStatsForSource(
  stats: StoredDailyQuestionStats,
  sourceId: string,
): DailyQuestionStats {
  const bucket = stats.sourceBuckets?.[sourceId]
  return {
    date: stats.date,
    correctCount: bucket?.correctCount ?? stats.correctCount,
    wrongCount: bucket?.wrongCount ?? stats.wrongCount,
    updatedAt: bucket?.updatedAt ?? stats.updatedAt,
  }
}

function dailyStatsSourceKey(date: string, sourceId: string): string {
  return `${date}\u0000${sourceId}`
}

function uploadedDailyStatsMapForSource(
  entries: SourceDailyQuestionStats[],
  defaultSourceId: string,
): Map<string, SourceDailyQuestionStats> {
  return new Map(
    entries.map((entry) => [
      dailyStatsSourceKey(entry.date, entry.sourceId ?? defaultSourceId),
      entry,
    ]),
  )
}

function mergeDirtyDailyStatsSourceBucket(
  dailyStats: Record<string, StoredDailyQuestionStats>,
  entry: StoredDailyQuestionStats,
  sourceId: string,
): void {
  const bucket = entry.sourceBuckets?.[sourceId] ?? {
    correctCount: entry.correctCount,
    wrongCount: entry.wrongCount,
    updatedAt: entry.updatedAt,
  }
  const existing = dailyStats[entry.date]
  if (!existing) {
    dailyStats[entry.date] = {
      date: entry.date,
      correctCount: bucket.correctCount,
      wrongCount: bucket.wrongCount,
      updatedAt: bucket.updatedAt,
      dirtySince: entry.dirtySince,
      sourceBuckets: { [sourceId]: { ...bucket } },
      ...(entry.dedupeKeys ? { dedupeKeys: { ...entry.dedupeKeys } } : {}),
    }
    return
  }

  const previousBucket = existing.sourceBuckets?.[sourceId]
  if (previousBucket && bucket.updatedAt < previousBucket.updatedAt) return
  existing.sourceBuckets ??= {}
  existing.sourceBuckets[sourceId] = { ...bucket }
  existing.correctCount += bucket.correctCount - (previousBucket?.correctCount ?? 0)
  existing.wrongCount += bucket.wrongCount - (previousBucket?.wrongCount ?? 0)
  existing.updatedAt = Math.max(existing.updatedAt, bucket.updatedAt)
  existing.dirtySince = entry.dirtySince
  if (entry.dedupeKeys) existing.dedupeKeys = { ...existing.dedupeKeys, ...entry.dedupeKeys }
}

function attachSourceBuckets(
  dailyStats: Record<string, StoredDailyQuestionStats>,
  uploadedDailyStats: SourceDailyQuestionStats[],
): void {
  for (const entry of uploadedDailyStats) {
    if (!entry.sourceId) continue
    const stats = dailyStats[entry.date]
    if (!stats) continue
    stats.sourceBuckets ??= {}
    const existing = stats.sourceBuckets[entry.sourceId]
    if (existing && entry.updatedAt < existing.updatedAt) continue
    stats.sourceBuckets[entry.sourceId] = {
      correctCount: entry.correctCount,
      wrongCount: entry.wrongCount,
      updatedAt: entry.updatedAt,
    }
  }
}

function dailyStatsMapFromSnapshot(
  entries: SourceDailyQuestionStats[],
): Record<string, StoredDailyQuestionStats> {
  const dailyStats: Record<string, StoredDailyQuestionStats> = {}
  for (const entry of entries) {
    const existing = dailyStats[entry.date]
    if (!existing) {
      dailyStats[entry.date] = toDailyQuestionStats(entry)
    } else {
      existing.correctCount += entry.correctCount
      existing.wrongCount += entry.wrongCount
      existing.updatedAt = Math.max(existing.updatedAt, entry.updatedAt)
    }
  }
  attachSourceBuckets(dailyStats, entries)
  return dailyStats
}

function preserveDailyStatsDedupeKeys(
  dailyStats: Record<string, StoredDailyQuestionStats>,
  previousDailyStats: Record<string, StoredDailyQuestionStats>,
): void {
  for (const [date, previous] of Object.entries(previousDailyStats)) {
    if (!previous.dedupeKeys) continue
    const current = dailyStats[date]
    if (!current) continue
    current.dedupeKeys = { ...previous.dedupeKeys, ...current.dedupeKeys }
  }
}

function normalizeProgress(qid: number, value: Record<string, unknown>): StoredQuestionProgress {
  const dedupeKeys =
    value.dedupeKeys && typeof value.dedupeKeys === 'object'
      ? Object.fromEntries(
          Object.entries(value.dedupeKeys).filter((entry): entry is [string, true] => {
            const [key, applied] = entry
            return key.length > 0 && applied === true
          }),
        )
      : undefined
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
    ...(dedupeKeys && Object.keys(dedupeKeys).length > 0 ? { dedupeKeys } : {}),
  }
}

function normalizeProgressMap(value: unknown): Record<number, StoredQuestionProgress> {
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

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function normalizeDailyStatsMap(value: unknown): Record<string, StoredDailyQuestionStats> {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([date, stats]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !stats || typeof stats !== 'object') {
          return null
        }
        const { correctCount, wrongCount, updatedAt, sourceBuckets, dedupeKeys } = stats as Record<
          string,
          unknown
        >
        return [
          date,
          {
            date,
            correctCount: normalizeNonNegativeNumber(correctCount),
            wrongCount: normalizeNonNegativeNumber(wrongCount),
            updatedAt: normalizeNonNegativeNumber(updatedAt),
            ...(sourceBuckets && typeof sourceBuckets === 'object'
              ? {
                  sourceBuckets: Object.fromEntries(
                    Object.entries(sourceBuckets)
                      .map(([sourceId, bucket]) => {
                        if (!bucket || typeof bucket !== 'object') return null
                        const bucketRecord = bucket as Record<string, unknown>
                        if (
                          typeof bucketRecord.correctCount !== 'number' ||
                          typeof bucketRecord.wrongCount !== 'number' ||
                          typeof bucketRecord.updatedAt !== 'number'
                        ) {
                          return null
                        }
                        return [
                          sourceId,
                          {
                            correctCount: normalizeNonNegativeNumber(bucketRecord.correctCount),
                            wrongCount: normalizeNonNegativeNumber(bucketRecord.wrongCount),
                            updatedAt: normalizeNonNegativeNumber(bucketRecord.updatedAt),
                          },
                        ]
                      })
                      .filter(
                        (
                          entry,
                        ): entry is [
                          string,
                          NonNullable<StoredDailyQuestionStats['sourceBuckets']>[string],
                        ] => entry !== null,
                      ),
                  ),
                }
              : {}),
            ...(dedupeKeys && typeof dedupeKeys === 'object'
              ? {
                  dedupeKeys: Object.fromEntries(
                    Object.entries(dedupeKeys).filter((entry): entry is [string, true] => {
                      return entry[1] === true
                    }),
                  ),
                }
              : {}),
            ...(typeof (stats as Record<string, unknown>).dirtySince === 'number'
              ? { dirtySince: (stats as Record<string, unknown>).dirtySince as number }
              : {}),
          },
        ] as [string, StoredDailyQuestionStats]
      })
      .filter((entry): entry is [string, StoredDailyQuestionStats] => entry !== null),
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
          {
            progress: normalizeProgressMap((certData as { progress: unknown }).progress),
            dailyStats: normalizeDailyStatsMap((certData as { dailyStats?: unknown }).dailyStats),
          },
        ]
      }),
    ) as ProgressData['byCert'],
  }
}

export class BrowserProgressModule implements BrowserQuestionProgressModule {
  private readonly storageKey: string
  private readonly scope: ProgressScope

  constructor(scope: ProgressScope = 'anonymous') {
    this.scope = scope
    this.storageKey = PROGRESS_KEYS[scope]
  }

  getScope(): ProgressScope {
    return this.scope
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
    dailyStats: SourceDailyQuestionStats[] = [],
  ): void {
    const repo = new BrowserProgressModule('account')
    const data = repo.read()
    const nextDailyStats = dailyStatsMapFromSnapshot(dailyStats)
    preserveDailyStatsDedupeKeys(nextDailyStats, data.byCert[cert]?.dailyStats ?? {})
    data.byCert[cert] = {
      progress: Object.fromEntries(
        progress.map((entry) => [
          entry.qid,
          normalizeProgress(entry.qid, entry as unknown as Record<string, unknown>),
        ]),
      ),
      dailyStats: nextDailyStats,
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
    dailyStats: SourceDailyQuestionStats[] = [],
    uploaded?: QuestionProgress[],
    uploadedDailyStats: SourceDailyQuestionStats[] = [],
    preserveUploaded = false,
  ): void {
    uploaded ??= []
    const uploadedByQid = new Map(uploaded.map((entry) => [entry.qid, entry]))
    const laterDirty = BrowserProgressModule.listStoredDirtyAccountProgress(cert).filter(
      (current) => {
        const uploadedEntry = uploadedByQid.get(current.qid)
        return preserveUploaded || !uploadedEntry || !sameCanonicalProgress(current, uploadedEntry)
      },
    )
    const dailyStatsSourceId = BrowserProgressModule.accountClientSourceId()
    const uploadedDailyBySource = uploadedDailyStatsMapForSource(
      uploadedDailyStats,
      dailyStatsSourceId,
    )
    const laterDirtyDailyStats = Object.values(
      new BrowserProgressModule('account').readCert(cert).dailyStats,
    ).filter((current) => {
      if (current.dirtySince === undefined) return false
      const uploadedEntry = uploadedDailyBySource.get(
        dailyStatsSourceKey(current.date, dailyStatsSourceId),
      )
      return (
        preserveUploaded ||
        !uploadedEntry ||
        !sameDailyStats(uploadedDailyStatsForSource(current, dailyStatsSourceId), uploadedEntry)
      )
    })

    BrowserProgressModule.replaceAccountCertFromSnapshot(
      userId,
      cert,
      revision,
      progress,
      dailyStats,
    )

    if (laterDirty.length === 0 && laterDirtyDailyStats.length === 0) return
    const repo = new BrowserProgressModule('account')
    const data = repo.read()
    const certData = repo.certData(data, cert)
    for (const entry of laterDirty) {
      certData.progress[entry.qid] = entry
    }
    for (const entry of laterDirtyDailyStats) {
      mergeDirtyDailyStatsSourceBucket(certData.dailyStats, entry, dailyStatsSourceId)
    }
    repo.write(data)
  }

  static clearAccountCert(userId: string, cert: CertCode): void {
    const repo = new BrowserProgressModule('account')
    const data = repo.read()
    delete data.byCert[cert]
    repo.write(data)

    BrowserProgressModule.clearAccountSyncBaseline(userId, cert)
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
    return BrowserProgressModule.listStoredDirtyAccountProgress(cert).map(toQuestionProgress)
  }

  static listDirtyAccountDailyStats(
    cert: CertCode,
  ): Array<DailyQuestionStats & { sourceId: string }> {
    const sourceId = BrowserProgressModule.accountClientSourceId()
    return Object.values(new BrowserProgressModule('account').readCert(cert).dailyStats)
      .filter((stats) => stats.dirtySince !== undefined)
      .map((stats) => {
        const bucket = stats.sourceBuckets?.[sourceId]
        return {
          date: stats.date,
          sourceId,
          correctCount: bucket?.correctCount ?? stats.correctCount,
          wrongCount: bucket?.wrongCount ?? stats.wrongCount,
          updatedAt: bucket?.updatedAt ?? stats.updatedAt,
        }
      })
  }

  private static accountClientSourceId(): string {
    if (typeof window === 'undefined') return 'client:server'
    const existing = window.localStorage.getItem(ACCOUNT_PROGRESS_CLIENT_ID_KEY)
    if (existing) return `client:${existing}`
    const id = crypto.randomUUID()
    window.localStorage.setItem(ACCOUNT_PROGRESS_CLIENT_ID_KEY, id)
    return `client:${id}`
  }

  private static listStoredDirtyAccountProgress(cert: CertCode): StoredQuestionProgress[] {
    return Object.values(new BrowserProgressModule('account').readCert(cert).progress).filter(
      (progress) => progress.dirtySince !== undefined && hasProgressContent(progress),
    )
  }

  static summarizeAnonymousImport(): AnonymousImportSummary {
    const repo = new BrowserProgressModule('anonymous')
    const certs: CertCode[] = []
    let recordCount = 0

    for (const cert of READY_CERTS) {
      const records = repo.listProgress(cert).filter(hasProgressContent)
      const dailyStats = repo.listDailyStats(cert)
      if (records.length === 0 && dailyStats.length === 0) continue
      certs.push(cert)
      recordCount += records.length + dailyStats.length
    }

    return { certs, certCount: certs.length, recordCount }
  }

  static listAnonymousImportProgress(cert: CertCode): QuestionProgress[] {
    return new BrowserProgressModule('anonymous').listProgress(cert).filter(hasProgressContent)
  }

  static listAnonymousImportDailyStats(
    cert: CertCode,
  ): Array<DailyQuestionStats & { sourceId: string }> {
    const sourceId = BrowserProgressModule.anonymousImportSourceId()
    return new BrowserProgressModule('anonymous')
      .listDailyStats(cert)
      .map((stats) => ({ ...stats, sourceId }))
  }

  private static anonymousImportSourceId(): string {
    if (typeof window === 'undefined') return 'anon-import:server'
    const existing = window.localStorage.getItem(ACCOUNT_PROGRESS_CLIENT_ID_KEY)
    if (existing) return `anon-import:${existing}`
    const id = crypto.randomUUID()
    window.localStorage.setItem(ACCOUNT_PROGRESS_CLIENT_ID_KEY, id)
    return `anon-import:${id}`
  }

  static clearAnonymousImportCert(cert: CertCode): void {
    if (typeof window === 'undefined') return
    const repo = new BrowserProgressModule('anonymous')
    const data = repo.read()
    delete data.byCert[cert]
    repo.write(data)
  }

  static applyAcceptedAccountSync(
    userId: string,
    cert: CertCode,
    revision: number,
    accepted: QuestionProgress[],
    uploaded: QuestionProgress[] = accepted,
    dailyStats: DailyQuestionStats[] = [],
    uploadedDailyStats: SourceDailyQuestionStats[] = dailyStats,
  ): void {
    const repo = new BrowserProgressModule('account')
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
    const dailyStatsSourceId = BrowserProgressModule.accountClientSourceId()
    const uploadedDailyBySource = uploadedDailyStatsMapForSource(
      uploadedDailyStats,
      dailyStatsSourceId,
    )
    const laterDirtyDailyStats = Object.values(certData.dailyStats).filter((current) => {
      if (current.dirtySince === undefined) return false
      const uploadedEntry = uploadedDailyBySource.get(
        dailyStatsSourceKey(current.date, dailyStatsSourceId),
      )
      return (
        !uploadedEntry ||
        !sameDailyStats(uploadedDailyStatsForSource(current, dailyStatsSourceId), uploadedEntry)
      )
    })
    const nextDailyStats = dailyStatsMapFromSnapshot(dailyStats)
    preserveDailyStatsDedupeKeys(nextDailyStats, certData.dailyStats)
    certData.dailyStats = nextDailyStats
    attachSourceBuckets(certData.dailyStats, uploadedDailyStats)
    for (const entry of laterDirtyDailyStats) {
      mergeDirtyDailyStatsSourceBucket(certData.dailyStats, entry, dailyStatsSourceId)
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
    dailyStats: DailyQuestionStats[] = [],
    uploadedDailyStats: SourceDailyQuestionStats[] = dailyStats,
  ): void {
    const repo = new BrowserProgressModule('account')
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
    const dailyStatsSourceId = BrowserProgressModule.accountClientSourceId()
    const uploadedDailyBySource = uploadedDailyStatsMapForSource(
      uploadedDailyStats,
      dailyStatsSourceId,
    )
    const laterDirtyDailyStats = Object.values(certData.dailyStats).filter((current) => {
      if (current.dirtySince === undefined) return false
      const uploadedEntry = uploadedDailyBySource.get(
        dailyStatsSourceKey(current.date, dailyStatsSourceId),
      )
      return (
        !uploadedEntry ||
        !sameDailyStats(uploadedDailyStatsForSource(current, dailyStatsSourceId), uploadedEntry)
      )
    })
    const nextDailyStats = dailyStatsMapFromSnapshot(dailyStats)
    preserveDailyStatsDedupeKeys(nextDailyStats, certData.dailyStats)
    certData.dailyStats = nextDailyStats
    attachSourceBuckets(certData.dailyStats, uploadedDailyStats)
    for (const entry of laterDirtyDailyStats) {
      mergeDirtyDailyStatsSourceBucket(certData.dailyStats, entry, dailyStatsSourceId)
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
      BrowserProgressModule.clearScope('account')
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

  private progressFor(certData: CertProgressData, qid: number): StoredQuestionProgress {
    const existing = certData.progress[qid]
    if (existing) return existing
    const next = createProgress(qid)
    certData.progress[qid] = next
    return next
  }

  private markDirty(progress: StoredQuestionProgress): void {
    if (this.scope === 'account' && progress.dirtySince === undefined) {
      progress.dirtySince = Date.now()
    }
  }

  private markDailyStatsDirty(stats: StoredDailyQuestionStats): void {
    if (this.scope === 'account' && stats.dirtySince === undefined) {
      stats.dirtySince = Date.now()
    }
  }

  private recordDailyStatsSourceBucket(
    stats: StoredDailyQuestionStats,
    correct: boolean,
    now: number,
  ): void {
    if (this.scope !== 'account') return
    const sourceId = BrowserProgressModule.accountClientSourceId()
    stats.sourceBuckets ??= {}
    const bucket = stats.sourceBuckets[sourceId] ?? {
      correctCount: 0,
      wrongCount: 0,
      updatedAt: 0,
    }
    if (correct) bucket.correctCount += 1
    else bucket.wrongCount += 1
    bucket.updatedAt = now
    stats.sourceBuckets[sourceId] = bucket
  }

  private dailyStatsFor(certData: CertProgressData, date: string): StoredDailyQuestionStats {
    const existing = certData.dailyStats[date]
    if (existing) return existing
    const next = { date, correctCount: 0, wrongCount: 0, updatedAt: 0 }
    certData.dailyStats[date] = next
    return next
  }

  getProgress(qid: number, cert: CertCode): QuestionProgress | null {
    const progress = this.readCert(cert).progress[qid]
    return progress ? toQuestionProgress(progress) : null
  }

  recordAnswer(
    qid: number,
    picks: Letter[],
    correct: boolean,
    cert: CertCode,
    options: RecordAnswerOptions = {},
  ): void {
    const data = this.read()
    const certData = this.certData(data, cert)
    const progress = this.progressFor(certData, qid)
    const now = options.answeredAt ?? Date.now()
    const progressDedupeKey = options.progressDedupeKey
    const dailyStatsDate = localDateKey(new Date(now))
    const existingDailyStats = certData.dailyStats[dailyStatsDate]

    if (
      progressDedupeKey &&
      (progress.dedupeKeys?.[progressDedupeKey] ||
        existingDailyStats?.dedupeKeys?.[progressDedupeKey])
    ) {
      return
    }

    if (correct) progress.correctCount += 1
    else progress.wrongCount += 1

    progress.lastPicks = [...picks].sort() as Letter[]
    progress.lastCorrect = correct
    progress.lastAnsweredAt = now
    if (progressDedupeKey) {
      progress.dedupeKeys ??= {}
      progress.dedupeKeys[progressDedupeKey] = true
    }
    this.markDirty(progress)

    if (options.updateDailyStats !== false) {
      const dailyStats = this.dailyStatsFor(certData, dailyStatsDate)
      const dedupeKey = options.dailyStatsDedupeKey
      if (!dedupeKey || !dailyStats.dedupeKeys?.[dedupeKey]) {
        if (correct) dailyStats.correctCount += 1
        else dailyStats.wrongCount += 1
        dailyStats.updatedAt = now
        this.recordDailyStatsSourceBucket(dailyStats, correct, now)
        if (dedupeKey) {
          dailyStats.dedupeKeys ??= {}
          dailyStats.dedupeKeys[dedupeKey] = true
        }
        this.markDailyStatsDirty(dailyStats)
      }
    }

    this.write(data)
  }

  listProgress(cert: CertCode): QuestionProgress[] {
    return Object.values(this.readCert(cert).progress).map(toQuestionProgress)
  }

  listAnswered(cert: CertCode): QuestionProgress[] {
    return this.listProgress(cert).filter((progress) => progress.lastAnsweredAt !== null)
  }

  listWrong(cert: CertCode): QuestionProgress[] {
    return this.listProgress(cert).filter((progress) => progress.wrongCount > 0)
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
      .map((entry) => entry.qid)
  }

  getStats(cert: CertCode): { answered: number; correct: number; total: number } {
    const answered = this.listAnswered(cert)
    return {
      answered: answered.length,
      correct: answered.filter((progress) => progress.lastCorrect === true).length,
      total: 0,
    }
  }

  listDailyStats(cert: CertCode): DailyQuestionStats[] {
    return Object.values(this.readCert(cert).dailyStats)
      .map(toDailyQuestionStats)
      .sort((a, b) => a.date.localeCompare(b.date))
  }
}

export function clearProgressScope(scope: ProgressScope): void {
  BrowserProgressModule.clearScope(scope)
}

export const browserProgress: BrowserProgressModule = new BrowserProgressModule()
