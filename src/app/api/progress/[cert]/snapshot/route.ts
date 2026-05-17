import { and, asc, eq } from 'drizzle-orm'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/auth/options'
import { normalizeCert } from '@/data/loaders'
import { db } from '@/db'
import { certProgressRevisions, questionProgress } from '@/db/schema'
import { isReadyCertCode } from '@/lib/cert-catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ cert: string }>
}

type Session = { user?: { id?: unknown } } | null

function sessionUserId(session: Session): string | null {
  const id = session?.user?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(body, { ...init, headers })
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return json({ error: 'Unauthorized' }, { status: 401 })

  const { cert: certParam } = await context.params
  let cert: ReturnType<typeof normalizeCert>
  try {
    cert = normalizeCert(certParam)
  } catch {
    return json({ error: 'Certification not found' }, { status: 404 })
  }

  if (!isReadyCertCode(cert)) return json({ error: 'Certification not found' }, { status: 404 })

  const snapshot = await db.transaction(async (tx) => {
    await tx
      .insert(certProgressRevisions)
      .values({ userId, cert, revision: 0 })
      .onConflictDoNothing({
        target: [certProgressRevisions.userId, certProgressRevisions.cert],
      })

    const revisionQuery = tx
      .select({ revision: certProgressRevisions.revision })
      .from(certProgressRevisions)
      .where(and(eq(certProgressRevisions.userId, userId), eq(certProgressRevisions.cert, cert)))
    const revisionRows = await ('for' in revisionQuery
      ? revisionQuery.for('update')
      : revisionQuery)

    const rows = await tx
      .select({
        qid: questionProgress.qid,
        correctCount: questionProgress.correctCount,
        wrongCount: questionProgress.wrongCount,
        lastPicks: questionProgress.lastPicks,
        lastCorrect: questionProgress.lastCorrect,
        lastAnsweredAt: questionProgress.lastAnsweredAt,
        bookmarked: questionProgress.bookmarked,
        bookmarkUpdatedAt: questionProgress.bookmarkUpdatedAt,
      })
      .from(questionProgress)
      .where(and(eq(questionProgress.userId, userId), eq(questionProgress.cert, cert)))
      .orderBy(asc(questionProgress.qid))

    return {
      revision: revisionRows[0]?.revision ?? 0,
      progress: rows
        .toSorted((left, right) => left.qid - right.qid)
        .map((row) => ({
          qid: row.qid,
          correctCount: row.correctCount,
          wrongCount: row.wrongCount,
          lastPicks: row.lastPicks,
          lastCorrect: row.lastCorrect,
          lastAnsweredAt: toIso(row.lastAnsweredAt),
          bookmarked: row.bookmarked,
          bookmarkUpdatedAt: toIso(row.bookmarkUpdatedAt),
        })),
    }
  })

  return json({ cert, revision: snapshot.revision, progress: snapshot.progress })
}
