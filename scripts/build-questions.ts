import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CertCode, Letter, Question, VoteKey } from '../src/data/types'

const BANK_CONFIGS = {
  'DVA-C02': {
    src: 'refs/dva-c02.json',
    dst: 'src/data/dva-c02.json',
  },
  'CLF-C02': {
    src: 'refs/clf-c02.json',
    dst: 'src/data/clf-c02.json',
  },
} as const satisfies Record<CertCode, { src: string; dst: string }>

export interface RawQuestion {
  id: number
  correct_answer: string[]
  vote_distribution: Record<string, number>
  domain: string
  en: {
    question: string
    options: Partial<Record<Letter, string>>
    explanation_md: string
  }
  zh: {
    question: string
    options: Partial<Record<Letter, string>>
    explanation_md: string
  }
}

export const sortedKey = (letters: readonly string[]): string =>
  [...letters]
    .map((s) => s.toUpperCase())
    .sort()
    .join('')

export const unwrapCite = (md: string): string =>
  md.replace(/<cite\b[^>]*>([\s\S]*?)<\/cite>/g, '$1')

export function transformQuestion(q: RawQuestion, cert: CertCode): Question {
  const correct = [...q.correct_answer].map((s) => s.toUpperCase()).sort() as Letter[]
  const isMulti = correct.length >= 2
  const base = {
    id: q.id,
    cert,
    topic: q.domain,
    correct_answer: correct,
    en: {
      question: q.en.question,
      options: q.en.options,
      explanation: unwrapCite(q.en.explanation_md),
    },
    zh: {
      question: q.zh.question,
      options: q.zh.options,
      explanation: unwrapCite(q.zh.explanation_md),
    },
  }
  if (isMulti) {
    const vd: Record<string, number> = {}
    for (const [k, v] of Object.entries(q.vote_distribution)) {
      const norm = k === 'Other' ? 'Other' : sortedKey(k.split(''))
      vd[norm] = (vd[norm] ?? 0) + v
    }
    return { type: 'multi', ...base, answer_count: correct.length, vote_distribution: vd }
  }
  return {
    type: 'single',
    ...base,
    vote_distribution: q.vote_distribution as Partial<Record<VoteKey, number>>,
  }
}

function normalizeBuildCert(input: string): CertCode {
  const upper = input.toUpperCase()
  if (upper in BANK_CONFIGS) return upper as CertCode
  throw new Error(`Unknown cert: ${input}`)
}

async function buildOne(cert: CertCode): Promise<void> {
  const cfg = BANK_CONFIGS[cert]
  const raw = JSON.parse(await readFile(cfg.src, 'utf-8')) as RawQuestion[]
  const out: Question[] = raw.map((q) => transformQuestion(q, cert))
  await mkdir(dirname(cfg.dst), { recursive: true })
  await writeFile(cfg.dst, JSON.stringify(out))
  console.log(`✓ ${out.length} questions → ${cfg.dst}`)
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  const certs =
    !arg || arg.toUpperCase() === 'ALL'
      ? (Object.keys(BANK_CONFIGS) as CertCode[])
      : [normalizeBuildCert(arg)]

  for (const cert of certs) {
    await buildOne(cert)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') {
      console.error('× Raw question bank missing. Place source JSON files under refs/ first.')
    } else {
      console.error(e)
    }
    process.exit(1)
  })
}
