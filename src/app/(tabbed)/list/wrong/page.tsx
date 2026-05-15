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

  const byId = new Map(bank.data?.map((q) => [q.id, q]) ?? [])
  const sorted = [...(wrong.data ?? [])].sort(
    (a, b) => (b.lastAnsweredAt ?? 0) - (a.lastAnsweredAt ?? 0),
  )
  const visible = sorted.flatMap((progress) => {
    const question = byId.get(progress.qid)
    return question ? [{ progress, question }] : []
  })

  if (visible.length === 0) {
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

  const snapshot = visible.map(({ progress }) => progress.qid)

  return (
    <ul>
      {visible.map(({ progress, question }) => {
        const text = locale === 'zh' ? question.zh.question : question.en.question
        return (
          <li key={progress.qid}>
            <QuestionListRow
              cert={cert}
              qid={progress.qid}
              topic={question.topic}
              questionPreview={text}
              status="wrong"
              wrongCount={progress.wrongCount}
              from="/list/wrong"
              set={snapshot}
            />
          </li>
        )
      })}
    </ul>
  )
}
