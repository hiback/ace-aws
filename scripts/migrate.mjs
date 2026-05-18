import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../drizzle')
const pool = new Pool({ connectionString })

async function waitForDatabase() {
  const timeoutMs = 30_000
  const retryDelayMs = 1_000
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() <= deadline) {
    try {
      await pool.query('select 1')
      return
    } catch (error) {
      lastError = error
      console.warn('Postgres is not ready yet; retrying before migrations...')
      await sleep(retryDelayMs)
    }
  }

  throw lastError ?? new Error('Timed out waiting for Postgres')
}

try {
  await waitForDatabase()
  await migrate(drizzle(pool), { migrationsFolder })
  console.log('Database migrations are up to date')
} finally {
  await pool.end()
}
