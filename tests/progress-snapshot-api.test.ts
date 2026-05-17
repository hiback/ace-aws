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
  txOrderBy: vi.fn(),
}))

vi.mock('next-auth/next', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/auth/options', () => ({ authOptions: {} }))
vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

import { dynamic, GET, runtime } from '../src/app/api/progress/[cert]/snapshot/route'

function snapshot(cert: string) {
  return GET(new Request(`http://localhost/api/progress/${cert}/snapshot`), {
    params: Promise.resolve({ cert }),
  })
}

beforeEach(() => {
  mocks.getServerSession.mockReset()
  mocks.transaction.mockReset()
  mocks.txInsert.mockReset()
  mocks.txInsertValues.mockReset()
  mocks.txOnConflictDoNothing.mockReset()
  mocks.txSelect.mockReset()
  mocks.txFrom.mockReset()
  mocks.txWhere.mockReset()
  mocks.txFor.mockReset()
  mocks.txOrderBy.mockReset()

  mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues })
  mocks.txInsertValues.mockReturnValue({ onConflictDoNothing: mocks.txOnConflictDoNothing })
  mocks.txSelect.mockReturnValue({ from: mocks.txFrom })
  mocks.txFrom.mockReturnValue({ where: mocks.txWhere })
  mocks.txWhere
    .mockReturnValueOnce({ for: mocks.txFor })
    .mockReturnValue({ orderBy: mocks.txOrderBy })
  mocks.txFor.mockResolvedValue([{ revision: 0 }])
  mocks.transaction.mockImplementation((callback) =>
    callback({
      insert: mocks.txInsert,
      select: mocks.txSelect,
    }),
  )
})

describe('Progress Snapshot API', () => {
  it('uses private Node.js route semantics', () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
  })

  it('returns 401 without writing Account-Backed Progress when unauthenticated', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null)

    const response = await snapshot('dva-c02')

    expect(response.status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 for unknown certifications', async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })

    const response = await snapshot('saa-c03')

    expect(response.status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Certification not found' })
  })

  it('creates or reuses revision 0 and returns a sparse Progress Snapshot ordered by qid', async () => {
    const answeredAt = new Date('2026-01-01T00:00:00.000Z')
    const bookmarkAt = new Date('2026-01-02T00:00:00.000Z')
    const tombstoneAt = new Date('2026-01-03T00:00:00.000Z')

    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mocks.txOrderBy.mockResolvedValueOnce([
      {
        cert: 'DVA-C02',
        qid: 3,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: false,
        bookmarkUpdatedAt: tombstoneAt,
      },
      {
        cert: 'DVA-C02',
        qid: 1,
        correctCount: 1,
        wrongCount: 0,
        lastPicks: ['A'],
        lastCorrect: true,
        lastAnsweredAt: answeredAt,
        bookmarked: false,
        bookmarkUpdatedAt: null,
      },
      {
        cert: 'DVA-C02',
        qid: 2,
        correctCount: 0,
        wrongCount: 0,
        lastPicks: [],
        lastCorrect: null,
        lastAnsweredAt: null,
        bookmarked: true,
        bookmarkUpdatedAt: bookmarkAt,
      },
    ])

    const response = await snapshot('dva-c02')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.txInsertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      cert: 'DVA-C02',
      revision: 0,
    })
    expect(mocks.txFor).toHaveBeenCalledWith('update')
    await expect(response.json()).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 0,
      progress: [
        {
          qid: 1,
          correctCount: 1,
          wrongCount: 0,
          lastPicks: ['A'],
          lastCorrect: true,
          lastAnsweredAt: '2026-01-01T00:00:00.000Z',
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
        {
          qid: 2,
          correctCount: 0,
          wrongCount: 0,
          lastPicks: [],
          lastCorrect: null,
          lastAnsweredAt: null,
          bookmarked: true,
          bookmarkUpdatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          qid: 3,
          correctCount: 0,
          wrongCount: 0,
          lastPicks: [],
          lastCorrect: null,
          lastAnsweredAt: null,
          bookmarked: false,
          bookmarkUpdatedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    })
  })
})
