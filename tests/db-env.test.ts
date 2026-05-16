import type { Pool } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const globalForDb = globalThis as typeof globalThis & {
  aceAwsPgPool?: Pool
}

async function cleanupDbPool() {
  const pool = globalForDb.aceAwsPgPool
  delete globalForDb.aceAwsPgPool

  if (pool && typeof pool.end === 'function') {
    await pool.end()
  }
}

async function importDb() {
  return import('../src/db')
}

describe('database environment handling', () => {
  beforeEach(async () => {
    await cleanupDbPool()
    vi.resetModules()
  })

  afterEach(async () => {
    await cleanupDbPool()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws outside build when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('NEXT_PHASE', '')

    await expect(importDb()).rejects.toThrow('DATABASE_URL is required')
  })

  it('allows import during the Next production build phase without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    await expect(importDb()).resolves.toHaveProperty('db')
  })
})
