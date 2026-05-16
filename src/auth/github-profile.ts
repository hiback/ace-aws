export function githubUsernameFromProfile(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object' || !('login' in profile)) return null
  const login = (profile as { login?: unknown }).login
  return typeof login === 'string' && login.length > 0 ? login : null
}
