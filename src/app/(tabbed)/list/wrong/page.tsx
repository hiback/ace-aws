'use client'
import { CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import type { CertCode } from '@/data/types'
import { useProgressStats, useWrongList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

export default function WrongPage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <WrongContent cert={currentCert} />
}

function WrongContent({ cert }: { cert: CertCode }) {
  const wrong = useWrongList(cert)
  const bank = useQuestionBank(cert)
  const stats = useProgressStats(cert)
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  if (wrong.isLoading || bank.isLoading || stats.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (!wrong.data || wrong.data.length === 0) {
    const allAnswered =
      typeof stats.data?.total === 'number' &&
      stats.data.total > 0 &&
      stats.data.answered >= stats.data.total
    return (
      <EmptyState
        icon={allAnswered ? CheckCircle : XCircle}
        title={t(allAnswered ? 'emptyAllAnswered' : 'emptyWrong')}
      />
    )
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
              cert={cert}
              qid={a.qid}
              topic={q.topic}
              questionPreview={text}
              status="wrong"
              from="/list/wrong"
            />
          </li>
        )
      })}
    </ul>
  )
}
