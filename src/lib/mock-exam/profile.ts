import { normalizeCert } from '@/data/loaders'
import type { CertCode } from '@/data/types'

export type MockExamDomain = {
  name: string
  weight: number
  bankTopics: string[]
}

export type MockExamProfile = {
  cert: CertCode
  questionCount: number
  timeLimitMinutes: number
  passingScore: number
  domains: MockExamDomain[]
}

const PROFILES: Record<CertCode, MockExamProfile> = {
  'DVA-C02': {
    cert: 'DVA-C02',
    questionCount: 65,
    timeLimitMinutes: 130,
    passingScore: 720,
    domains: [
      { name: 'Development with AWS Services', weight: 32, bankTopics: ['Development'] },
      { name: 'Security', weight: 26, bankTopics: ['Security'] },
      { name: 'Deployment', weight: 24, bankTopics: ['Deployment'] },
      {
        name: 'Troubleshooting and Optimization',
        weight: 18,
        bankTopics: ['Troubleshooting'],
      },
    ],
  },
  'CLF-C02': {
    cert: 'CLF-C02',
    questionCount: 65,
    timeLimitMinutes: 90,
    passingScore: 700,
    domains: [
      { name: 'Cloud Concepts', weight: 24, bankTopics: ['Cloud Concepts'] },
      { name: 'Security and Compliance', weight: 30, bankTopics: ['Security and Compliance'] },
      {
        name: 'Cloud Technology and Services',
        weight: 34,
        bankTopics: ['Cloud Technology and Services'],
      },
      {
        name: 'Billing, Pricing, and Support',
        weight: 12,
        bankTopics: ['Billing, Pricing, and Support'],
      },
    ],
  },
  'SAA-C03': {
    cert: 'SAA-C03',
    questionCount: 65,
    timeLimitMinutes: 130,
    passingScore: 720,
    domains: [
      {
        name: 'Design Secure Architectures',
        weight: 30,
        bankTopics: ['Design Secure Architectures'],
      },
      {
        name: 'Design Resilient Architectures',
        weight: 26,
        bankTopics: ['Design Resilient Architectures'],
      },
      {
        name: 'Design High-Performing Architectures',
        weight: 24,
        bankTopics: ['Design High-Performing Architectures'],
      },
      {
        name: 'Design Cost-Optimized Architectures',
        weight: 20,
        bankTopics: ['Design Cost-Optimized Architectures'],
      },
    ],
  },
  'SAP-C02': {
    cert: 'SAP-C02',
    questionCount: 75,
    timeLimitMinutes: 180,
    passingScore: 750,
    domains: [
      {
        name: 'Design Solutions for Organizational Complexity',
        weight: 26,
        bankTopics: ['Design Solutions for Organizational Complexity'],
      },
      {
        name: 'Design for New Solutions',
        weight: 29,
        bankTopics: ['Design for New Solutions'],
      },
      {
        name: 'Continuous Improvement for Existing Solutions',
        weight: 25,
        bankTopics: ['Continuous Improvement for Existing Solutions'],
      },
      {
        name: 'Accelerate Workload Migration and Modernization',
        weight: 20,
        bankTopics: ['Accelerate Workload Migration and Modernization'],
      },
    ],
  },
  'DOP-C02': {
    cert: 'DOP-C02',
    questionCount: 75,
    timeLimitMinutes: 180,
    passingScore: 750,
    domains: [
      { name: 'SDLC Automation', weight: 22, bankTopics: ['SDLC Automation'] },
      {
        name: 'Configuration Management and IaC',
        weight: 17,
        bankTopics: ['Configuration Management and IaC'],
      },
      {
        name: 'Resilient Cloud Solutions',
        weight: 15,
        bankTopics: ['Resilient Cloud Solutions'],
      },
      {
        name: 'Monitoring and Logging',
        weight: 15,
        bankTopics: ['Monitoring and Logging'],
      },
      {
        name: 'Incident and Event Response',
        weight: 14,
        bankTopics: ['Incident and Event Response'],
      },
      {
        name: 'Security and Compliance',
        weight: 17,
        bankTopics: ['Security and Compliance'],
      },
    ],
  },
}

export function getMockExamProfile(cert: string): MockExamProfile {
  const profile = PROFILES[normalizeCert(cert)]
  if (!profile) throw new Error(`Mock exam profile not available for cert: ${cert}`)
  return profile
}

export function getMockExamProfileDomainQuotas(profile: MockExamProfile): Record<string, number> {
  const exact = profile.domains.map((domain, index) => {
    const quota = (profile.questionCount * domain.weight) / 100
    return { domain, floor: Math.floor(quota), remainder: quota % 1, index }
  })
  const allocated = exact.reduce((sum, item) => sum + item.floor, 0)
  const remaining = profile.questionCount - allocated
  const winners = new Set(
    [...exact]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, remaining)
      .map((item) => item.domain.name),
  )

  return Object.fromEntries(
    exact.map((item) => [item.domain.name, item.floor + (winners.has(item.domain.name) ? 1 : 0)]),
  )
}
