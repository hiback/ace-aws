'use client'
import { XCircle } from 'lucide-react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import { useWrongList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

export default function WrongPage() {
  const wrong = useWrongList()
  const bank = useQuestionBank()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  if (wrong.isLoading || bank.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (!wrong.data || wrong.data.length === 0) {
    return <EmptyState icon={XCircle} title={t('emptyWrong')} />
  }

  const byId = new Map(bank.data?.map((q) => [q.id, q]) ?? [])
  const sorted = [...wrong.data].sort((a, b) => b.answeredAt - a.answeredAt)

  return (
    <ul>
      {sorted.map((a) => {
        const q = byId.get(a.qid)
        if (!q) return null
        const text = locale === 'zh' ? q.zh.question : q.en.question
        return (
          <li key={a.qid}>
            <QuestionListRow
              qid={a.qid}
              topic={q.topic}
              questionPreview={text.slice(0, 80) + (text.length > 80 ? '…' : '')}
              status="wrong"
              answeredAt={a.answeredAt}
            />
          </li>
        )
      })}
    </ul>
  )
}
