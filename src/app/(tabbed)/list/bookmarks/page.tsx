'use client'
import { Star } from 'lucide-react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import { useBookmarksList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { progressRepo } from '@/repositories/local-progress-repository'
import { usePrefsStore } from '@/stores/prefs-store'

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
        const text = locale === 'zh' ? q.zh.question : q.en.question
        const ans = progressRepo.getAnswer(qid)
        const status = ans ? (ans.correct ? 'correct' : 'wrong') : 'unanswered'
        return (
          <li key={qid}>
            <QuestionListRow
              qid={qid}
              topic={q.topic}
              questionPreview={text.slice(0, 80) + (text.length > 80 ? '…' : '')}
              status={status as 'correct' | 'wrong' | 'unanswered'}
              answeredAt={ans?.answeredAt}
            />
          </li>
        )
      })}
    </ul>
  )
}
