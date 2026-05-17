import { loadBank } from '@/data/loaders'
import type { CertCode, Letter, Question } from '@/data/types'

export type QuestionIndexEntry = {
  id: number
  type: Question['type']
  answerCount: number
  options: ReadonlySet<Letter>
}

export type QuestionBankIndex = {
  questionCount: number
  questions: ReadonlyMap<number, QuestionIndexEntry>
}

const cache = new Map<CertCode, Promise<QuestionBankIndex>>()

function buildIndex(bank: Question[]): QuestionBankIndex {
  return {
    questionCount: bank.length,
    questions: new Map(
      bank.map((question) => [
        question.id,
        {
          id: question.id,
          type: question.type,
          answerCount: question.type === 'multi' ? question.answer_count : 1,
          options: new Set(Object.keys(question.en.options) as Letter[]),
        },
      ]),
    ),
  }
}

export function getQuestionBankIndex(cert: CertCode): Promise<QuestionBankIndex> {
  const cached = cache.get(cert)
  if (cached) return cached

  const promise = loadBank(cert)
    .then(buildIndex)
    .catch((error) => {
      cache.delete(cert)
      throw error
    })
  cache.set(cert, promise)
  return promise
}
