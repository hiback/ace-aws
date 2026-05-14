import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Letter, Question, VoteKey } from '../src/data/types'

const SRC = 'refs/dva-c02.json'
const DST = 'src/data/dva-c02.json'

export interface RawQuestion {
  id: number
  correct_answer: string[]
  answer_count: number
  vote_distribution: Record<string, number>
  domain: string
  services: string[]
  en: {
    question: string
    options: Partial<Record<Letter, string>>
    explanation_md: string
    comments?: unknown[]
  }
  zh: {
    question: string
    options: Partial<Record<Letter, string>>
    explanation_md: string
    comments?: unknown[]
  }
}

export const sortedKey = (letters: readonly string[]): string =>
  [...letters]
    .map((s) => s.toUpperCase())
    .sort()
    .join('')

export const unwrapCite = (md: string): string =>
  md.replace(/<cite\b[^>]*>([\s\S]*?)<\/cite>/g, '$1')

export function transformQuestion(q: RawQuestion): Question {
  const correct = [...q.correct_answer].map((s) => s.toUpperCase()).sort() as Letter[]
  const isMulti = correct.length >= 2
  const base = {
    id: q.id,
    cert: 'DVA-C02' as const,
    topic: q.domain,
    correct_answer: correct,
    en: {
      question: q.en.question,
      options: q.en.options,
      explanation: unwrapCite(q.en.explanation_md ?? ''),
    },
    zh: {
      question: q.zh.question,
      options: q.zh.options,
      explanation: unwrapCite(q.zh.explanation_md ?? ''),
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

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(SRC, 'utf-8')) as RawQuestion[]
  const out: Question[] = raw.map(transformQuestion)
  await mkdir(dirname(DST), { recursive: true })
  await writeFile(DST, JSON.stringify(out))
  console.log(`✓ ${out.length} questions → ${DST}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') {
      console.error(
        `× ${SRC} not found. Place the original question bank at refs/dva-c02.json before running.`,
      )
    } else {
      console.error(e)
    }
    process.exit(1)
  })
}
