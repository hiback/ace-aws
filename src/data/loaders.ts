import type { CertCode, Question } from './types'

const certLoaders = {
  'DVA-C02': () => import('./dva-c02.json') as Promise<{ default: Question[] }>,
  'CLF-C02': () => import('./clf-c02.json') as Promise<{ default: Question[] }>,
} as const satisfies Record<CertCode, () => Promise<{ default: Question[] }>>

const KNOWN_CERTS = Object.keys(certLoaders) as CertCode[]

export function normalizeCert(cert: string): CertCode {
  const upper = cert.toUpperCase()
  if ((KNOWN_CERTS as string[]).includes(upper)) return upper as CertCode
  throw new Error(`Unknown cert: ${cert}`)
}

export async function loadBank(cert: string): Promise<Question[]> {
  const canonical = normalizeCert(cert)
  const mod = await certLoaders[canonical]()
  return mod.default
}
