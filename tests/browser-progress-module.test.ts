import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionProgress } from '../src/data/types'
import {
  dismissAnonymousImport,
  hasDismissedAnonymousImport,
} from '../src/lib/anonymous-import-dismissal'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'

const CERT = 'DVA-C02'
const ANONYMOUS_PROGRESS_KEY = 'ace-aws/progress/v1'
const ACCOUNT_PROGRESS_OWNER_KEY = 'ace-aws/account-owner/v1'
const ACCOUNT_PROGRESS_SYNC_KEY = 'ace-aws/account-progress-sync/v1'

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

describe('BrowserProgressModule', () => {
  let progress: BrowserProgressModule

  beforeEach(() => {
    localStorage.clear()
    progress = new BrowserProgressModule('anonymous')
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('progress records', () => {
    it('returns null when no progress exists for a question', () => {
      expect(progress.getProgress(1, CERT)).toBeNull()
    })

    it('creates progress with sorted last picks and a correct count', () => {
      progress.recordAnswer(1, ['D', 'B'], true, CERT)

      expect(progress.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_000,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      })
    })

    it('increments counts across repeat attempts and keeps the latest answer state', () => {
      progress.recordAnswer(1, ['A'], false, CERT)
      vi.setSystemTime(1_700_000_000_500)
      progress.recordAnswer(1, ['C'], true, CERT)

      expect(progress.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_500,
      })
    })

    it('lists answered records and excludes bookmark-only records', () => {
      progress.recordAnswer(1, ['A'], true, CERT)
      progress.toggleBookmark(2, CERT)

      expect(progress.listAnswered(CERT).map((p) => p.qid)).toEqual([1])
      expect(
        progress
          .listProgress(CERT)
          .map((p) => p.qid)
          .sort((a, b) => a - b),
      ).toEqual([1, 2])
    })

    it('lists wrong records by historical wrong attempts', () => {
      progress.recordAnswer(1, ['A'], false, CERT)
      progress.recordAnswer(2, ['B'], false, CERT)
      progress.recordAnswer(2, ['C'], true, CERT)

      const wrong = progress.listWrong(CERT)

      expect(wrong.map((entry) => entry.qid).sort((a, b) => a - b)).toEqual([1, 2])
      expect(wrong.find((entry) => entry.qid === 2)).toMatchObject({
        lastCorrect: true,
        wrongCount: 1,
      })
    })

    it('isolates progress by cert', () => {
      progress.recordAnswer(1, ['A'], true, 'DVA-C02')
      progress.recordAnswer(1, ['B'], false, 'CLF-C02')

      expect(progress.getProgress(1, 'DVA-C02')?.lastPicks).toEqual(['A'])
      expect(progress.getProgress(1, 'CLF-C02')?.lastPicks).toEqual(['B'])
      expect(progress.listWrong('DVA-C02')).toHaveLength(0)
      expect(progress.listWrong('CLF-C02')).toHaveLength(1)
    })
  })

  describe('bookmarks', () => {
    it('creates a bookmark-only progress record', () => {
      progress.toggleBookmark(5, CERT)

      expect(progress.getProgress(5, CERT)).toMatchObject({
        qid: 5,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_000_000,
      })
    })

    it('keeps a tombstone when an unanswered bookmark is removed', () => {
      progress.toggleBookmark(5, CERT)
      vi.setSystemTime(1_700_000_001_000)
      progress.toggleBookmark(5, CERT)

      expect(progress.isBookmarked(5, CERT)).toBe(false)
      expect(progress.listBookmarks(CERT)).toEqual([])
      expect(progress.getProgress(5, CERT)).toMatchObject({
        qid: 5,
        bookmarked: false,
        bookmarkUpdatedAt: 1_700_000_001_000,
        lastAnsweredAt: null,
      })
    })

    it('preserves answer counts when toggling bookmarks', () => {
      progress.recordAnswer(3, ['A'], false, CERT)
      progress.toggleBookmark(3, CERT)
      progress.toggleBookmark(3, CERT)

      expect(progress.getProgress(3, CERT)).toMatchObject({
        wrongCount: 1,
        lastCorrect: false,
        bookmarked: false,
      })
    })
  })

  describe('stats', () => {
    it('returns zeros initially', () => {
      expect(progress.getStats(CERT)).toEqual({ answered: 0, correct: 0, total: 0 })
    })

    it('counts answered questions and latest-correct questions', () => {
      progress.recordAnswer(1, ['A'], true, CERT)
      progress.recordAnswer(2, ['B'], false, CERT)
      progress.recordAnswer(3, ['C'], false, CERT)
      progress.recordAnswer(3, ['D'], true, CERT)
      progress.toggleBookmark(4, CERT)

      expect(progress.getStats(CERT)).toEqual({ answered: 3, correct: 2, total: 0 })
    })

    it('tracks daily question stats by local date and answer attempt', () => {
      progress.recordAnswer(1, ['D', 'B'], true, CERT)
      progress.recordAnswer(1, ['A'], false, CERT)

      expect(progress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 1,
          wrongCount: 1,
          updatedAt: 1_700_000_000_000,
        },
      ])
    })

    it('does not update daily question stats for bookmark-only changes', () => {
      progress.toggleBookmark(1, CERT)
      progress.toggleBookmark(1, CERT)
      progress.recordAnswer(2, ['A'], true, CERT)
      progress.toggleBookmark(2, CERT)

      expect(progress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 1,
          wrongCount: 0,
          updatedAt: 1_700_000_000_000,
        },
      ])
    })

    it('loads older persisted progress without daily question stats as empty stats', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            [CERT]: {
              progress: {
                1: {
                  qid: 1,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['A'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_000_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
          },
        }),
      )

      expect(progress.listDailyStats(CERT)).toEqual([])
    })

    it('normalizes damaged negative daily question stats to zero', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            [CERT]: {
              progress: {},
              dailyStats: {
                '2026-01-02': {
                  date: '2026-01-02',
                  correctCount: -2,
                  wrongCount: -1,
                  updatedAt: -100,
                },
              },
            },
          },
        }),
      )

      expect(progress.listDailyStats(CERT)).toEqual([
        {
          date: '2026-01-02',
          correctCount: 0,
          wrongCount: 0,
          updatedAt: 0,
        },
      ])
    })

    it('isolates daily question stats by cert and progress scope', () => {
      progress.recordAnswer(1, ['A'], true, 'DVA-C02')
      progress.recordAnswer(1, ['A'], false, 'CLF-C02')

      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, 'DVA-C02')

      expect(progress.listDailyStats('DVA-C02')[0]).toMatchObject({
        correctCount: 1,
        wrongCount: 0,
      })
      expect(progress.listDailyStats('CLF-C02')[0]).toMatchObject({
        correctCount: 0,
        wrongCount: 1,
      })
      expect(accountProgress.listDailyStats('DVA-C02')[0]).toMatchObject({
        correctCount: 0,
        wrongCount: 1,
      })
    })
  })

  describe('storage scopes', () => {
    it('isolates anonymous and account progress keys', () => {
      progress.recordAnswer(1, ['A'], true, CERT)

      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['B'], false, CERT)

      expect(progress.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(accountProgress.getProgress(1, CERT)?.lastPicks).toEqual(['B'])
    })

    it('tracks account dirty writes without exposing sync metadata to question progress callers', () => {
      progress.recordAnswer(1, ['A'], true, CERT)

      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['B'], false, CERT)
      accountProgress.toggleBookmark(2, CERT)

      expect(progress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(accountProgress.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        lastPicks: ['B'],
      })
      expect(accountProgress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(accountProgress.getProgress(2, CERT)).toMatchObject({
        qid: 2,
        bookmarked: true,
      })
      expect(accountProgress.getProgress(2, CERT)).not.toHaveProperty('dirtySince')
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([1, 2])
    })

    it('lists dirty account daily question stats with a client source id', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], true, CERT)
      accountProgress.recordAnswer(2, ['B'], false, CERT)

      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: expect.stringMatching(/^client:/),
          correctCount: 1,
          wrongCount: 1,
          updatedAt: 1_700_000_000_000,
        },
      ])
    })

    it('keeps account progress dirty across repeated account writes', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountProgress.recordAnswer(1, ['C'], true, CERT)
      accountProgress.toggleBookmark(1, CERT)

      expect(accountProgress.getProgress(1, CERT)).toMatchObject({
        lastPicks: ['C'],
        bookmarked: true,
      })
      expect(accountProgress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([1])
    })

    it('lists only dirty non-empty account progress for upload', () => {
      localStorage.setItem(
        'ace-aws/account-progress/v1',
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {
                  qid: 1,
                  correctCount: 0,
                  wrongCount: 0,
                  lastPicks: [],
                  lastCorrect: null,
                  lastAnsweredAt: null,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                  dirtySince: 1_700_000_000_000,
                },
                2: {
                  qid: 2,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['A'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_001_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                  dirtySince: 1_700_000_000_500,
                },
                3: {
                  qid: 3,
                  correctCount: 0,
                  wrongCount: 0,
                  lastPicks: [],
                  lastCorrect: null,
                  lastAnsweredAt: null,
                  bookmarked: true,
                  bookmarkUpdatedAt: 1_700_000_002_000,
                  dirtySince: 1_700_000_000_700,
                },
                4: {
                  qid: 4,
                  correctCount: 0,
                  wrongCount: 0,
                  lastPicks: [],
                  lastCorrect: null,
                  lastAnsweredAt: null,
                  bookmarked: false,
                  bookmarkUpdatedAt: 1_700_000_003_000,
                  dirtySince: 1_700_000_000_900,
                },
              },
            },
          },
        }),
      )

      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([
        2, 3, 4,
      ])
    })

    it('applies accepted account sync records as canonical progress and clears their dirty state', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      accountProgress.recordAnswer(2, ['B'], false, CERT)
      const uploaded = BrowserProgressModule.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyAcceptedAccountSync(
        'user-1',
        CERT,
        9,
        [
          {
            qid: 1,
            correctCount: 3,
            wrongCount: 1,
            lastPicks: ['D', 'B'],
            lastCorrect: true,
            lastAnsweredAt: 1_700_000_010_000,
            bookmarked: true,
            bookmarkUpdatedAt: 1_700_000_011_000,
          },
        ],
        uploaded,
      )

      expect(accountProgress.getProgress(1, CERT)).toEqual({
        qid: 1,
        correctCount: 3,
        wrongCount: 1,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_010_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_011_000,
      })
      expect(accountProgress.getProgress(2, CERT)).not.toHaveProperty('dirtySince')
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([2])
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 9,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('keeps newer local account changes dirty when an older accepted sync response returns', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploaded = BrowserProgressModule.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountProgress.recordAnswer(1, ['C'], true, CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyAcceptedAccountSync(
        'user-1',
        CERT,
        9,
        [
          {
            qid: 1,
            correctCount: 0,
            wrongCount: 1,
            lastPicks: ['A'],
            lastCorrect: false,
            lastAnsweredAt: 1_700_000_000_000,
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        uploaded,
      )

      expect(accountProgress.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_005_000,
      })
      expect(accountProgress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([1])
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 9,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('merges accepted daily stats by source while preserving newer local dirty buckets', () => {
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'this')
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploadedDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountProgress.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyAcceptedAccountSync(
        'user-1',
        CERT,
        9,
        [],
        [],
        [
          {
            date: localDateKey(1_700_000_000_000),
            sourceId: 'anon-import:other',
            correctCount: 2,
            wrongCount: 0,
            updatedAt: 1_700_000_001_000,
          },
          ...uploadedDailyStats,
        ],
        uploadedDailyStats,
      )

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 3,
          wrongCount: 1,
          updatedAt: 1_700_000_005_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:this',
          correctCount: 1,
          wrongCount: 1,
          updatedAt: 1_700_000_005_000,
        },
      ])
    })

    it('keeps newer server source buckets after an accepted stale daily stats retry', () => {
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'this')
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploadedDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_020_000)
      const serverDailyStats = [
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:this',
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_010_000,
        },
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'anon-import:other',
          correctCount: 1,
          wrongCount: 0,
          updatedAt: 1_700_000_005_000,
        },
      ]

      BrowserProgressModule.applyAcceptedAccountSync(
        'user-1',
        CERT,
        9,
        [],
        [],
        serverDailyStats,
        uploadedDailyStats,
      )

      accountProgress.recordAnswer(2, ['B'], true, CERT)

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 7,
          wrongCount: 2,
          updatedAt: 1_700_000_020_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:this',
          correctCount: 6,
          wrongCount: 2,
          updatedAt: 1_700_000_020_000,
        },
      ])
    })

    it('does not let accepted sync merge an older dirty source bucket over a newer server bucket', () => {
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'this')
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploadedDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_001_500)
      accountProgress.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_003_000)
      const serverDailyStats = [
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:this',
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_002_000,
        },
      ]

      BrowserProgressModule.applyAcceptedAccountSync(
        'user-1',
        CERT,
        9,
        [],
        [],
        serverDailyStats,
        uploadedDailyStats,
      )

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_002_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([])
    })

    it('applies a required snapshot while preserving dirty changes made after the upload', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploaded = BrowserProgressModule.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountProgress.recordAnswer(1, ['C'], true, CERT)
      accountProgress.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.replaceAccountCertFromSnapshotPreservingDirty(
        'user-1',
        CERT,
        10,
        [
          {
            qid: 1,
            correctCount: 0,
            wrongCount: 1,
            lastPicks: ['A'],
            lastCorrect: false,
            lastAnsweredAt: 1_700_000_000_000,
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
          {
            qid: 3,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['D'],
            lastCorrect: true,
            lastAnsweredAt: 1_700_000_010_000,
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        [],
        uploaded,
      )

      expect(accountProgress.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
      })
      expect(accountProgress.getProgress(2, CERT)).toMatchObject({
        correctCount: 1,
        lastPicks: ['B'],
      })
      expect(accountProgress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(accountProgress.getProgress(2, CERT)).not.toHaveProperty('dirtySince')
      expect(accountProgress.getProgress(3, CERT)).toMatchObject({
        correctCount: 1,
        lastPicks: ['D'],
      })
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([1, 2])
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 10,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('does not let snapshot recovery merge an older dirty source bucket over a newer server bucket', () => {
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'this')
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploadedDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_001_500)
      accountProgress.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_003_000)

      BrowserProgressModule.replaceAccountCertFromSnapshotPreservingDirty(
        'user-1',
        CERT,
        10,
        [],
        [
          {
            date: localDateKey(1_700_000_000_000),
            sourceId: 'client:this',
            correctCount: 5,
            wrongCount: 2,
            updatedAt: 1_700_000_002_000,
          },
        ],
        [],
        uploadedDailyStats,
      )

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_002_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([])
    })

    it('survives across new module instances in the same scope', () => {
      progress.recordAnswer(1, ['A'], true, CERT)
      progress.toggleBookmark(2, CERT)

      const freshProgress = new BrowserProgressModule('anonymous')

      expect(freshProgress.getProgress(1, CERT)).not.toBeNull()
      expect(freshProgress.isBookmarked(2, CERT)).toBe(true)
    })

    it('keeps anonymous progress on the original persisted storage key', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {
                  qid: 1,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['A'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_000_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
          },
        }),
      )

      expect(progress.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
    })

    it('clears only the requested progress scope', () => {
      const accountProgress = new BrowserProgressModule('account')
      progress.recordAnswer(1, ['A'], true, CERT)
      accountProgress.recordAnswer(1, ['B'], false, CERT)

      BrowserProgressModule.clearScope('account')

      expect(progress.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(accountProgress.getProgress(1, CERT)).toBeNull()
    })

    it('removes account owner metadata when clearing account scope', () => {
      localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')

      BrowserProgressModule.clearScope('account')

      expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBeNull()
    })

    it('does not treat account mirror progress without revision metadata as a sync baseline', () => {
      localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
      new BrowserProgressModule('account').recordAnswer(1, ['A'], true, CERT)

      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toBeNull()
      expect(localStorage.getItem(ACCOUNT_PROGRESS_SYNC_KEY)).toBeNull()
    })

    it('replaces one account cert from a snapshot and stores its sync baseline', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], true, CERT)
      accountProgress.recordAnswer(9, ['B'], false, 'CLF-C02')
      vi.setSystemTime(1_700_000_010_000)

      BrowserProgressModule.replaceAccountCertFromSnapshot(
        'user-1',
        CERT,
        7,
        [
          {
            qid: 2,
            correctCount: 2,
            wrongCount: 1,
            lastPicks: ['D', 'B'],
            lastCorrect: true,
            lastAnsweredAt: 1_700_000_001_000,
            bookmarked: true,
            bookmarkUpdatedAt: 1_700_000_002_000,
          },
        ],
        [
          {
            date: '2023-11-14',
            correctCount: 2,
            wrongCount: 1,
            updatedAt: 1_700_000_001_000,
          },
        ],
      )

      expect(accountProgress.getProgress(1, CERT)).toBeNull()
      expect(accountProgress.getProgress(2, CERT)).toMatchObject({
        qid: 2,
        correctCount: 2,
        wrongCount: 1,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_001_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_002_000,
      })
      expect(accountProgress.getProgress(9, 'CLF-C02')?.lastPicks).toEqual(['B'])
      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: '2023-11-14',
          correctCount: 2,
          wrongCount: 1,
          updatedAt: 1_700_000_001_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([])
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 7,
        lastSyncedAt: 1_700_000_010_000,
      })
    })

    it('uploads only the current client source bucket after a remote aggregate snapshot', () => {
      const accountProgress = new BrowserProgressModule('account')
      BrowserProgressModule.replaceAccountCertFromSnapshot(
        'user-1',
        CERT,
        7,
        [],
        [
          {
            date: localDateKey(1_700_000_000_000),
            correctCount: 2,
            wrongCount: 0,
            updatedAt: 1_700_000_000_000,
          },
        ],
      )
      vi.setSystemTime(1_700_000_005_000)

      accountProgress.recordAnswer(1, ['A'], false, CERT)

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 2,
          wrongCount: 1,
          updatedAt: 1_700_000_005_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: expect.stringMatching(/^client:/),
          correctCount: 0,
          wrongCount: 1,
          updatedAt: 1_700_000_005_000,
        },
      ])
    })

    it('preserves same-client source buckets from account snapshots before adding local answers', () => {
      const accountProgress = new BrowserProgressModule('account')
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'device-1')
      BrowserProgressModule.replaceAccountCertFromSnapshot(
        'user-1',
        CERT,
        7,
        [],
        [
          {
            date: localDateKey(1_700_000_000_000),
            sourceId: 'client:device-1',
            correctCount: 2,
            wrongCount: 0,
            updatedAt: 1_700_000_000_000,
          },
          {
            date: localDateKey(1_700_000_000_000),
            sourceId: 'anon-import:device-2',
            correctCount: 0,
            wrongCount: 1,
            updatedAt: 1_700_000_001_000,
          },
        ],
      )
      vi.setSystemTime(1_700_000_005_000)

      accountProgress.recordAnswer(1, ['A'], true, CERT)

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 3,
          wrongCount: 1,
          updatedAt: 1_700_000_005_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:device-1',
          correctCount: 3,
          wrongCount: 0,
          updatedAt: 1_700_000_005_000,
        },
      ])
    })

    it('preserves account daily stats dirtied during anonymous import for dates not in the import upload', () => {
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const dirtyDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyImportedAccountSync(
        'user-1',
        CERT,
        9,
        [],
        [],
        [
          {
            date: '2023-11-14',
            correctCount: 2,
            wrongCount: 0,
            updatedAt: 1_699_000_000_000,
          },
        ],
        [
          {
            date: '2023-11-14',
            sourceId: 'anon-import:device-1',
            correctCount: 2,
            wrongCount: 0,
            updatedAt: 1_699_000_000_000,
          },
        ],
      )

      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual(dirtyDailyStats)
      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: '2023-11-14',
          correctCount: 2,
          wrongCount: 0,
          updatedAt: 1_699_000_000_000,
        },
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 0,
          wrongCount: 1,
          updatedAt: 1_700_000_000_000,
        },
      ])
    })

    it('does not let anonymous import recovery merge an older dirty source bucket over a newer server bucket', () => {
      localStorage.setItem('ace-aws/account-progress-client-id/v1', 'this')
      const accountProgress = new BrowserProgressModule('account')
      accountProgress.recordAnswer(1, ['A'], false, CERT)
      const uploadedDailyStats = BrowserProgressModule.listDirtyAccountDailyStats(CERT)
      vi.setSystemTime(1_700_000_001_500)
      accountProgress.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_003_000)
      const serverDailyStats = [
        {
          date: localDateKey(1_700_000_000_000),
          sourceId: 'client:this',
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_002_000,
        },
      ]

      BrowserProgressModule.applyImportedAccountSync(
        'user-1',
        CERT,
        9,
        [],
        [],
        serverDailyStats,
        uploadedDailyStats,
      )

      expect(accountProgress.listDailyStats(CERT)).toEqual([
        {
          date: localDateKey(1_700_000_000_000),
          correctCount: 5,
          wrongCount: 2,
          updatedAt: 1_700_000_002_000,
        },
      ])
      expect(BrowserProgressModule.listDirtyAccountDailyStats(CERT)).toEqual([])
    })

    it('clears account sync metadata with account mirror on owner change while preserving anonymous progress', () => {
      progress.recordAnswer(1, ['A'], true, CERT)
      BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', CERT, 3, [])
      new BrowserProgressModule('account').recordAnswer(2, ['B'], false, CERT)

      expect(BrowserProgressModule.prepareAccountOwner('user-2')).toBe(true)

      expect(progress.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(new BrowserProgressModule('account').getProgress(2, CERT)).toBeNull()
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toBeNull()
      expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-2')
    })

    it('ignores malformed account sync metadata entries', () => {
      localStorage.setItem(
        ACCOUNT_PROGRESS_SYNC_KEY,
        JSON.stringify({
          byUser: {
            'user-1': {
              'DVA-C02': { revision: 2, lastSyncedAt: 1_700_000_000_000 },
              'SAP-C02': { revision: '9', lastSyncedAt: 1_700_000_000_000 },
              'CLF-C02': { revision: '3', lastSyncedAt: 1_700_000_000_000 },
            },
          },
        }),
      )

      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', 'DVA-C02')).toEqual({
        revision: 2,
        lastSyncedAt: 1_700_000_000_000,
      })
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', 'SAP-C02')).toBeNull()
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', 'CLF-C02')).toBeNull()
    })

    it('treats invalid cert progress data as empty progress', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({ byCert: { 'DVA-C02': {}, 'CLF-C02': { progress: null } } }),
      )

      expect(progress.getProgress(1, 'DVA-C02')).toBeNull()
      expect(progress.listProgress('CLF-C02')).toEqual([])
    })

    it('normalizes malformed question progress entries', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {},
                2: null,
                nope: { qid: 99, lastAnsweredAt: 1_700_000_000_000 },
              },
            },
          },
        }),
      )

      expect(progress.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      })
      expect(progress.listProgress(CERT).map((p) => p.qid)).toEqual([1])
      expect(progress.listAnswered(CERT)).toEqual([])
      expect(progress.listWrong(CERT)).toEqual([])
      expect(progress.listBookmarks(CERT)).toEqual([])
    })

    it('summarizes valid anonymous progress across ready certifications only', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {
                  qid: 1,
                  correctCount: 0,
                  wrongCount: 0,
                  lastPicks: [],
                  lastCorrect: null,
                  lastAnsweredAt: null,
                  bookmarked: false,
                  bookmarkUpdatedAt: 1_700_000_001_000,
                },
                2: {
                  qid: 2,
                  correctCount: 0,
                  wrongCount: 0,
                  lastPicks: [],
                  lastCorrect: null,
                  lastAnsweredAt: null,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
            'CLF-C02': {
              progress: {
                3: {
                  qid: 3,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['A'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_002_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
            'SAA-C03': {
              progress: {
                4: {
                  qid: 4,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['B'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_003_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
          },
        }),
      )

      expect(BrowserProgressModule.summarizeAnonymousImport()).toEqual({
        certs: ['CLF-C02', 'SAA-C03', 'DVA-C02'],
        certCount: 3,
        recordCount: 3,
      })
    })

    it('lists anonymous import records and clears only a successfully imported ready certification', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({
          byCert: {
            'DVA-C02': {
              progress: {
                1: {
                  qid: 1,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['A'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_002_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
            'SAA-C03': {
              progress: {
                2: {
                  qid: 2,
                  correctCount: 1,
                  wrongCount: 0,
                  lastPicks: ['B'],
                  lastCorrect: true,
                  lastAnsweredAt: 1_700_000_003_000,
                  bookmarked: false,
                  bookmarkUpdatedAt: null,
                },
              },
            },
          },
        }),
      )

      expect(BrowserProgressModule.listAnonymousImportProgress('DVA-C02')).toHaveLength(1)

      BrowserProgressModule.clearAnonymousImportCert('DVA-C02')

      expect(BrowserProgressModule.listAnonymousImportProgress('DVA-C02')).toEqual([])
      expect(
        JSON.parse(localStorage.getItem(ANONYMOUS_PROGRESS_KEY) ?? '{}').byCert,
      ).toHaveProperty('SAA-C03')
    })

    it('stores anonymous import dismissal outside the question progress module', () => {
      expect(hasDismissedAnonymousImport('user-1')).toBe(false)

      dismissAnonymousImport('user-1')

      expect(hasDismissedAnonymousImport('user-1')).toBe(true)
      expect(hasDismissedAnonymousImport('user-2')).toBe(false)
    })

    it('does not overwrite later dirty account progress when applying imported accepted records', () => {
      const accountProgress = new BrowserProgressModule('account')
      const uploaded: QuestionProgress[] = [
        {
          qid: 1,
          correctCount: 1,
          wrongCount: 0,
          lastPicks: ['A'],
          lastCorrect: true,
          lastAnsweredAt: 1_700_000_000_000,
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
      ]
      accountProgress.recordAnswer(1, ['B'], false, CERT)
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyImportedAccountSync('user-1', CERT, 12, uploaded, uploaded)

      expect(accountProgress.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 0,
        wrongCount: 1,
        lastPicks: ['B'],
        lastCorrect: false,
      })
      expect(accountProgress.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(BrowserProgressModule.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([1])
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 12,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('applies imported accepted records over clean account baseline progress', () => {
      const accountProgress = new BrowserProgressModule('account')
      BrowserProgressModule.replaceAccountCertFromSnapshot('user-1', CERT, 7, [
        {
          qid: 1,
          correctCount: 0,
          wrongCount: 1,
          lastPicks: ['B'],
          lastCorrect: false,
          lastAnsweredAt: 1_700_000_000_000,
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
      ])
      const uploaded: QuestionProgress[] = [
        {
          qid: 1,
          correctCount: 1,
          wrongCount: 0,
          lastPicks: ['A'],
          lastCorrect: true,
          lastAnsweredAt: 1_700_000_001_000,
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
      ]
      vi.setSystemTime(1_700_000_020_000)

      BrowserProgressModule.applyImportedAccountSync(
        'user-1',
        CERT,
        13,
        [
          {
            qid: 1,
            correctCount: 2,
            wrongCount: 1,
            lastPicks: ['A'],
            lastCorrect: true,
            lastAnsweredAt: 1_700_000_002_000,
            bookmarked: true,
            bookmarkUpdatedAt: 1_700_000_003_000,
          },
        ],
        uploaded,
      )

      expect(accountProgress.getProgress(1, CERT)).toEqual({
        qid: 1,
        correctCount: 2,
        wrongCount: 1,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_002_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_003_000,
      })
      expect(BrowserProgressModule.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 13,
        lastSyncedAt: 1_700_000_020_000,
      })
    })
  })
})
