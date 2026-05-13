import { Check, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { Pill } from '@/components/primitives/pill'

interface QuestionListRowProps {
  qid: number
  topic: string
  questionPreview: string
  status?: 'correct' | 'wrong' | 'unanswered'
  answeredAt?: number
  /** Source path passed to practice page so its back button knows where to return. */
  from: string
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function QuestionListRow({
  qid,
  topic,
  questionPreview,
  status,
  answeredAt,
  from,
}: QuestionListRowProps) {
  const StatusIcon = status === 'correct' ? Check : status === 'wrong' ? X : null
  const iconColor =
    status === 'correct' ? 'text-success' : status === 'wrong' ? 'text-danger' : 'text-ink-mute'
  return (
    <Link
      href={`/practice/dva-c02/${qid}?from=${encodeURIComponent(from)}`}
      className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-bg-alt transition-colors"
    >
      <div className="flex-shrink-0 w-5 pt-0.5 flex justify-center">
        {StatusIcon ? (
          <StatusIcon className={['w-4 h-4', iconColor].join(' ')} strokeWidth={2.25} />
        ) : (
          <span className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-secondary font-bold text-ink">Q{qid}</span>
          <Pill>{topic}</Pill>
        </div>
        <p className="text-secondary text-ink-soft truncate">{questionPreview}</p>
        {answeredAt ? (
          <p className="text-helper text-ink-mute mt-0.5 font-mono">{formatDate(answeredAt)}</p>
        ) : null}
      </div>
      <ChevronRight className="w-4 h-4 text-ink-subtle flex-shrink-0 mt-1" />
    </Link>
  )
}
