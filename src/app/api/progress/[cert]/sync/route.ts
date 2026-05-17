import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/auth/options'
import { normalizeCert } from '@/data/loaders'
import { isReadyCertCode } from '@/lib/cert-catalog'
import { parseProgressSyncPayload } from '@/server/progress-sync/contract'
import { getQuestionBankIndex } from '@/server/progress-sync/question-bank-index'
import { syncAccountBackedProgress } from '@/server/progress-sync/service'

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

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, { status })
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get('content-type')
  return contentType?.toLowerCase().split(';', 1)[0]?.trim() === 'application/json'
}

export async function POST(request: Request, context: RouteContext) {
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

  if (!hasJsonContentType(request)) {
    return error('unsupported_media_type', 'Progress Sync requires application/json', 415)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return error('invalid_json', 'Request body must be valid JSON', 400)
  }

  const bank = await getQuestionBankIndex(cert)
  const parsed = parseProgressSyncPayload(cert, payload, bank)
  if ('error' in parsed) return error(parsed.error.code, parsed.error.message, 400)

  const result = await syncAccountBackedProgress(userId, parsed)
  return json(result.body, { status: result.status })
}
