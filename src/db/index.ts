import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build'
const connectionString =
  process.env.DATABASE_URL ||
  (isProductionBuild ? 'postgres://build:build@localhost:5432/build' : undefined)

if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const globalForDb = globalThis as typeof globalThis & {
  aceAwsPgPool?: Pool
}

const pool = globalForDb.aceAwsPgPool ? globalForDb.aceAwsPgPool : new Pool({ connectionString })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.aceAwsPgPool = pool
}

export const db = drizzle(pool, { schema })
export type Db = typeof db
