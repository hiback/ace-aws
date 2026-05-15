import type { StringKey } from './strings'

export interface CertOption {
  code: string
  titleKey: StringKey
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
      { code: 'CLF-C02', titleKey: 'certClfTitle' },
      { code: 'AIF-C01', titleKey: 'certAifTitle' },
    ],
  },
  {
    labelKey: 'certGroupAssociate',
    certs: [
      { code: 'SAA-C03', titleKey: 'certSaaTitle' },
      { code: 'DVA-C02', titleKey: 'certDvaSelectTitle', count: 557, ready: true, hot: true },
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
