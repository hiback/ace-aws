import { NextResponse } from 'next/server'
import { isOnboardingAction } from '@/lib/onboarding'
import {
  clearOnboardingCookies,
  setAuthGateCookie,
  setCertSelectedCookie,
} from '@/lib/onboarding-cookies'

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body && typeof body === 'object' && 'action' in body ? body.action : undefined

  if (!isOnboardingAction(action)) {
    return NextResponse.json({ error: 'Invalid onboarding action' }, { status: 400 })
  }

  const response = NextResponse.json({ ok: true })

  if (action === 'complete-auth-gate') {
    setAuthGateCookie(response)
  } else {
    setCertSelectedCookie(response)
  }

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  clearOnboardingCookies(response)
  return response
}
