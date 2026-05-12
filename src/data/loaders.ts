import type { CertCode, Question } from './types'

const certLoaders = {
  'DVA-C02': () => import('./dva-c02.json') as Promise<{ default: Question[] }>,
} as const satisfies Record<CertCode, () => Promise<{ default: Question[] }>>

export async function loadBank(cert: CertCode): Promise<Question[]> {
  const mod = await certLoaders[cert]()
  return mod.default
}
