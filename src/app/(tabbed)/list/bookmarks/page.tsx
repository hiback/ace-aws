'use client'
import { Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { QuestionListRow } from '@/components/domain/question-list-row'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import type { CertCode, Question } from '@/data/types'
import { useQuestionProgress } from '@/hooks/use-answer'
import { useBookmarksList } from '@/hooks/use-progress-stats'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

function BookmarkRow({
  qid,
  cert,
  question,
  locale,
  set,
}: {
  qid: number
  cert: CertCode
  question: Question
  locale: 'zh' | 'en'
  set: readonly number[]
}) {
  const ans = useQuestionProgress(qid, cert)
  const text = locale === 'zh' ? question.zh.question : question.en.question
  const status =
    ans.data?.lastCorrect === true
      ? 'correct'
      : ans.data?.lastCorrect === false
        ? 'wrong'
        : 'unanswered'
  return (
    <QuestionListRow
      cert={cert}
      qid={qid}
      topic={question.topic}
      questionPreview={text}
      status={status}
      wrongCount={ans.data?.wrongCount}
      from="/list/bookmarks"
      set={set}
    />
  )
}

export default function BookmarksPage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <BookmarksContent cert={currentCert} />
}

function BookmarksContent({ cert }: { cert: CertCode }) {
  const bookmarks = useBookmarksList(cert)
  const bank = useQuestionBank(cert)
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  if (bookmarks.isLoading || bank.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  const byId = new Map(bank.data?.map((q) => [q.id, q]) ?? [])
  const visibleQids = (bookmarks.data ?? []).filter((qid) => byId.has(qid))

  if (visibleQids.length === 0) {
    return <EmptyState icon={Star} title={t('emptyBookmarks')} />
  }

  const snapshot = visibleQids

  return (
    <ul>
      {visibleQids.map((qid) => {
        const q = byId.get(qid)
        if (!q) return null
        return (
          <li key={qid}>
            <BookmarkRow qid={qid} cert={cert} question={q} locale={locale} set={snapshot} />
          </li>
        )
      })}
    </ul>
  )
}
