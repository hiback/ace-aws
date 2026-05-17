import { describe, expect, it } from 'vitest'
import { DELETE, POST } from '../src/app/api/onboarding/route'

function getSetCookies(response: Response) {
  return response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']
}

function postOnboarding(body: string) {
  return POST(
    new Request('http://localhost/api/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}

describe('onboarding API', () => {
  it('sets the auth gate cookie for complete-auth-gate', async () => {
    const response = await postOnboarding(JSON.stringify({ action: 'complete-auth-gate' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    const setCookies = getSetCookies(response)
    expect(setCookies).toHaveLength(1)
    expect(setCookies[0]).toContain('ace-aws-auth-gate=completed')
    expect(setCookies[0]).toContain('Path=/')
    expect(setCookies[0]).toContain('Max-Age=31536000')
    expect(setCookies[0]).toContain('HttpOnly')
    expect(setCookies[0]).toContain('SameSite=Lax')
  })

  it('sets the cert selected cookie for complete-cert-selection', async () => {
    const response = await postOnboarding(JSON.stringify({ action: 'complete-cert-selection' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    const setCookies = getSetCookies(response)
    expect(setCookies).toHaveLength(1)
    expect(setCookies[0]).toContain('ace-aws-cert-selected=true')
    expect(setCookies[0]).toContain('Path=/')
    expect(setCookies[0]).toContain('Max-Age=31536000')
    expect(setCookies[0]).toContain('HttpOnly')
    expect(setCookies[0]).toContain('SameSite=Lax')
  })

  it('rejects invalid actions without setting cookies', async () => {
    const response = await postOnboarding(JSON.stringify({ action: 'unknown' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid onboarding action',
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('rejects malformed JSON without setting cookies', async () => {
    const response = await postOnboarding('not-json')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('clears both onboarding cookies', async () => {
    const response = await DELETE()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    const setCookies = getSetCookies(response)
    expect(setCookies).toHaveLength(2)
    expect(setCookies[0]).toContain('ace-aws-auth-gate=')
    expect(setCookies[0]).toContain('Max-Age=0')
    expect(setCookies[1]).toContain('ace-aws-cert-selected=')
    expect(setCookies[1]).toContain('Max-Age=0')
  })
})
