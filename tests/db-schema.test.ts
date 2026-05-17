import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  accounts,
  certProgressRevisions,
  questionProgress,
  sessions,
  userPreferences,
  users,
  verificationTokens,
} from '../src/db/schema'

function readGeneratedMigrationSql() {
  const drizzleDir = join(process.cwd(), 'drizzle')
  const sqlFiles = readdirSync(drizzleDir).filter((file) => file.endsWith('.sql'))

  expect(sqlFiles).toHaveLength(1)

  return readFileSync(join(drizzleDir, sqlFiles[0]), 'utf8')
}

describe('database schema', () => {
  it('uses explicit table names for auth and progress tables', () => {
    expect(getTableName(users)).toBe('users')
    expect(getTableName(accounts)).toBe('accounts')
    expect(getTableName(sessions)).toBe('sessions')
    expect(getTableName(verificationTokens)).toBe('verification_tokens')
    expect(getTableName(userPreferences)).toBe('user_preferences')
    expect(getTableName(questionProgress)).toBe('question_progress')
    expect(getTableName(certProgressRevisions)).toBe('cert_progress_revisions')
  })

  it('exposes columns needed by Auth.js and sync planning', () => {
    expect(users.id).toBeDefined()
    expect(users).not.toHaveProperty('githubUsername')
    expect(accounts.providerAccountId).toBeDefined()
    expect(sessions.sessionToken).toBeDefined()
    expect(verificationTokens.token).toBeDefined()
    expect(userPreferences.userId).toBeDefined()
    expect(userPreferences.currentCert).toBeDefined()
    expect(userPreferences.updatedAt).toBeDefined()
    expect(questionProgress.lastPicks).toBeDefined()
    expect(questionProgress.bookmarkUpdatedAt).toBeDefined()
    expect(certProgressRevisions.revision).toBeDefined()
  })

  it('generates migration SQL for auth and progress schema intent', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).not.toContain('github_username')
    expect(sql).toContain('"updated_at" timestamp with time zone DEFAULT now() NOT NULL')
    expect(sql).toContain('"user_id" text PRIMARY KEY NOT NULL')
    expect(sql).toContain('"current_cert" text NOT NULL')
    expect(sql).toContain('"last_answered_at" timestamp with time zone')
    expect(sql).toContain('"bookmark_updated_at" timestamp with time zone')
    expect(sql).toContain('"last_picks" text[] DEFAULT ARRAY[]::text[] NOT NULL')
    expect(sql).toContain(
      'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain(
      'ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain(
      'ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain(
      'ALTER TABLE "question_progress" ADD CONSTRAINT "question_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain(
      'ALTER TABLE "cert_progress_revisions" ADD CONSTRAINT "cert_progress_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    )
    expect(sql).toContain(
      'CONSTRAINT "cert_progress_revisions_user_id_cert_pk" PRIMARY KEY("user_id","cert")',
    )
    expect(sql).toContain(
      'CONSTRAINT "question_progress_user_id_cert_qid_pk" PRIMARY KEY("user_id","cert","qid")',
    )
    expect(sql).toContain('CONSTRAINT "question_progress_qid_positive" CHECK ("qid" > 0)')
    expect(sql).toContain(
      'CONSTRAINT "question_progress_counts_non_negative" CHECK ("correct_count" >= 0 AND "wrong_count" >= 0)',
    )
    expect(sql).toContain('CONSTRAINT "question_progress_answer_state_consistent" CHECK')
    expect(sql).not.toContain('"correct_count" + "wrong_count"')
    expect(sql).toContain('CONSTRAINT "question_progress_non_empty" CHECK')
    expect(sql).toContain(
      'CONSTRAINT "question_progress_bookmark_timestamp_required" CHECK ("bookmarked" = false OR "bookmark_updated_at" IS NOT NULL)',
    )
    expect(sql).toContain(
      'CONSTRAINT "question_progress_latest_correctness_count_consistent" CHECK',
    )
    expect(sql).toContain(
      'CONSTRAINT "cert_progress_revisions_revision_non_negative" CHECK ("revision" >= 0)',
    )
    expect(sql).not.toContain('question_progress_user_cert_qid_unique')
    expect(sql).not.toContain('cert_progress_revisions_user_cert_unique')

    for (const tableName of [
      'users',
      'accounts',
      'sessions',
      'verification_tokens',
      'user_preferences',
      'question_progress',
      'cert_progress_revisions',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${tableName}"`)
    }
  })
})
