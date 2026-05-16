import { afterEach, describe, expect, it, vi } from 'vitest'

async function importAuthOptions() {
  return import('../src/auth/options')
}

describe('auth environment handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws outside build when GitHub OAuth env is missing', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', '')
    vi.stubEnv('AUTH_GITHUB_SECRET', '')
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/ace_aws')
    vi.stubEnv('NEXT_PHASE', '')

    await expect(importAuthOptions()).rejects.toThrow(
      'AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required',
    )
  })

  it('throws outside build when auth secret env is missing', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', 'github-id')
    vi.stubEnv('AUTH_GITHUB_SECRET', 'github-secret')
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/ace_aws')
    vi.stubEnv('NEXT_PHASE', '')

    await expect(importAuthOptions()).rejects.toThrow('AUTH_SECRET is required')
  })

  it('throws outside build when auth URL env is missing', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', 'github-id')
    vi.stubEnv('AUTH_GITHUB_SECRET', 'github-secret')
    vi.stubEnv('AUTH_SECRET', 'secret')
    vi.stubEnv('AUTH_URL', '')
    vi.stubEnv('NEXTAUTH_URL', '')
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/ace_aws')
    vi.stubEnv('NEXT_PHASE', '')

    await expect(importAuthOptions()).rejects.toThrow('AUTH_URL is required')
  })

  it('bridges AUTH env over existing NEXTAUTH env for NextAuth v4', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', 'github-id')
    vi.stubEnv('AUTH_GITHUB_SECRET', 'github-secret')
    vi.stubEnv('AUTH_SECRET', 'auth-secret')
    vi.stubEnv('NEXTAUTH_SECRET', 'nextauth-secret')
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('NEXTAUTH_URL', 'http://old.localhost:3000')
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/ace_aws')
    vi.stubEnv('NEXT_PHASE', '')

    const { authOptions } = await importAuthOptions()

    expect(authOptions.secret).toBe('auth-secret')
    expect(process.env.NEXTAUTH_SECRET).toBe('auth-secret')
    expect(process.env.NEXTAUTH_URL).toBe('http://localhost:3000')
  })

  it('does not expose a separate GitHub username field in the session', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', 'github-id')
    vi.stubEnv('AUTH_GITHUB_SECRET', 'github-secret')
    vi.stubEnv('AUTH_SECRET', 'secret')
    vi.stubEnv('AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/ace_aws')
    vi.stubEnv('NEXT_PHASE', '')

    const { authOptions } = await importAuthOptions()
    const session = {
      user: { id: 'user-1', name: 'hiback', email: 'hiback@example.com', image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }

    const result = await authOptions.callbacks?.session?.({
      session,
      token: {},
      user: {
        id: 'user-1',
        name: 'hiback',
        email: 'hiback@example.com',
        emailVerified: null,
        image: null,
      },
      newSession: undefined,
      trigger: 'update',
    })

    expect(result?.user).toMatchObject({ id: 'user-1', name: 'hiback' })
    expect(result?.user).not.toHaveProperty('githubUsername')
  })

  it('allows import during the Next production build phase without GitHub OAuth env', async () => {
    vi.resetModules()
    vi.stubEnv('AUTH_GITHUB_ID', '')
    vi.stubEnv('AUTH_GITHUB_SECRET', '')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    await expect(importAuthOptions()).resolves.toHaveProperty('authOptions')
  })
})
