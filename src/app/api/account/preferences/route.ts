import { eq, sql } from 'drizzle-orm'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/auth/options'
import { db } from '@/db'
import { userPreferences } from '@/db/schema'
import {
  parseAccountCurrentCert,
  parseAccountPreferencesPatchBody,
} from '@/lib/account-preferences'

function sessionUserId(session: { user?: { id?: unknown } } | null): string | null {
  const id = session?.user?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export async function GET() {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({ currentCert: userPreferences.currentCert })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  return Response.json({ currentCert: parseAccountCurrentCert(rows[0]?.currentCert) })
}

export async function PATCH(request: Request) {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid currentCert' }, { status: 400 })
  }

  const currentCert = parseAccountPreferencesPatchBody(body)
  if (!currentCert) return Response.json({ error: 'Invalid currentCert' }, { status: 400 })

  const rows = await db
    .insert(userPreferences)
    .values({ userId, currentCert })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { currentCert, updatedAt: sql`now()` },
    })
    .returning({ currentCert: userPreferences.currentCert })

  return Response.json({
    currentCert: parseAccountCurrentCert(rows[0]?.currentCert) ?? currentCert,
  })
}
