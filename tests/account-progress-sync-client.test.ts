import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressSyncClientError } from '../src/lib/account-progress-sync-client'
import { fetchProgressSnapshot, postProgressSync } from '../src/lib/account-progress-sync-client'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cert: 'DVA-C02', revision: 1, progress: [] }),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchProgressSnapshot', () => {
  it('classifies network and malformed snapshot failures as temporary for retry callers', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'))

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toMatchObject({
      kind: 'temporary',
    } satisfies Partial<ProgressSyncClientError>)

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 1,
        progress: [
          {
            qid: 1,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['A'],
            lastCorrect: true,
            lastAnsweredAt: 'not-a-date',
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
      }),
    } as Response)

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toMatchObject({
      kind: 'temporary',
    } satisfies Partial<ProgressSyncClientError>)
  })

  it('classifies auth and temporary snapshot failures for recovery callers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response)

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    } satisfies Partial<ProgressSyncClientError>)

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toMatchObject({
      kind: 'temporary',
      status: 503,
    } satisfies Partial<ProgressSyncClientError>)
  })

  it('rejects a snapshot for a different certification than requested', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cert: 'CLF-C02', revision: 1, progress: [] }),
    } as Response)

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toThrow('Invalid progress snapshot')
  })

  it('rejects invalid revision and timestamp DTO values', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: Number.NaN,
        progress: [
          {
            qid: 1,
            correctCount: 1,
            wrongCount: 0,
            lastPicks: ['A'],
            lastCorrect: true,
            lastAnsweredAt: 'not-a-date',
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
      }),
    } as Response)

    await expect(fetchProgressSnapshot('DVA-C02')).rejects.toThrow('Invalid progress snapshot')
  })
})

describe('postProgressSync', () => {
  it('classifies network and malformed sync failures as temporary for retry callers', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'))

    await expect(postProgressSync('DVA-C02', 1, [])).rejects.toMatchObject({
      kind: 'temporary',
    } satisfies Partial<ProgressSyncClientError>)

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    } as Response)

    await expect(postProgressSync('DVA-C02', 1, [])).rejects.toMatchObject({
      kind: 'temporary',
    } satisfies Partial<ProgressSyncClientError>)
  })

  it('classifies sync response failures so callers can choose recovery paths', async () => {
    for (const [status, kind] of [
      [400, 'payload'],
      [401, 'auth'],
      [404, 'unknown-cert'],
      [429, 'temporary'],
      [500, 'temporary'],
    ] as const) {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status } as Response)

      await expect(postProgressSync('DVA-C02', 1, [])).rejects.toMatchObject({
        kind,
        status,
      } satisfies Partial<ProgressSyncClientError>)
    }
  })

  it('posts progress sync payload without client-only dirty metadata and parses canonical response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 4,
        accepted: [
          {
            qid: 1,
            correctCount: 2,
            wrongCount: 1,
            lastPicks: ['B', 'A'],
            lastCorrect: true,
            lastAnsweredAt: '2026-01-01T00:00:00.000Z',
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
        rejected: [],
        snapshotRequired: false,
      }),
    } as Response)

    const result = await postProgressSync('DVA-C02', 3, [
      {
        qid: 1,
        correctCount: 2,
        wrongCount: 1,
        lastPicks: ['A', 'B'],
        lastCorrect: true,
        lastAnsweredAt: Date.parse('2026-01-01T00:00:00.000Z'),
        bookmarked: false,
        bookmarkUpdatedAt: null,
        dirtySince: 1_700_000_000_000,
      },
    ])

    expect(fetch).toHaveBeenCalledWith('/api/progress/dva-c02/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({
        baseRevision: 3,
        progress: [
          {
            qid: 1,
            correctCount: 2,
            wrongCount: 1,
            lastPicks: ['A', 'B'],
            lastCorrect: true,
            lastAnsweredAt: '2026-01-01T00:00:00.000Z',
            bookmarked: false,
            bookmarkUpdatedAt: null,
          },
        ],
      }),
    })
    expect(result).toEqual({
      cert: 'DVA-C02',
      revision: 4,
      accepted: [
        {
          qid: 1,
          correctCount: 2,
          wrongCount: 1,
          lastPicks: ['A', 'B'],
          lastCorrect: true,
          lastAnsweredAt: Date.parse('2026-01-01T00:00:00.000Z'),
          bookmarked: false,
          bookmarkUpdatedAt: null,
        },
      ],
      rejected: [],
      snapshotRequired: false,
    })
  })

  it('returns structured revision conflict responses so callers can recover with a snapshot', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        cert: 'DVA-C02',
        revision: 7,
        accepted: [],
        rejected: [],
        snapshotRequired: true,
        error: {
          code: 'revision_conflict',
          message: 'Client base revision is ahead of the current Progress Revision',
        },
      }),
    } as Response)

    await expect(postProgressSync('DVA-C02', 8, [])).resolves.toEqual({
      cert: 'DVA-C02',
      revision: 7,
      accepted: [],
      rejected: [],
      snapshotRequired: true,
      errorCode: 'revision_conflict',
    })
  })
})
