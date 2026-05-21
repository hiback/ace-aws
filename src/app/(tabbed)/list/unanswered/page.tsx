'use client'
import { CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import type { CertCode } from '@/data/types'
import { useProgressList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

export default function UnansweredPage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <UnansweredContent cert={currentCert} />
}

function UnansweredContent({ cert }: { cert: CertCode }) {
  const bank = useQuestionBank(cert)
  const progress = useProgressList(cert)
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  if (bank.isLoading || progress.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const progressByQid = new Map((progress.data ?? []).map((entry) => [entry.qid, entry]))
  const questions = [...(bank.data ?? [])]
    .sort((a, b) => a.id - b.id)
    .filter((question) => progressByQid.get(question.id)?.lastAnsweredAt == null)

  if (questions.length === 0) {
    return <EmptyState icon={CheckCircle} title={t('emptyAllAnswered')} />
  }

  const snapshot = questions.map((question) => question.id)

  return (
    <ul>
      {questions.map((question) => {
        const text = locale === 'zh' ? question.zh.question : question.en.question
        return (
          <li key={question.id}>
            <QuestionListRow
              cert={cert}
              qid={question.id}
              topic={question.topic}
              questionPreview={text}
              status="unanswered"
              from="/list/unanswered"
              set={snapshot}
            />
          </li>
        )
      })}
    </ul>
  )
}
