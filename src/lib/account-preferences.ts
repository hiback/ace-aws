import type { CertCode } from '@/data/types'
import { isReadyCertCode } from '@/lib/cert-catalog'

export interface AccountPreferencesResponse {
  currentCert: CertCode | null
}

export function parseAccountCurrentCert(value: unknown): CertCode | null {
  if (typeof value !== 'string') return null
  return isReadyCertCode(value) ? value : null
}

export function parseAccountPreferencesPatchBody(value: unknown): CertCode | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return parseAccountCurrentCert((value as { currentCert?: unknown }).currentCert)
}
