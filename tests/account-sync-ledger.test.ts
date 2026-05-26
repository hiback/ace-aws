import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserProgressModule } from '../src/lib/browser-progress-module'
import { getAccountMockExamSyncLedger } from '../src/lib/mock-exam/account-sync-ledger'
import {
  getLocalMockExamDraft,
  getLocalMockExamHistory,
  saveLocalMockExamAttempt,
  saveLocalMockExamSubmittedAttempt,
} from '../src/lib/mock-exam/local-repository'
import type { MockExamAttempt } from '../src/lib/mock-exam/start-attempt'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'

describe('Account Mock Exam sync ledger', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads and writes cached drafts per certification while marking draft state dirty', () => {
    const ledger = getAccountMockExamSyncLedger()
    const dvaDraft = draft('dva-draft', 'DVA-C02')
    const clfDraft = draft('clf-draft', 'CLF-C02')

    ledger.writeDraft(dvaDraft)
    ledger.writeDraft(clfDraft)

    expect(ledger.readDraft('DVA-C02')?.id).toBe('dva-draft')
    expect(ledger.readDraft('CLF-C02')?.id).toBe('clf-draft')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(true)
    expect(ledger.isDraftDirty('CLF-C02')).toBe(true)

    ledger.clearDraft('DVA-C02')

    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(ledger.readDraft('CLF-C02')?.id).toBe('clf-draft')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(true)
  })

  it('merges submitted history per certification and settles submitted dirty ids without touching cached data', () => {
    const ledger = getAccountMockExamSyncLedger()
    const older = submitted('older-dva', 'DVA-C02', 1000)
    const newer = submitted('newer-dva', 'DVA-C02', 2000)
    const clf = submitted('clf-history', 'CLF-C02', 3000)

    ledger.appendSubmittedAttempt(older)
    ledger.appendSubmittedAttempt(newer)
    ledger.appendSubmittedAttempt(clf)

    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'newer-dva',
      'older-dva',
    ])
    expect(ledger.readHistory('CLF-C02').map((attempt) => attempt.id)).toEqual(['clf-history'])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['newer-dva', 'older-dva'])

    ledger.setHistorySnapshot('DVA-C02', [submitted('server-dva', 'DVA-C02', 4000)])
    ledger.settleSubmittedAttempts('DVA-C02', ['older-dva'])

    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'server-dva',
      'newer-dva',
      'older-dva',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['newer-dva'])
  })

  it('tracks revisions and settles draft and submitted dirty flags independently', () => {
    const ledger = getAccountMockExamSyncLedger()
    const accountDraft = draft('account-draft', 'DVA-C02')
    const submittedAttempt = submitted('submitted-dirty', 'DVA-C02', 3000)

    ledger.writeDraft(accountDraft)
    ledger.appendSubmittedAttempt(submittedAttempt)
    ledger.setRevision('DVA-C02', 7)
    ledger.setRevision('CLF-C02', 3)

    expect(ledger.getRevision('DVA-C02')).toBe(7)
    expect(ledger.getRevision('CLF-C02')).toBe(3)
    expect(ledger.hasDirty('DVA-C02')).toBe(true)

    ledger.settleDraft('DVA-C02')

    expect(ledger.readDraft('DVA-C02')?.id).toBe('account-draft')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(false)
    expect(ledger.hasDirty('DVA-C02')).toBe(true)

    ledger.settleSubmittedAttempts('DVA-C02', ['submitted-dirty'])

    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual(['submitted-dirty'])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    expect(ledger.hasDirty('DVA-C02')).toBe(false)
  })

  it('syncs dirty draft and submitted attempts through an adapter before settling dirty flags', async () => {
    const ledger = getAccountMockExamSyncLedger()
    const syncedDrafts: Array<string | null> = []
    const syncedHistory: string[] = []
    ledger.writeDraft(draft('dirty-draft', 'DVA-C02'))
    ledger.appendSubmittedAttempt(submitted('dirty-history', 'DVA-C02', 3000))

    await expect(
      ledger.syncDirty('DVA-C02', {
        syncDraft: async (_cert, accountDraft) => {
          syncedDrafts.push(accountDraft?.id ?? null)
        },
        syncHistory: async (_cert, history) => {
          syncedHistory.push(...history.map((attempt) => attempt.id))
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncedDrafts).toEqual(['dirty-draft'])
    expect(syncedHistory).toEqual(['dirty-history'])
    expect(ledger.readDraft('DVA-C02')?.id).toBe('dirty-draft')
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual(['dirty-history'])
    expect(ledger.hasDirty('DVA-C02')).toBe(false)
  })

  it('keeps dirty draft and submitted cache available when dirty sync fails', async () => {
    const ledger = getAccountMockExamSyncLedger()
    ledger.writeDraft(draft('unsynced-draft', 'DVA-C02'))
    ledger.appendSubmittedAttempt(submitted('unsynced-history', 'DVA-C02', 3000))

    await expect(
      ledger.syncDirty('DVA-C02', {
        syncDraft: async () => {
          throw new Error('offline')
        },
        syncHistory: async () => {},
      }),
    ).resolves.toEqual({ ok: false, reason: 'temporary' })

    expect(ledger.readDraft('DVA-C02')?.id).toBe('unsynced-draft')
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual(['unsynced-history'])
    expect(ledger.hasDirty('DVA-C02')).toBe(true)
  })

  it('syncs the dirty draft payload after a server snapshot arrives', async () => {
    const ledger = getAccountMockExamSyncLedger()
    const syncedDrafts: Array<string | null> = []
    ledger.writeDraft(draft('dirty-local-draft', 'DVA-C02'))

    ledger.setDraftSnapshot('DVA-C02', draft('old-server-draft', 'DVA-C02'))

    await expect(
      ledger.syncDirty('DVA-C02', {
        syncDraft: async (_cert, accountDraft) => {
          syncedDrafts.push(accountDraft?.id ?? null)
        },
        syncHistory: async () => {},
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncedDrafts).toEqual(['dirty-local-draft'])
    expect(ledger.readDraft('DVA-C02')?.id).toBe('dirty-local-draft')
    expect(ledger.isDraftDirty('DVA-C02')).toBe(false)
  })

  it('merges dirty submitted attempts with server snapshots before dirty sync', async () => {
    const ledger = getAccountMockExamSyncLedger()
    const syncedHistory: string[] = []
    ledger.setHistorySnapshot('DVA-C02', [submitted('server-history', 'DVA-C02', 1000)])
    ledger.appendSubmittedAttempt(submitted('dirty-local-history', 'DVA-C02', 3000))

    ledger.setHistorySnapshot('DVA-C02', [submitted('new-server-history', 'DVA-C02', 2000)])

    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'dirty-local-history',
      'new-server-history',
    ])

    await expect(
      ledger.syncDirty('DVA-C02', {
        syncDraft: async () => {},
        syncHistory: async (_cert, history) => {
          syncedHistory.push(...history.map((attempt) => attempt.id))
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncedHistory).toEqual(['dirty-local-history'])
    expect(ledger.readHistory('DVA-C02').map((attempt) => attempt.id)).toEqual([
      'dirty-local-history',
      'new-server-history',
    ])
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
  })

  it('does not settle dirty submitted ids when their payload is unavailable', async () => {
    const ledger = getAccountMockExamSyncLedger()
    let syncCalls = 0
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({
        byUser: {
          __local__: {
            revisions: {},
            drafts: {},
            submittedAttempts: { 'DVA-C02': {} },
            dirtyDrafts: {},
            dirtySubmittedAttempts: { 'DVA-C02': ['missing-history'] },
          },
        },
      }),
    )

    await expect(
      ledger.syncDirty('DVA-C02', {
        syncDraft: async () => {},
        syncHistory: async () => {
          syncCalls += 1
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncCalls).toBe(0)
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual(['missing-history'])
  })

  it('isolates account cache by owner and clears only the current owner', () => {
    const ledger = getAccountMockExamSyncLedger()
    BrowserProgressModule.prepareAccountOwner('user-a')
    ledger.writeDraft(draft('user-a-draft', 'DVA-C02'))

    BrowserProgressModule.prepareAccountOwner('user-b')

    expect(ledger.readDraft('DVA-C02')).toBeNull()

    ledger.writeDraft(draft('user-b-draft', 'DVA-C02'))
    ledger.clearCurrentOwner()

    expect(ledger.readDraft('DVA-C02')).toBeNull()

    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(ledger.readDraft('DVA-C02')?.id).toBe('user-a-draft')
  })

  it('keeps other owners intact when clearing the current account mock exam owner', () => {
    const ledger = getAccountMockExamSyncLedger()
    BrowserProgressModule.prepareAccountOwner('user-a')
    ledger.writeDraft(draft('user-a-draft', 'DVA-C02'))
    BrowserProgressModule.prepareAccountOwner('user-b')
    ledger.writeDraft(draft('user-b-draft', 'DVA-C02'))

    ledger.clearCurrentOwner()

    expect(ledger.readDraft('DVA-C02')).toBeNull()

    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(ledger.readDraft('DVA-C02')?.id).toBe('user-a-draft')
  })

  it('clears a requested account owner after account progress removes the owner key', () => {
    const ledger = getAccountMockExamSyncLedger()
    BrowserProgressModule.prepareAccountOwner('user-a')
    ledger.writeDraft(draft('user-a-draft', 'DVA-C02'))
    BrowserProgressModule.prepareAccountOwner('user-b')
    ledger.writeDraft(draft('user-b-draft', 'DVA-C02'))
    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(ledger.readDraft('DVA-C02')?.id).toBe('user-a-draft')

    BrowserProgressModule.clearScope('account')
    ledger.clearOwner('user-a')

    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(ledger.readDraft('DVA-C02')).toBeNull()

    BrowserProgressModule.prepareAccountOwner('user-b')

    expect(ledger.readDraft('DVA-C02')?.id).toBe('user-b-draft')
  })

  it('imports anonymous history without overwriting an existing account draft', async () => {
    const ledger = getAccountMockExamSyncLedger()
    const syncedHistory: string[] = []
    const syncedDrafts: string[] = []
    saveLocalMockExamAttempt(draft('anonymous-draft', 'DVA-C02'))
    saveLocalMockExamSubmittedAttempt(submitted('anonymous-history', 'DVA-C02', 3000))
    ledger.writeDraft(draft('account-draft', 'DVA-C02'))

    await expect(
      ledger.importAnonymousCert('DVA-C02', {
        syncHistory: async (_cert, history) => {
          syncedHistory.push(...history.map((attempt) => attempt.id))
        },
        fetchAccountDraft: async (cert) => ledger.readDraft(cert),
        syncDraft: async (accountDraft) => {
          syncedDrafts.push(accountDraft.id)
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncedHistory).toEqual(['anonymous-history'])
    expect(syncedDrafts).toEqual([])
    expect(ledger.readDraft('DVA-C02')?.id).toBe('account-draft')
    expect(getLocalMockExamDraft('DVA-C02')).toBeNull()
    expect(getLocalMockExamHistory('DVA-C02')).toEqual([])
  })

  it('imports anonymous history and draft when the account has no draft', async () => {
    const ledger = getAccountMockExamSyncLedger()
    const syncedHistory: string[] = []
    const syncedDrafts: string[] = []
    saveLocalMockExamAttempt(draft('anonymous-draft', 'DVA-C02'))
    saveLocalMockExamSubmittedAttempt(submitted('anonymous-history', 'DVA-C02', 3000))

    await expect(
      ledger.importAnonymousCert('DVA-C02', {
        syncHistory: async (_cert, history) => {
          syncedHistory.push(...history.map((attempt) => attempt.id))
        },
        fetchAccountDraft: async () => null,
        syncDraft: async (accountDraft) => {
          syncedDrafts.push(accountDraft.id)
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(syncedHistory).toEqual(['anonymous-history'])
    expect(syncedDrafts).toEqual(['anonymous-draft'])
    expect(getLocalMockExamDraft('DVA-C02')).toBeNull()
    expect(getLocalMockExamHistory('DVA-C02')).toEqual([])
  })

  it('summarizes anonymous mock exam import candidates in ready-cert order', () => {
    const ledger = getAccountMockExamSyncLedger()
    saveLocalMockExamAttempt(draft('anonymous-dva-draft', 'DVA-C02'))
    saveLocalMockExamSubmittedAttempt(submitted('anonymous-clf-history', 'CLF-C02', 4000))

    expect(ledger.summarizeAnonymousImport()).toEqual({
      certs: ['CLF-C02', 'DVA-C02'],
      certCount: 2,
      recordCount: 2,
    })
  })

  it('rejects legacy flat submitted account history as empty state', () => {
    const ledger = getAccountMockExamSyncLedger()
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({
        byUser: {
          __local__: {
            revisions: {},
            drafts: {},
            submittedAttempts: {
              'legacy-flat': submitted('legacy-flat', 'DVA-C02', 1000),
            },
            dirtyDrafts: {},
            dirtySubmittedAttempts: {},
          },
        },
      }),
    )

    expect(() => ledger.readHistory('DVA-C02')).not.toThrow()
    expect(ledger.readHistory('DVA-C02')).toEqual([])
  })

  it('reads legacy root draft and revision while rejecting flat submitted history', () => {
    const ledger = getAccountMockExamSyncLedger()
    const legacyRootState = {
      revisions: { 'DVA-C02': 11 },
      drafts: { 'DVA-C02': draft('legacy-root-draft', 'DVA-C02') },
      submittedAttempts: {
        'legacy-flat': submitted('legacy-flat', 'DVA-C02', 1000),
      },
      dirtyDrafts: {},
      dirtySubmittedAttempts: {},
    }
    localStorage.setItem('ace-aws/mock-exam/account-sync/v1', JSON.stringify(legacyRootState))

    expect(ledger.readDraft('DVA-C02')?.id).toBe('legacy-root-draft')
    expect(ledger.getRevision('DVA-C02')).toBe(11)
    expect(ledger.readHistory('DVA-C02')).toEqual([])

    localStorage.clear()
    BrowserProgressModule.prepareAccountOwner('user-a')
    localStorage.setItem('ace-aws/mock-exam/account-sync/v1', JSON.stringify(legacyRootState))

    expect(ledger.readDraft('DVA-C02')?.id).toBe('legacy-root-draft')
    expect(ledger.getRevision('DVA-C02')).toBe(11)
    expect(ledger.readHistory('DVA-C02')).toEqual([])
  })

  it('clears legacy root draft state for an explicit owner after the owner key is removed', () => {
    const ledger = getAccountMockExamSyncLedger()
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({
        revisions: { 'DVA-C02': 11 },
        drafts: { 'DVA-C02': draft('legacy-root-draft', 'DVA-C02') },
        submittedAttempts: {
          'legacy-flat': submitted('legacy-flat', 'DVA-C02', 1000),
        },
        dirtyDrafts: {},
        dirtySubmittedAttempts: {},
      }),
    )

    ledger.clearOwner('user-a')

    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(ledger.getRevision('DVA-C02')).toBe(0)
    expect(ledger.readHistory('DVA-C02')).toEqual([])

    BrowserProgressModule.prepareAccountOwner('user-a')

    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(ledger.readHistory('DVA-C02')).toEqual([])
  })

  it('falls back to empty state for malformed owner buckets', () => {
    const ledger = getAccountMockExamSyncLedger()
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({ byUser: { __local__: {} } }),
    )

    expect(() => ledger.readDraft('DVA-C02')).not.toThrow()
    expect(() => ledger.getRevision('DVA-C02')).not.toThrow()
    expect(() => ledger.hasDirty('DVA-C02')).not.toThrow()
    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(ledger.readHistory('DVA-C02')).toEqual([])
    expect(ledger.getRevision('DVA-C02')).toBe(0)
    expect(ledger.hasDirty('DVA-C02')).toBe(false)

    ledger.writeDraft(draft('recovered-draft', 'DVA-C02'))

    expect(ledger.readDraft('DVA-C02')?.id).toBe('recovered-draft')
  })

  it('falls back to empty state for malformed cert-level owner fields', () => {
    const ledger = getAccountMockExamSyncLedger()
    localStorage.setItem(
      'ace-aws/mock-exam/account-sync/v1',
      JSON.stringify({
        byUser: {
          __local__: {
            revisions: { 'DVA-C02': {} },
            drafts: { 'DVA-C02': {} },
            submittedAttempts: { 'DVA-C02': [] },
            dirtyDrafts: { 'DVA-C02': {} },
            dirtySubmittedAttempts: { 'DVA-C02': {} },
          },
        },
      }),
    )

    expect(() => ledger.listDirtySubmittedAttemptIds('DVA-C02')).not.toThrow()
    expect(() => ledger.hasDirty('DVA-C02')).not.toThrow()
    expect(ledger.readDraft('DVA-C02')).toBeNull()
    expect(ledger.readHistory('DVA-C02')).toEqual([])
    expect(ledger.getRevision('DVA-C02')).toBe(0)
    expect(ledger.isDraftDirty('DVA-C02')).toBe(false)
    expect(ledger.listDirtySubmittedAttemptIds('DVA-C02')).toEqual([])
    expect(ledger.hasDirty('DVA-C02')).toBe(false)
  })
})

function draft(id: string, cert: MockExamAttempt['cert']): MockExamAttempt {
  return {
    id,
    cert,
    draftStatus: 'saved',
    currentIndex: 0,
    questionCount: 2,
    timeLimitSeconds: 120,
    startedAt: 1000,
    updatedAt: 2000,
    questions: [
      {
        qid: 1,
        domain: 'Development with AWS Services',
        topic: 'Development',
        correctAnswer: ['A'],
        type: 'single',
        userPicks: ['A'],
        correct: true,
        flagged: false,
        answered: true,
      },
      {
        qid: 2,
        domain: 'Security',
        topic: 'Security',
        correctAnswer: ['B'],
        type: 'single',
        userPicks: [],
        correct: null,
        flagged: false,
        answered: false,
      },
    ],
  }
}

function submitted(
  id: string,
  cert: SubmittedMockExamAttempt['cert'],
  submittedAt: number,
): SubmittedMockExamAttempt {
  return {
    id,
    cert,
    submittedAt,
    questions: draft(`${id}-draft`, cert).questions,
    summary: {
      score: 850,
      passed: true,
      correctCount: 1,
      totalCount: 2,
      unansweredCount: 1,
      accuracy: 0.5,
      timeUsedSeconds: 600,
      autoSubmitted: false,
      domains: [
        {
          name: 'Development with AWS Services',
          correctCount: 1,
          totalCount: 2,
          accuracy: 0.5,
          weight: 32,
        },
      ],
    },
  }
}
