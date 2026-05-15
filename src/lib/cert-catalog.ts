import type { CertCode } from '@/data/types'
import type { StringKey } from './strings'

export interface CertOption {
  code: string
  titleKey: StringKey
  heroTitleKey?: StringKey
  count?: number
  ready?: boolean
  hot?: boolean
}

export interface CertGroup {
  labelKey: StringKey
  certs: CertOption[]
}

export const CERT_GROUPS: CertGroup[] = [
  {
    labelKey: 'certGroupFoundational',
    certs: [
      { code: 'CLF-C02', titleKey: 'certClfTitle', count: 719, ready: true, hot: true },
      { code: 'AIF-C01', titleKey: 'certAifTitle' },
    ],
  },
  {
    labelKey: 'certGroupAssociate',
    certs: [
      { code: 'SAA-C03', titleKey: 'certSaaTitle' },
      {
        code: 'DVA-C02',
        titleKey: 'certDvaSelectTitle',
        heroTitleKey: 'certDvaTitle',
        count: 557,
        ready: true,
        hot: true,
      },
      { code: 'SOA-C02', titleKey: 'certSoaTitle' },
      { code: 'DEA-C01', titleKey: 'certDeaTitle' },
      { code: 'MLA-C01', titleKey: 'certMlaTitle' },
    ],
  },
  {
    labelKey: 'certGroupProfessional',
    certs: [
      { code: 'SAP-C02', titleKey: 'certSapTitle' },
      { code: 'DOP-C02', titleKey: 'certDopTitle' },
    ],
  },
  {
    labelKey: 'certGroupSpecialty',
    certs: [
      { code: 'ANS-C01', titleKey: 'certAnsTitle' },
      { code: 'SCS-C02', titleKey: 'certScsTitle' },
      { code: 'MLS-C01', titleKey: 'certMlsTitle' },
    ],
  },
]

export const READY_CERTS = CERT_GROUPS.flatMap((group) => group.certs)
  .filter((cert) => cert.ready)
  .map((cert) => cert.code) as CertCode[]

export function isReadyCertCode(code: string): code is CertCode {
  return (READY_CERTS as string[]).includes(code)
}

export function getCertOption(cert: CertCode): CertOption {
  const option = CERT_GROUPS.flatMap((group) => group.certs).find((item) => item.code === cert)
  if (!option) throw new Error(`Unknown cert option: ${cert}`)
  return option
}

export function getCertGroupLabelKey(cert: CertCode): StringKey {
  const group = CERT_GROUPS.find((item) => item.certs.some((option) => option.code === cert))
  if (!group) throw new Error(`Unknown cert group: ${cert}`)
  return group.labelKey
}

export function certPath(cert: CertCode): string {
  return cert.toLowerCase()
}
