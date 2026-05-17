import { sql } from 'drizzle-orm'
import { boolean, check, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { Account } from 'next-auth'

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date', withTimezone: true }),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<Account['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
)

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentCert: text('current_cert').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
})

export const questionProgress = pgTable(
  'question_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cert: text('cert').notNull(),
    qid: integer('qid').notNull(),
    correctCount: integer('correct_count').notNull().default(0),
    wrongCount: integer('wrong_count').notNull().default(0),
    lastPicks: text('last_picks').array().notNull().default(sql`ARRAY[]::text[]`),
    lastCorrect: boolean('last_correct'),
    lastAnsweredAt: timestamp('last_answered_at', { mode: 'date', withTimezone: true }),
    bookmarked: boolean('bookmarked').notNull().default(false),
    bookmarkUpdatedAt: timestamp('bookmark_updated_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (progress) => [
    primaryKey({ columns: [progress.userId, progress.cert, progress.qid] }),
    check('question_progress_qid_positive', sql`${progress.qid} > 0`),
    check(
      'question_progress_counts_non_negative',
      sql`${progress.correctCount} >= 0 AND ${progress.wrongCount} >= 0`,
    ),
    check(
      'question_progress_answer_state_consistent',
      sql`((array_length(${progress.lastPicks}, 1) IS NULL AND ${progress.lastCorrect} IS NULL AND ${progress.lastAnsweredAt} IS NULL AND ${progress.correctCount} = 0 AND ${progress.wrongCount} = 0) OR (array_length(${progress.lastPicks}, 1) IS NOT NULL AND ${progress.lastCorrect} IS NOT NULL AND ${progress.lastAnsweredAt} IS NOT NULL AND (${progress.correctCount} > 0 OR ${progress.wrongCount} > 0)))`,
    ),
    check(
      'question_progress_non_empty',
      sql`array_length(${progress.lastPicks}, 1) IS NOT NULL OR ${progress.bookmarkUpdatedAt} IS NOT NULL`,
    ),
    check(
      'question_progress_bookmark_timestamp_required',
      sql`${progress.bookmarked} = false OR ${progress.bookmarkUpdatedAt} IS NOT NULL`,
    ),
    check(
      'question_progress_latest_correctness_count_consistent',
      sql`${progress.lastCorrect} IS NULL OR (${progress.lastCorrect} = true AND ${progress.correctCount} > 0) OR (${progress.lastCorrect} = false AND ${progress.wrongCount} > 0)`,
    ),
  ],
)

export const certProgressRevisions = pgTable(
  'cert_progress_revisions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cert: text('cert').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (revision) => [
    primaryKey({ columns: [revision.userId, revision.cert] }),
    check('cert_progress_revisions_revision_non_negative', sql`${revision.revision} >= 0`),
  ],
)
