import type { NextRequest, NextResponse } from 'next/server'
import {
  ONBOARDING_AUTH_GATE_COOKIE,
  ONBOARDING_AUTH_GATE_VALUE,
  ONBOARDING_CERT_SELECTED_COOKIE,
  ONBOARDING_CERT_SELECTED_VALUE,
  ONBOARDING_COOKIE_MAX_AGE,
} from '@/lib/onboarding'

type CookieResponse = Pick<NextResponse, 'headers'>
type CookieRequest = Pick<NextRequest, 'cookies'>

function appendCookie(response: CookieResponse, name: string, value: string, maxAge: number) {
  response.headers.append(
    'set-cookie',
    `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
  )
}

export function setAuthGateCookie(response: CookieResponse) {
  appendCookie(
    response,
    ONBOARDING_AUTH_GATE_COOKIE,
    ONBOARDING_AUTH_GATE_VALUE,
    ONBOARDING_COOKIE_MAX_AGE,
  )
}

export function setCertSelectedCookie(response: CookieResponse) {
  appendCookie(
    response,
    ONBOARDING_CERT_SELECTED_COOKIE,
    ONBOARDING_CERT_SELECTED_VALUE,
    ONBOARDING_COOKIE_MAX_AGE,
  )
}

export function clearOnboardingCookies(response: CookieResponse) {
  appendCookie(response, ONBOARDING_AUTH_GATE_COOKIE, '', 0)
  appendCookie(response, ONBOARDING_CERT_SELECTED_COOKIE, '', 0)
}

export function hasCompletedAuthGate(request: CookieRequest) {
  return request.cookies.get(ONBOARDING_AUTH_GATE_COOKIE)?.value === ONBOARDING_AUTH_GATE_VALUE
}

export function hasSelectedCert(request: CookieRequest) {
  return (
    request.cookies.get(ONBOARDING_CERT_SELECTED_COOKIE)?.value === ONBOARDING_CERT_SELECTED_VALUE
  )
}
