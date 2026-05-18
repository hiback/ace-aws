import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionProgress } from '../src/data/types'
import {
  ACCOUNT_PROGRESS_OWNER_KEY,
  ACCOUNT_PROGRESS_SYNC_KEY,
  LocalProgressRepository,
} from '../src/repositories/local-progress-repository'

const CERT = 'DVA-C02'
const ANONYMOUS_PROGRESS_KEY = 'ace-aws/progress/v1'

describe('LocalProgressRepository', () => {
  let repo: LocalProgressRepository

  beforeEach(() => {
    localStorage.clear()
    repo = new LocalProgressRepository('anonymous')
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('progress records', () => {
    it('returns null when no progress exists for a question', () => {
      expect(repo.getProgress(1, CERT)).toBeNull()
    })

    it('creates progress with sorted last picks and a correct count', () => {
      repo.recordAnswer(1, ['D', 'B'], true, CERT)

      expect(repo.getProgress(1, CERT)).toMatchObject({
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
      repo.recordAnswer(1, ['A'], false, CERT)
      vi.setSystemTime(1_700_000_000_500)
      repo.recordAnswer(1, ['C'], true, CERT)

      expect(repo.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_000_500,
      })
    })

    it('lists answered records and excludes bookmark-only records', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.toggleBookmark(2, CERT)

      expect(repo.listAnswered(CERT).map((p) => p.qid)).toEqual([1])
      expect(
        repo
          .listProgress(CERT)
          .map((p) => p.qid)
          .sort((a, b) => a - b),
      ).toEqual([1, 2])
    })

    it('lists wrong records by latest answer state', () => {
      repo.recordAnswer(1, ['A'], false, CERT)
      repo.recordAnswer(2, ['B'], false, CERT)
      repo.recordAnswer(2, ['C'], true, CERT)

      const wrong = repo.listWrong(CERT)

      expect(wrong).toHaveLength(1)
      expect(wrong[0]).toMatchObject({ qid: 1, lastCorrect: false, wrongCount: 1 })
    })

    it('isolates progress by cert', () => {
      repo.recordAnswer(1, ['A'], true, 'DVA-C02')
      repo.recordAnswer(1, ['B'], false, 'CLF-C02')

      expect(repo.getProgress(1, 'DVA-C02')?.lastPicks).toEqual(['A'])
      expect(repo.getProgress(1, 'CLF-C02')?.lastPicks).toEqual(['B'])
      expect(repo.listWrong('DVA-C02')).toHaveLength(0)
      expect(repo.listWrong('CLF-C02')).toHaveLength(1)
    })
  })

  describe('bookmarks', () => {
    it('creates a bookmark-only progress record', () => {
      repo.toggleBookmark(5, CERT)

      expect(repo.getProgress(5, CERT)).toMatchObject({
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
      repo.toggleBookmark(5, CERT)
      vi.setSystemTime(1_700_000_001_000)
      repo.toggleBookmark(5, CERT)

      expect(repo.isBookmarked(5, CERT)).toBe(false)
      expect(repo.listBookmarks(CERT)).toEqual([])
      expect(repo.getProgress(5, CERT)).toMatchObject({
        qid: 5,
        bookmarked: false,
        bookmarkUpdatedAt: 1_700_000_001_000,
        lastAnsweredAt: null,
      })
    })

    it('preserves answer counts when toggling bookmarks', () => {
      repo.recordAnswer(3, ['A'], false, CERT)
      repo.toggleBookmark(3, CERT)
      repo.toggleBookmark(3, CERT)

      expect(repo.getProgress(3, CERT)).toMatchObject({
        wrongCount: 1,
        lastCorrect: false,
        bookmarked: false,
      })
    })
  })

  describe('stats', () => {
    it('returns zeros initially', () => {
      expect(repo.getStats(CERT)).toEqual({ answered: 0, correct: 0, total: 0 })
    })

    it('counts answered questions and latest-correct questions', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.recordAnswer(2, ['B'], false, CERT)
      repo.recordAnswer(3, ['C'], false, CERT)
      repo.recordAnswer(3, ['D'], true, CERT)
      repo.toggleBookmark(4, CERT)

      expect(repo.getStats(CERT)).toEqual({ answered: 3, correct: 2, total: 0 })
    })
  })

  describe('storage scopes', () => {
    it('isolates anonymous and account progress keys', () => {
      repo.recordAnswer(1, ['A'], true, CERT)

      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['B'], false, CERT)

      expect(repo.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(accountRepo.getProgress(1, CERT)?.lastPicks).toEqual(['B'])
    })

    it('marks account writes dirty without adding sync metadata to anonymous writes', () => {
      repo.recordAnswer(1, ['A'], true, CERT)

      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['B'], false, CERT)
      accountRepo.toggleBookmark(2, CERT)

      expect(repo.getProgress(1, CERT)).not.toHaveProperty('dirtySince')
      expect(accountRepo.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        lastPicks: ['B'],
        dirtySince: 1_700_000_000_000,
      })
      expect(accountRepo.getProgress(2, CERT)).toMatchObject({
        qid: 2,
        bookmarked: true,
        dirtySince: 1_700_000_000_000,
      })
    })

    it('preserves the first dirty time across repeated account writes', () => {
      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['A'], false, CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountRepo.recordAnswer(1, ['C'], true, CERT)
      accountRepo.toggleBookmark(1, CERT)

      expect(accountRepo.getProgress(1, CERT)).toMatchObject({
        lastPicks: ['C'],
        bookmarked: true,
        dirtySince: 1_700_000_000_000,
      })
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

      expect(LocalProgressRepository.listDirtyAccountProgress(CERT).map((p) => p.qid)).toEqual([
        2, 3, 4,
      ])
    })

    it('applies accepted account sync records as canonical progress and clears their dirty state', () => {
      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['A'], false, CERT)
      accountRepo.recordAnswer(2, ['B'], false, CERT)
      const uploaded = LocalProgressRepository.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_020_000)

      LocalProgressRepository.applyAcceptedAccountSync(
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

      expect(accountRepo.getProgress(1, CERT)).toEqual({
        qid: 1,
        correctCount: 3,
        wrongCount: 1,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_010_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_011_000,
      })
      expect(accountRepo.getProgress(2, CERT)?.dirtySince).toBe(1_700_000_000_000)
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 9,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('keeps newer local account changes dirty when an older accepted sync response returns', () => {
      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['A'], false, CERT)
      const uploaded = LocalProgressRepository.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountRepo.recordAnswer(1, ['C'], true, CERT)
      vi.setSystemTime(1_700_000_020_000)

      LocalProgressRepository.applyAcceptedAccountSync(
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

      expect(accountRepo.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_005_000,
        dirtySince: 1_700_000_000_000,
      })
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 9,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('applies a required snapshot while preserving dirty changes made after the upload', () => {
      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['A'], false, CERT)
      const uploaded = LocalProgressRepository.listDirtyAccountProgress(CERT)
      vi.setSystemTime(1_700_000_005_000)
      accountRepo.recordAnswer(1, ['C'], true, CERT)
      accountRepo.recordAnswer(2, ['B'], true, CERT)
      vi.setSystemTime(1_700_000_020_000)

      LocalProgressRepository.replaceAccountCertFromSnapshotPreservingDirty(
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
        uploaded,
      )

      expect(accountRepo.getProgress(1, CERT)).toMatchObject({
        correctCount: 1,
        wrongCount: 1,
        lastPicks: ['C'],
        lastCorrect: true,
        dirtySince: 1_700_000_000_000,
      })
      expect(accountRepo.getProgress(2, CERT)).toMatchObject({
        correctCount: 1,
        lastPicks: ['B'],
        dirtySince: 1_700_000_005_000,
      })
      expect(accountRepo.getProgress(3, CERT)).toMatchObject({
        correctCount: 1,
        lastPicks: ['D'],
      })
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 10,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('survives across new repository instances in the same scope', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      repo.toggleBookmark(2, CERT)

      const repo2 = new LocalProgressRepository('anonymous')

      expect(repo2.getProgress(1, CERT)).not.toBeNull()
      expect(repo2.isBookmarked(2, CERT)).toBe(true)
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

      expect(repo.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
    })

    it('clears only the requested progress scope', () => {
      const accountRepo = new LocalProgressRepository('account')
      repo.recordAnswer(1, ['A'], true, CERT)
      accountRepo.recordAnswer(1, ['B'], false, CERT)

      LocalProgressRepository.clearScope('account')

      expect(repo.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(accountRepo.getProgress(1, CERT)).toBeNull()
    })

    it('removes account owner metadata when clearing account scope', () => {
      localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')

      LocalProgressRepository.clearScope('account')

      expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBeNull()
    })

    it('does not treat account mirror progress without revision metadata as a sync baseline', () => {
      localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, 'user-1')
      new LocalProgressRepository('account').recordAnswer(1, ['A'], true, CERT)

      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toBeNull()
      expect(localStorage.getItem(ACCOUNT_PROGRESS_SYNC_KEY)).toBeNull()
    })

    it('replaces one account cert from a snapshot and stores its sync baseline', () => {
      const accountRepo = new LocalProgressRepository('account')
      accountRepo.recordAnswer(1, ['A'], true, CERT)
      accountRepo.recordAnswer(9, ['B'], false, 'CLF-C02')
      vi.setSystemTime(1_700_000_010_000)

      LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', CERT, 7, [
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
      ])

      expect(accountRepo.getProgress(1, CERT)).toBeNull()
      expect(accountRepo.getProgress(2, CERT)).toMatchObject({
        qid: 2,
        correctCount: 2,
        wrongCount: 1,
        lastPicks: ['B', 'D'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_001_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_002_000,
      })
      expect(accountRepo.getProgress(9, 'CLF-C02')?.lastPicks).toEqual(['B'])
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 7,
        lastSyncedAt: 1_700_000_010_000,
      })
    })

    it('clears account sync metadata with account mirror on owner change while preserving anonymous progress', () => {
      repo.recordAnswer(1, ['A'], true, CERT)
      LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', CERT, 3, [])
      new LocalProgressRepository('account').recordAnswer(2, ['B'], false, CERT)

      expect(LocalProgressRepository.prepareAccountOwner('user-2')).toBe(true)

      expect(repo.getProgress(1, CERT)?.lastPicks).toEqual(['A'])
      expect(new LocalProgressRepository('account').getProgress(2, CERT)).toBeNull()
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toBeNull()
      expect(localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY)).toBe('user-2')
    })

    it('ignores malformed account sync metadata entries', () => {
      localStorage.setItem(
        ACCOUNT_PROGRESS_SYNC_KEY,
        JSON.stringify({
          byUser: {
            'user-1': {
              'DVA-C02': { revision: 2, lastSyncedAt: 1_700_000_000_000 },
              'SAA-C03': { revision: 9, lastSyncedAt: 1_700_000_000_000 },
              'CLF-C02': { revision: '3', lastSyncedAt: 1_700_000_000_000 },
            },
          },
        }),
      )

      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'DVA-C02')).toEqual({
        revision: 2,
        lastSyncedAt: 1_700_000_000_000,
      })
      expect(
        LocalProgressRepository.getAccountSyncBaseline('user-1', 'SAA-C03' as never),
      ).toBeNull()
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', 'CLF-C02')).toBeNull()
    })

    it('treats invalid cert progress data as empty progress', () => {
      localStorage.setItem(
        ANONYMOUS_PROGRESS_KEY,
        JSON.stringify({ byCert: { 'DVA-C02': {}, 'CLF-C02': { progress: null } } }),
      )

      expect(repo.getProgress(1, 'DVA-C02')).toBeNull()
      expect(repo.listProgress('CLF-C02')).toEqual([])
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

      expect(repo.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      })
      expect(repo.listProgress(CERT).map((p) => p.qid)).toEqual([1])
      expect(repo.listAnswered(CERT)).toEqual([])
      expect(repo.listWrong(CERT)).toEqual([])
      expect(repo.listBookmarks(CERT)).toEqual([])
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

      expect(LocalProgressRepository.summarizeAnonymousImport()).toEqual({
        certs: ['CLF-C02', 'DVA-C02'],
        certCount: 2,
        recordCount: 2,
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

      expect(LocalProgressRepository.listAnonymousImportProgress('DVA-C02')).toHaveLength(1)

      LocalProgressRepository.clearAnonymousImportCert('DVA-C02')

      expect(LocalProgressRepository.listAnonymousImportProgress('DVA-C02')).toEqual([])
      expect(
        JSON.parse(localStorage.getItem(ANONYMOUS_PROGRESS_KEY) ?? '{}').byCert,
      ).toHaveProperty('SAA-C03')
    })

    it('stores anonymous import dismissal per signed-in account', () => {
      expect(LocalProgressRepository.hasDismissedAnonymousImport('user-1')).toBe(false)

      LocalProgressRepository.dismissAnonymousImport('user-1')

      expect(LocalProgressRepository.hasDismissedAnonymousImport('user-1')).toBe(true)
      expect(LocalProgressRepository.hasDismissedAnonymousImport('user-2')).toBe(false)
    })

    it('does not overwrite later dirty account progress when applying imported accepted records', () => {
      const accountRepo = new LocalProgressRepository('account')
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
      accountRepo.recordAnswer(1, ['B'], false, CERT)
      vi.setSystemTime(1_700_000_020_000)

      LocalProgressRepository.applyImportedAccountSync('user-1', CERT, 12, uploaded, uploaded)

      expect(accountRepo.getProgress(1, CERT)).toMatchObject({
        qid: 1,
        correctCount: 0,
        wrongCount: 1,
        lastPicks: ['B'],
        lastCorrect: false,
        dirtySince: 1_700_000_000_000,
      })
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 12,
        lastSyncedAt: 1_700_000_020_000,
      })
    })

    it('applies imported accepted records over clean account baseline progress', () => {
      const accountRepo = new LocalProgressRepository('account')
      LocalProgressRepository.replaceAccountCertFromSnapshot('user-1', CERT, 7, [
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

      LocalProgressRepository.applyImportedAccountSync(
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

      expect(accountRepo.getProgress(1, CERT)).toEqual({
        qid: 1,
        correctCount: 2,
        wrongCount: 1,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: 1_700_000_002_000,
        bookmarked: true,
        bookmarkUpdatedAt: 1_700_000_003_000,
      })
      expect(LocalProgressRepository.getAccountSyncBaseline('user-1', CERT)).toEqual({
        revision: 13,
        lastSyncedAt: 1_700_000_020_000,
      })
    })
  })
})
