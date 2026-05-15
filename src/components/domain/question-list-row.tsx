'use client'
import { Check, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import type { CertCode } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { buildPracticeHref, type PracticeSource } from '@/lib/practice-flow'
import { TOPIC_KEYS } from '@/lib/topic'

interface QuestionListRowProps {
  cert: CertCode
  qid: number
  topic: string
  questionPreview: string
  status?: 'correct' | 'wrong' | 'unanswered'
  wrongCount?: number
  /** Source path passed to practice page so its back button knows where to return. */
  from: PracticeSource
  set?: readonly number[]
}

export function QuestionListRow({
  cert,
  qid,
  topic,
  questionPreview,
  status = 'unanswered',
  wrongCount,
  from,
  set,
}: QuestionListRowProps) {
  const t = useT()
  const topicLabel = TOPIC_KEYS[topic] ? t(TOPIC_KEYS[topic]) : topic
  const tile =
    status === 'correct'
      ? 'bg-success-soft text-success'
      : status === 'wrong'
        ? 'bg-danger-soft text-danger'
        : 'bg-bg-alt text-ink-mute'
  const Icon = status === 'correct' ? Check : status === 'wrong' ? X : null
  const showWrongCount = status === 'wrong' && typeof wrongCount === 'number' && wrongCount > 0
  return (
    <Link
      href={buildPracticeHref(cert, qid, from, set ?? null)}
      className="flex items-start gap-3 px-5 py-3 border-b border-border hover:bg-bg-alt transition-colors"
    >
      <div
        className={[
          'w-[26px] h-[26px] rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
          tile,
        ].join(' ')}
      >
        {Icon ? <Icon className="w-3.5 h-3.5" strokeWidth={2.5} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-option text-ink leading-[1.5] line-clamp-2 mb-1">{questionPreview}</p>
        <p className="text-helper text-ink-mute flex items-center gap-2">
          <span className="font-mono">#{String(qid).padStart(3, '0')}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-ink-subtle" />
          <span>{topicLabel}</span>
          {showWrongCount ? (
            <>
              <span className="w-[3px] h-[3px] rounded-full bg-ink-subtle" />
              <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-danger">
                {t('wrongCountBadge', { count: wrongCount })}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-subtle flex-shrink-0 mt-2" />
    </Link>
  )
}
