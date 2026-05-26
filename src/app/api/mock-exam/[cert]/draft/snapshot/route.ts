import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/auth/options'
import { normalizeCert } from '@/data/loaders'
import { isReadyCertCode } from '@/lib/cert-catalog'
import { getAccountBackedMockExamDraftSnapshot } from '@/server/mock-exam-sync/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ cert: string }> }
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

  return json(await getAccountBackedMockExamDraftSnapshot(userId, cert))
}
