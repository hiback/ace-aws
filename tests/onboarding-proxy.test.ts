// @vitest-environment node

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_AUTH_GATE_COOKIE,
  ONBOARDING_AUTH_GATE_VALUE,
  ONBOARDING_CERT_SELECTED_COOKIE,
  ONBOARDING_CERT_SELECTED_VALUE,
} from '../src/lib/onboarding'
import { config, proxy } from '../src/proxy'

const AUTH_GATE_COOKIE = `${ONBOARDING_AUTH_GATE_COOKIE}=${ONBOARDING_AUTH_GATE_VALUE}`
const CERT_SELECTED_COOKIE = `${ONBOARDING_CERT_SELECTED_COOKIE}=${ONBOARDING_CERT_SELECTED_VALUE}`

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: cookie ? new Headers({ cookie }) : undefined,
  })
}

function expectAllowed(pathname: string, cookie?: string) {
  const response = proxy(request(pathname, cookie))

  expect(response.status).toBe(200)
  expect(response.headers.get('location')).toBeNull()
}

function expectRedirect(pathname: string, location: string, cookie?: string) {
  const response = proxy(request(pathname, cookie))

  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe(`http://localhost${location}`)
}

describe('onboarding proxy', () => {
  it('does not exclude non-api paths from the matcher', () => {
    expect(config.matcher[0]).toContain('api/')
    expect(config.matcher[0]).not.toContain('api|')
  })

  it.each([
    '/',
    '/select-cert',
    '/settings',
    '/practice/dva-c02/1',
    '/list',
    '/list/wrong',
  ])('redirects %s to login when cookies are missing', (pathname) => {
    expectRedirect(pathname, '/login')
  })

  it('allows login when cookies are missing', () => {
    expectAllowed('/login')
  })

  it('redirects api-like app paths to login when cookies are missing', () => {
    expectRedirect('/apiary', '/login')
  })

  it('allows select-cert when only auth gate is complete', () => {
    expectAllowed('/select-cert', AUTH_GATE_COOKIE)
  })

  it.each([
    '/',
    '/settings',
    '/practice/dva-c02/1',
    '/list/bookmarks',
  ])('redirects %s to select-cert when cert is missing', (pathname) => {
    expectRedirect(pathname, '/select-cert', AUTH_GATE_COOKIE)
  })

  it('redirects login to select-cert when only auth gate is complete', () => {
    expectRedirect('/login', '/select-cert', AUTH_GATE_COOKIE)
  })

  it.each([
    '/login',
    '/select-cert',
  ])('redirects %s home when onboarding is complete', (pathname) => {
    expectRedirect(pathname, '/', `${AUTH_GATE_COOKIE}; ${CERT_SELECTED_COOKIE}`)
  })

  it('allows select-cert switch mode when onboarding is complete', () => {
    expectAllowed('/select-cert?mode=switch', `${AUTH_GATE_COOKIE}; ${CERT_SELECTED_COOKIE}`)
  })

  it.each([
    '/',
    '/settings',
    '/practice/dva-c02/1',
    '/list/wrong',
  ])('allows %s when onboarding is complete', (pathname) => {
    expectAllowed(pathname, `${AUTH_GATE_COOKIE}; ${CERT_SELECTED_COOKIE}`)
  })

  it.each([
    '/api/auth/session',
    '/_next/static/chunk.js',
    '/logo.png',
    '/favicon.ico',
  ])('allows excluded path %s when called directly', (pathname) => {
    expectAllowed(pathname)
  })
})
