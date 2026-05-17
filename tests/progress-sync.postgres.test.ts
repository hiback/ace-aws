import { describe, it } from 'vitest'

const databaseUrl = process.env.PROGRESS_SYNC_TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('Progress Sync Postgres integration', () => {
  it('is enabled with PROGRESS_SYNC_TEST_DATABASE_URL or DATABASE_URL', () => {
    // Placeholder harness for optional DB-backed tests; skipped in local/CI runs without Postgres.
  })
})
