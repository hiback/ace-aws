import type { CertCode } from '@/data/types'
import { type AccountPreferencesResponse, parseAccountCurrentCert } from '@/lib/account-preferences'

async function readPreferencesResponse(response: Response): Promise<AccountPreferencesResponse> {
  const body = (await response.json()) as { currentCert?: unknown }
  return { currentCert: parseAccountCurrentCert(body.currentCert) }
}

export async function fetchAccountPreferences(): Promise<AccountPreferencesResponse> {
  const response = await fetch('/api/account/preferences')
  if (!response.ok) throw new Error('Failed to fetch account preferences')
  return readPreferencesResponse(response)
}

export async function saveAccountCurrentCert(
  currentCert: CertCode,
): Promise<AccountPreferencesResponse> {
  const response = await fetch('/api/account/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentCert }),
  })
  if (!response.ok) throw new Error('Failed to save account preferences')
  return readPreferencesResponse(response)
}
