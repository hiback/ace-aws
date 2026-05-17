import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  returning: vi.fn(),
}))

vi.mock('next-auth/next', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/auth/options', () => ({ authOptions: {} }))
vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}))

import { GET, PATCH } from '../src/app/api/account/preferences/route'

function patch(body: string) {
  return PATCH(new Request('http://localhost/api/account/preferences', { method: 'PATCH', body }))
}

beforeEach(() => {
  mocks.getServerSession.mockReset()
  mocks.select.mockReset()
  mocks.insert.mockReset()
  mocks.selectLimit.mockReset()
  mocks.insertValues.mockReset()
  mocks.onConflictDoUpdate.mockReset()
  mocks.returning.mockReset()

  mocks.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: mocks.selectLimit })),
    })),
  })
  mocks.insert.mockReturnValue({
    values: mocks.insertValues,
  })
  mocks.insertValues.mockReturnValue({
    onConflictDoUpdate: mocks.onConflictDoUpdate,
  })
  mocks.onConflictDoUpdate.mockReturnValue({
    returning: mocks.returning,
  })
})

describe('account preferences API', () => {
  it('returns 401 for unauthenticated GET', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns null when authenticated user has no row', async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mocks.selectLimit.mockResolvedValueOnce([])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ currentCert: null })
  })

  it('returns the stored ready cert', async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mocks.selectLimit.mockResolvedValueOnce([{ currentCert: 'CLF-C02' }])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ currentCert: 'CLF-C02' })
  })

  it('treats an invalid stored cert as absent', async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mocks.selectLimit.mockResolvedValueOnce([{ currentCert: 'SAA-C03' }])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ currentCert: null })
  })

  it('returns 401 for unauthenticated PATCH', async () => {
    mocks.getServerSession.mockResolvedValueOnce(null)

    const response = await patch(JSON.stringify({ currentCert: 'DVA-C02' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects invalid PATCH bodies', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } })

    for (const body of ['not-json', '{}', JSON.stringify({ currentCert: 'SAA-C03' })]) {
      const response = await patch(body)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid currentCert' })
    }
  })

  it('upserts the ready cert for authenticated users', async () => {
    mocks.getServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mocks.returning.mockResolvedValueOnce([{ currentCert: 'DVA-C02' }])

    const response = await patch(JSON.stringify({ currentCert: 'DVA-C02' }))

    expect(response.status).toBe(200)
    expect(mocks.insertValues).toHaveBeenCalledWith({ userId: 'user-1', currentCert: 'DVA-C02' })
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({ currentCert: 'DVA-C02' })
  })
})
