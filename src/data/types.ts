export type CertCode = 'DVA-C02' | 'CLF-C02'
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'
export type VoteKey = Letter | 'Other'
export type Locale = 'zh' | 'en'
export type Theme = 'light' | 'dark' | 'system'

type LocalizedContent = {
  question: string
  options: Partial<Record<Letter, string>> // typically A-D; ~10% have E
  explanation: string // markdown, <cite> already unwrapped
}

interface BaseQuestion {
  id: number
  cert: CertCode
  topic: string
  correct_answer: Letter[] // sorted
  en: LocalizedContent
  zh: LocalizedContent
}

export type Question =
  | (BaseQuestion & {
      type: 'single'
      vote_distribution: Partial<Record<VoteKey, number>>
    })
  | (BaseQuestion & {
      type: 'multi'
      answer_count: number
      vote_distribution: Record<string, number> // key = sorted letters concat, e.g. 'BD'
    })

export type ProgressScope = 'anonymous' | 'account'

export interface QuestionProgress {
  qid: number
  correctCount: number
  wrongCount: number
  lastPicks: Letter[]
  lastCorrect: boolean | null
  lastAnsweredAt: number | null
  bookmarked: boolean
  bookmarkUpdatedAt: number | null
  dirtySince?: number
}
