import { describe, expect, it } from 'vitest'
import { githubUsernameFromProfile } from '../src/auth/github-profile'

describe('githubUsernameFromProfile', () => {
  it('returns the GitHub login when present', () => {
    expect(githubUsernameFromProfile({ login: 'hiback' })).toBe('hiback')
  })

  it('returns null for missing or malformed login values', () => {
    expect(githubUsernameFromProfile(null)).toBeNull()
    expect(githubUsernameFromProfile({})).toBeNull()
    expect(githubUsernameFromProfile({ login: 123 })).toBeNull()
  })
})
