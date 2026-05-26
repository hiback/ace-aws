import type { Letter } from '@/data/types'
import type { MockExamQuestionSnapshot } from './start-attempt'

export type MockExamReviewOptionState = 'correct' | 'wrong' | 'missed-correct' | 'dim'

export function getMockExamReviewOptionState(
  letter: Letter,
  snapshot: MockExamQuestionSnapshot,
): MockExamReviewOptionState {
  const selected = snapshot.userPicks.includes(letter)
  const correct = snapshot.correctAnswer.includes(letter)
  if (selected && correct) return 'correct'
  if (selected && !correct) return 'wrong'
  if (!selected && correct) return 'missed-correct'
  return 'dim'
}
