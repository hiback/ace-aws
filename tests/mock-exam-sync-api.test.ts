import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getSnapshot: vi.fn(),
  syncDraft: vi.fn(),
  getHistorySnapshot: vi.fn(),
  syncHistory: vi.fn(),
}))

vi.mock('next-auth/next', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/auth/options', () => ({ authOptions: {} }))
vi.mock('@/server/mock-exam-sync/service', () => ({
  getAccountBackedMockExamDraftSnapshot: mocks.getSnapshot,
  syncAccountBackedMockExamDraft: mocks.syncDraft,
  getAccountBackedMockExamHistorySnapshot: mocks.getHistorySnapshot,
  syncAccountBackedMockExamHistory: mocks.syncHistory,
}))

import {
  GET,
  dynamic as snapshotDynamic,
  runtime as snapshotRuntime,
} from '../src/app/api/mock-exam/[cert]/draft/snapshot/route'
import {
  POST,
  dynamic as syncDynamic,
  runtime as syncRuntime,
} from '../src/app/api/mock-exam/[cert]/draft/sync/route'
import {
  GET as GET_HISTORY,
  dynamic as historySnapshotDynamic,
  runtime as historySnapshotRuntime,
} from '../src/app/api/mock-exam/[cert]/history/snapshot/route'
import {
  dynamic as historySyncDynamic,
  runtime as historySyncRuntime,
  POST as POST_HISTORY,
} from '../src/app/api/mock-exam/[cert]/history/sync/route'

function snapshot(cert: string) {
  return GET(new Request(`http://localhost/api/mock-exam/${cert}/draft/snapshot`), {
    params: Promise.resolve({ cert }),
  })
}

function sync(cert: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/mock-exam/${cert}/draft/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ cert }) },
  )
}

function historySnapshot(cert: string) {
  return GET_HISTORY(new Request(`http://localhost/api/mock-exam/${cert}/history/snapshot`), {
    params: Promise.resolve({ cert }),
  })
}

function historySync(cert: string, body: unknown) {
  return POST_HISTORY(
    new Request(`http://localhost/api/mock-exam/${cert}/history/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ cert }) },
  )
}

beforeEach(() => {
  mocks.getServerSession.mockReset()
  mocks.getSnapshot.mockReset()
  mocks.syncDraft.mockReset()
  mocks.getHistorySnapshot.mockReset()
  mocks.syncHistory.mockReset()
})

describe('Mock Exam Draft Sync API', () => {
  it('uses private Node.js route semantics', () => {
    expect(snapshotRuntime).toBe('nodejs')
    expect(snapshotDynamic).toBe('force-dynamic')
    expect(syncRuntime).toBe('nodejs')
    expect(syncDynamic).toBe('force-dynamic')
    expect(historySnapshotRuntime).toBe('nodejs')
    expect(historySnapshotDynamic).toBe('force-dynamic')
    expect(historySyncRuntime).toBe('nodejs')
    expect(historySyncDynamic).toBe('force-dynamic')
  })

  it('returns 401 without touching account-backed drafts when unauthenticated', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    expect((await snapshot('dva-c02')).status).toBe(401)
    expect((await sync('dva-c02', { baseRevision: 0, draft: null })).status).toBe(401)
    expect(mocks.getSnapshot).not.toHaveBeenCalled()
    expect(mocks.syncDraft).not.toHaveBeenCalled()
    expect((await historySnapshot('dva-c02')).status).toBe(401)
    expect((await historySync('dva-c02', { baseRevision: 0, submittedAttempts: [] })).status).toBe(
      401,
    )
    expect(mocks.getHistorySnapshot).not.toHaveBeenCalled()
    expect(mocks.syncHistory).not.toHaveBeenCalled()
  })

  it('returns a scoped authenticated snapshot for one certification', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.getSnapshot.mockResolvedValue({ cert: 'DVA-C02', revision: 2, draft: null })

    const response = await snapshot('dva-c02')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.getSnapshot).toHaveBeenCalledWith('user-1', 'DVA-C02')
    await expect(response.json()).resolves.toEqual({ cert: 'DVA-C02', revision: 2, draft: null })
  })

  it('syncs create/update/delete payloads through Mock Exam Revision', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.syncDraft.mockResolvedValue({
      status: 200,
      body: { cert: 'DVA-C02', revision: 3, draft: null, snapshotRequired: false },
    })

    const response = await sync('dva-c02', { baseRevision: 2, draft: null })

    expect(response.status).toBe(200)
    expect(mocks.syncDraft).toHaveBeenCalledWith('user-1', {
      cert: 'DVA-C02',
      baseRevision: 2,
      draft: null,
    })
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 3,
      draft: null,
      snapshotRequired: false,
    })
  })

  it('rejects malformed draft snapshots before calling the sync service', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })

    const response = await sync('dva-c02', {
      baseRevision: 0,
      draft: {
        id: 'bad-draft',
        cert: 'DVA-C02',
        draftStatus: 'active',
        currentIndex: 0,
        questionCount: 1,
        timeLimitSeconds: 60,
        startedAt: 1,
        updatedAt: 1,
        questions: [
          {
            qid: 0,
            domain: 'Development with AWS Services',
            topic: 'Development',
            correctAnswer: ['A'],
            type: 'single',
            userPicks: [],
            correct: null,
            flagged: false,
            answered: false,
          },
        ],
      },
    })

    expect(response.status).toBe(400)
    expect(mocks.syncDraft).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'invalid_draft', message: 'Invalid Mock Exam Draft' },
    })
  })

  it('returns account-backed submitted history snapshots for result and review routes', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.getHistorySnapshot.mockResolvedValue({
      cert: 'DVA-C02',
      revision: 8,
      submittedAttempts: [submitted('attempt-history-api', 850)],
    })

    const response = await historySnapshot('dva-c02')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.getHistorySnapshot).toHaveBeenCalledWith('user-1', 'DVA-C02')
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 8,
      submittedAttempts: [submitted('attempt-history-api', 850)],
    })
  })

  it('syncs immutable submitted attempts through Mock Exam Revision', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.syncHistory.mockResolvedValue({
      status: 200,
      body: {
        cert: 'DVA-C02',
        revision: 9,
        submittedAttempts: [submitted('attempt-history-sync-api', 850)],
        rejected: [],
        snapshotRequired: false,
      },
    })

    const body = {
      baseRevision: 8,
      submittedAttempts: [submitted('attempt-history-sync-api', 850)],
    }
    const response = await historySync('dva-c02', body)

    expect(response.status).toBe(200)
    expect(mocks.syncHistory).toHaveBeenCalledWith('user-1', {
      cert: 'DVA-C02',
      ...body,
    })
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 9,
      submittedAttempts: [submitted('attempt-history-sync-api', 850)],
      rejected: [],
      snapshotRequired: false,
    })
  })
})

function submitted(id: string, score: number) {
  return {
    id,
    cert: 'DVA-C02',
    submittedAt: 2000,
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
    ],
    summary: {
      score,
      passed: score >= 720,
      correctCount: 1,
      totalCount: 1,
      unansweredCount: 0,
      accuracy: 1,
      timeUsedSeconds: 600,
      autoSubmitted: false,
      domains: [
        {
          name: 'Development with AWS Services',
          correctCount: 1,
          totalCount: 1,
          accuracy: 1,
          weight: 32,
        },
      ],
    },
  }
}
