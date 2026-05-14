'use client'
import { Star } from 'lucide-react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import type { Question } from '@/data/types'
import { useAnswer } from '@/hooks/use-answer'
import { useBookmarksList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

function BookmarkRow({
  qid,
  question,
  locale,
}: {
  qid: number
  question: Question
  locale: 'zh' | 'en'
}) {
  const ans = useAnswer(qid)
  const text = locale === 'zh' ? question.zh.question : question.en.question
  const status = ans.data ? (ans.data.correct ? 'correct' : 'wrong') : 'unanswered'
  return (
    <QuestionListRow
      qid={qid}
      topic={question.topic}
      questionPreview={text}
      status={status as 'correct' | 'wrong' | 'unanswered'}
      from="/list/bookmarks"
    />
  )
}

export default function BookmarksPage() {
  const bookmarks = useBookmarksList()
  const bank = useQuestionBank()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  if (bookmarks.isLoading || bank.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (!bookmarks.data || bookmarks.data.length === 0) {
    return <EmptyState icon={Star} title={t('emptyBookmarks')} />
  }

  const byId = new Map(bank.data?.map((q) => [q.id, q]) ?? [])

  return (
    <ul>
      {bookmarks.data.map((qid) => {
        const q = byId.get(qid)
        if (!q) return null
        return (
          <li key={qid}>
            <BookmarkRow qid={qid} question={q} locale={locale} />
          </li>
        )
      })}
    </ul>
  )
}
