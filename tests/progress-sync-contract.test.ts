import { describe, expect, it } from 'vitest'
import { parseProgressSyncPayload } from '../src/server/progress-sync/contract'
import type { QuestionBankIndex } from '../src/server/progress-sync/question-bank-index'

const bank: QuestionBankIndex = {
  questionCount: 2,
  questions: new Map([
    [1, { id: 1, type: 'single', answerCount: 1, options: new Set(['A', 'B']) }],
  ]),
}

describe('Progress Sync contract', () => {
  it('accepts daily question stats buckets without answeredCount', () => {
    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId: 'client:device-1',
            correctCount: 2,
            wrongCount: 1,
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toMatchObject({
      cert: 'DVA-C02',
      baseRevision: 0,
      dailyStats: [
        {
          date: '2026-01-01',
          sourceId: 'client:device-1',
          correctCount: 2,
          wrongCount: 1,
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
      ],
    })
  })

  it('rejects daily question stats buckets that include answeredCount', () => {
    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId: 'client:device-1',
            correctCount: 2,
            wrongCount: 1,
            answeredCount: 3,
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toEqual({
      error: {
        code: 'invalid_daily_stats',
        message: 'Invalid daily question stats',
      },
    })
  })

  it('rejects daily question stats buckets with malformed source id namespaces', () => {
    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId: 'device-1',
            correctCount: 2,
            wrongCount: 1,
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toEqual({
      error: {
        code: 'invalid_daily_stats',
        message: 'Invalid daily question stats',
      },
    })
  })

  it('accepts daily question stats source ids up to 64 characters', () => {
    const sourceId = `client:${'a'.repeat(57)}`
    expect(sourceId).toHaveLength(64)

    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId,
            correctCount: 2,
            wrongCount: 1,
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toMatchObject({ dailyStats: [{ sourceId }] })
  })

  it('rejects daily question stats source ids longer than 64 characters', () => {
    const sourceId = `client:${'a'.repeat(58)}`
    expect(sourceId).toHaveLength(65)

    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId,
            correctCount: 2,
            wrongCount: 1,
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toEqual({
      error: {
        code: 'invalid_daily_stats',
        message: 'Invalid daily question stats',
      },
    })
  })

  it('rejects daily question stats payloads with more than 400 buckets', () => {
    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: Array.from({ length: 401 }, (_, index) => ({
          date: '2026-01-01',
          sourceId: `client:${index}`,
          correctCount: 1,
          wrongCount: 0,
          updatedAt: '2026-01-01T12:00:00.000Z',
        })),
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'Daily stats payload is too large',
      },
    })
  })

  it('rejects daily question stats buckets with non-calendar local dates', () => {
    for (const date of ['2026-99-99', '2025-02-29']) {
      const parsed = parseProgressSyncPayload(
        'DVA-C02',
        {
          baseRevision: 0,
          progress: [],
          dailyStats: [
            {
              date,
              sourceId: 'client:device-1',
              correctCount: 2,
              wrongCount: 1,
              updatedAt: '2026-01-01T12:00:00.000Z',
            },
          ],
        },
        bank,
        Date.parse('2026-01-01T12:00:00.000Z'),
      )

      expect(parsed).toEqual({
        error: {
          code: 'invalid_daily_stats',
          message: 'Invalid daily question stats',
        },
      })
    }
  })

  it('rejects daily question stats buckets with clearly future updatedAt values', () => {
    const parsed = parseProgressSyncPayload(
      'DVA-C02',
      {
        baseRevision: 0,
        progress: [],
        dailyStats: [
          {
            date: '2026-01-01',
            sourceId: 'client:device-1',
            correctCount: 2,
            wrongCount: 1,
            updatedAt: '2026-01-01T12:06:00.001Z',
          },
        ],
      },
      bank,
      Date.parse('2026-01-01T12:00:00.000Z'),
    )

    expect(parsed).toEqual({
      error: {
        code: 'invalid_daily_stats',
        message: 'Invalid daily question stats',
      },
    })
  })
})
