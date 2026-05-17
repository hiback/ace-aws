import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txOnConflictDoNothing: vi.fn(),
  txSelect: vi.fn(),
  txFrom: vi.fn(),
  txWhere: vi.fn(),
  txFor: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txOnConflictDoUpdate: vi.fn(),
}))

vi.mock('next-auth/next', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/auth/options', () => ({ authOptions: {} }))
vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

import { dynamic, POST, runtime } from '../src/app/api/progress/[cert]/sync/route'

const now = new Date('2026-01-01T00:00:00.000Z')
const pastIso = '2025-12-31T00:00:00.000Z'
const futureIso = '2026-01-01T00:06:00.001Z'

function sync(cert: string, init?: RequestInit) {
  return POST(new Request(`http://localhost/api/progress/${cert}/sync`, init), {
    params: Promise.resolve({ cert }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  mocks.getServerSession.mockReset()
  mocks.transaction.mockReset()
  mocks.txInsert.mockReset()
  mocks.txInsertValues.mockReset()
  mocks.txOnConflictDoNothing.mockReset()
  mocks.txSelect.mockReset()
  mocks.txFrom.mockReset()
  mocks.txWhere.mockReset()
  mocks.txFor.mockReset()
  mocks.txUpdate.mockReset()
  mocks.txSet.mockReset()
  mocks.txUpdateWhere.mockReset()
  mocks.txOnConflictDoUpdate.mockReset()

  mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues })
  mocks.txInsertValues.mockReturnValue({
    onConflictDoNothing: mocks.txOnConflictDoNothing,
    onConflictDoUpdate: mocks.txOnConflictDoUpdate,
  })
  let whereCalls = 0
  mocks.txSelect.mockReturnValue({ from: mocks.txFrom })
  mocks.txFrom.mockReturnValue({ where: mocks.txWhere })
  mocks.txWhere.mockImplementation(() => {
    whereCalls += 1
    return whereCalls === 1 ? { for: mocks.txFor } : []
  })
  mocks.txFor.mockResolvedValue([{ revision: 0 }])
  mocks.txUpdate.mockReturnValue({ set: mocks.txSet })
  mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere })
  mocks.transaction.mockImplementation((callback) =>
    callback({
      insert: mocks.txInsert,
      select: mocks.txSelect,
      update: mocks.txUpdate,
    }),
  )
})

function signIn() {
  mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
}

function postJson(body: unknown, cert = 'dva-c02') {
  return sync(cert, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
}

function validAnswer(overrides: Record<string, unknown> = {}) {
  return {
    qid: 1,
    correctCount: 1,
    wrongCount: 0,
    lastPicks: ['A'],
    lastCorrect: true,
    lastAnsweredAt: pastIso,
    bookmarked: false,
    bookmarkUpdatedAt: null,
    ...overrides,
  }
}

function validBookmark(overrides: Record<string, unknown> = {}) {
  return {
    qid: 2,
    correctCount: 0,
    wrongCount: 0,
    lastPicks: [],
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: true,
    bookmarkUpdatedAt: pastIso,
    ...overrides,
  }
}

function validTombstone(overrides: Record<string, unknown> = {}) {
  return {
    qid: 3,
    correctCount: 0,
    wrongCount: 0,
    lastPicks: [],
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: false,
    bookmarkUpdatedAt: pastIso,
    ...overrides,
  }
}

describe('Progress Sync API', () => {
  it('uses private Node.js route semantics', () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
  })

  it('returns 401 without writing Account-Backed Progress when unauthenticated', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null)

    const response = await sync('dva-c02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: 0, progress: [] }),
    })

    expect(response.status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 for unknown certifications', async () => {
    signIn()

    const response = await postJson({ baseRevision: 0, progress: [] }, 'saa-c03')

    expect(response.status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Certification not found' })
  })

  it('requires JSON content and returns stable payload-level error codes', async () => {
    signIn()
    const unsupported = await sync('dva-c02', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    })
    expect(unsupported.status).toBe(415)
    await expect(unsupported.json()).resolves.toMatchObject({
      error: { code: 'unsupported_media_type' },
    })

    signIn()
    const malformed = await sync('dva-c02', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({ error: { code: 'invalid_json' } })
  })

  it('returns payload-level errors for invalid top-level payloads', async () => {
    for (const [payload, code] of [
      [{ baseRevision: -1, progress: [] }, 'invalid_base_revision'],
      [{ progress: [] }, 'invalid_top_level_payload'],
      [{ baseRevision: 0, progress: [], extra: true }, 'invalid_top_level_payload'],
      [{ baseRevision: 0, progress: [validAnswer(), validBookmark({ qid: 1 })] }, 'duplicate_qid'],
      [
        {
          baseRevision: 0,
          progress: Array.from({ length: 558 }, (_, index) => validAnswer({ qid: index + 1 })),
        },
        'payload_too_large',
      ],
    ] as const) {
      signIn()
      const response = await postJson(payload)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code } })
    }
  })

  it('does not treat an invalid record with a duplicate qid as a payload-level duplicate', async () => {
    signIn()

    const response = await postJson({
      baseRevision: 0,
      progress: [validAnswer(), { ...validAnswer(), extra: true }],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 1,
      accepted: [validAnswer()],
      rejected: [{ index: 1, code: 'invalid_shape' }],
      snapshotRequired: false,
    })
  })

  it('accepts empty Progress Sync as a no-op revision check', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 7 }])

    const response = await postJson({ baseRevision: 1, progress: [] })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 7,
      accepted: [],
      rejected: [],
      snapshotRequired: true,
    })
  })

  it('returns record-level rejects without changing the Progress Revision', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 2 }])

    const response = await postJson({
      baseRevision: 2,
      progress: [
        null,
        validAnswer({ qid: 9999 }),
        validAnswer({ lastPicks: ['E'] }),
        validAnswer({ qid: 7, lastPicks: ['A'], lastCorrect: true }),
        validBookmark({ bookmarkUpdatedAt: futureIso }),
        validTombstone({ qid: 4, bookmarkUpdatedAt: null }),
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 2,
      accepted: [],
      rejected: [
        { index: 0, code: 'invalid_shape' },
        { index: 1, qid: 9999, code: 'invalid_qid' },
        { index: 2, qid: 1, code: 'invalid_options' },
        { index: 3, qid: 7, code: 'invalid_options' },
        { index: 4, qid: 2, code: 'future_timestamp' },
        { index: 5, qid: 4, code: 'invalid_answer_state' },
      ],
      snapshotRequired: false,
    })
  })

  it('rejects count values outside the PostgreSQL integer range before writing', async () => {
    signIn()

    const response = await postJson({
      baseRevision: 0,
      progress: [validAnswer({ correctCount: 2_147_483_648 })],
    })

    expect(response.status).toBe(200)
    expect(mocks.txOnConflictDoUpdate).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 0,
      accepted: [],
      rejected: [{ index: 0, qid: 1, code: 'invalid_shape' }],
      snapshotRequired: false,
    })
  })

  it('canonicalizes valid DTOs and accepts answer, bookmark-only, and Bookmark Tombstone records', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 3 }])

    const response = await postJson({
      baseRevision: 3,
      progress: [
        validAnswer({
          qid: 7,
          correctCount: 0,
          wrongCount: 1,
          lastPicks: ['D', 'B'],
          lastCorrect: false,
        }),
        validBookmark(),
        validTombstone(),
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 4,
      accepted: [
        {
          qid: 7,
          correctCount: 0,
          wrongCount: 1,
          lastPicks: ['B', 'D'],
          lastCorrect: false,
          lastAnsweredAt: pastIso,
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
        validBookmark(),
        validTombstone(),
      ],
      rejected: [],
      snapshotRequired: false,
    })
  })

  it('merges stale valid records and returns accepted canonical Question Progress in upload order', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 5 }])
    mocks.txWhere.mockReturnValueOnce({ for: mocks.txFor }).mockResolvedValueOnce([
      {
        qid: 1,
        correctCount: 3,
        wrongCount: 1,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: new Date('2026-01-01T00:00:00.000Z'),
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
    ])

    const response = await postJson({
      baseRevision: 4,
      progress: [
        validAnswer({
          qid: 1,
          correctCount: 1,
          wrongCount: 2,
          lastPicks: ['B'],
          lastCorrect: false,
          lastAnsweredAt: '2026-01-01T00:01:00.000Z',
        }),
        validBookmark({ qid: 2 }),
      ],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 6,
      accepted: [
        {
          qid: 1,
          correctCount: 3,
          wrongCount: 2,
          lastPicks: ['B'],
          lastCorrect: false,
          lastAnsweredAt: '2026-01-01T00:01:00.000Z',
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
        validBookmark({ qid: 2 }),
      ],
      rejected: [],
      snapshotRequired: true,
    })
  })

  it('returns conflict when client base revision is ahead and does not write Question Progress', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 5 }])

    const response = await postJson({
      baseRevision: 6,
      progress: [validAnswer()],
    })

    expect(response.status).toBe(409)
    expect(mocks.txOnConflictDoUpdate).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 5,
      accepted: [],
      rejected: [],
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Progress Revision',
      },
    })
  })

  it('does not create a Progress Revision row when an ahead client has no server revision', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([])

    const response = await postJson({
      baseRevision: 1,
      progress: [validAnswer()],
    })

    expect(response.status).toBe(409)
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 0,
      accepted: [],
      rejected: [],
      snapshotRequired: true,
      error: {
        code: 'revision_conflict',
        message: 'Client base revision is ahead of the current Progress Revision',
      },
    })
  })

  it('returns accepted no-op canonical records without advancing Progress Revision or touching row audits', async () => {
    signIn()
    mocks.txFor.mockResolvedValueOnce([{ revision: 8 }])
    mocks.txWhere.mockReturnValueOnce({ for: mocks.txFor }).mockResolvedValueOnce([
      {
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: new Date(pastIso),
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
    ])

    const response = await postJson({ baseRevision: 8, progress: [validAnswer()] })

    expect(response.status).toBe(200)
    expect(mocks.txOnConflictDoUpdate).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 8,
      accepted: [validAnswer()],
      rejected: [],
      snapshotRequired: false,
    })
  })
})
