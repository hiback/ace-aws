'use client'
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock, Trophy } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { BottomSheet } from '@/components/primitives/bottom-sheet'
import { EmptyState } from '@/components/primitives/empty-state'
import { ProgressBar } from '@/components/primitives/progress-bar'
import { useMockExamRuntime } from '@/hooks/use-mock-exam-runtime'
import { useT } from '@/hooks/use-t'

export default function MockExamAnswerSheetPage() {
  const params = useParams<{ attemptId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const runtime = useMockExamRuntime(params.attemptId)
  const attempt = runtime.attempt
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (attempt === undefined) {
    return <AnswerSheetSkeleton />
  }

  if (!attempt) {
    return <EmptyState title={t('questionNotFound')} />
  }

  const answeredCount = attempt.questions.filter((question) => question.answered).length
  const flaggedCount = attempt.questions.filter((question) => question.flagged).length
  const unansweredCount = attempt.questions.length - answeredCount
  const remainingSeconds = runtime.remainingSeconds
  const timerWarning = runtime.timerWarning
  const resumeIndex = deriveResumeIndex(
    searchParams.get('from'),
    attempt.currentIndex,
    attempt.questions.length,
  )

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/mock-exam/attempt/${attempt.id}/${resumeIndex}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-alt text-ink"
            aria-label={t('back')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center text-secondary font-semibold text-ink">
            {t('mockExamQuestionGrid')}
          </h1>
          <div
            className={[
              'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-mono text-[11px] font-bold tracking-[0.04em] tabular-nums',
              timerWarning
                ? 'bg-danger-soft text-danger-deep'
                : 'bg-accent-softer text-accent-deep',
            ].join(' ')}
          >
            <Clock className="h-3 w-3" />
            {formatSeconds(remainingSeconds)}
          </div>
        </div>
      </header>
      <main className="flex-1 space-y-4 overflow-auto px-5 py-4">
        <div className="flex flex-wrap gap-2.5">
          <Legend
            label={`${answeredCount} ${t('mockExamAnswered')}`}
            className="bg-accent text-white"
          />
          <Legend
            label={`${unansweredCount} ${t('mockExamUnanswered')}`}
            className="border border-border bg-surface text-ink-soft"
          />
          <Legend
            label={`${flaggedCount} ${t('mockExamFlagged')}`}
            className="bg-bg-alt text-accent-deep ring-2 ring-accent"
          />
        </div>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(2.25rem, 1fr))' }}
        >
          {attempt.questions.map((question, index) => {
            const isCurrent = index === resumeIndex
            const isAnswered = question.answered
            const isFlagged = question.flagged
            return (
              <button
                key={question.qid}
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => router.push(`/mock-exam/attempt/${attempt.id}/${index}`)}
                className={[
                  'relative flex aspect-square items-center justify-center rounded-lg border-[1.5px] font-mono text-[12px] font-bold',
                  isAnswered
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-ink-soft',
                  isCurrent ? 'outline-2 outline-offset-2 outline-ink' : '',
                  isFlagged ? 'shadow-[inset_0_0_0_2px_var(--color-accent-deep)]' : '',
                ].join(' ')}
              >
                {index + 1}
                {isFlagged ? (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-surface bg-accent-deep" />
                ) : null}
              </button>
            )
          })}
        </div>

        <section className="rounded-[12px] bg-bg-alt p-3.5">
          <div className="mb-2 flex items-center justify-between text-secondary">
            <span className="text-ink-soft">{t('mockExamAnswered')}</span>
            <span className="font-bold text-ink">
              {answeredCount} / {attempt.questions.length}
            </span>
          </div>
          <ProgressBar
            value={attempt.questions.length === 0 ? 0 : answeredCount / attempt.questions.length}
            height={6}
          />
          {unansweredCount > 0 ? (
            <div className="mt-3 flex items-center gap-1.5 text-helper font-semibold text-danger-deep">
              <AlertTriangle className="h-3 w-3" />
              {t('mockExamUnansweredWarning', { count: unansweredCount })}
            </div>
          ) : null}
        </section>
      </main>
      <footer className="sticky bottom-0 flex shrink-0 gap-2.5 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <button
          type="button"
          onClick={() => router.push(`/mock-exam/attempt/${attempt.id}/${resumeIndex}`)}
          className="flex-1 rounded-button border-[1.5px] border-border bg-surface px-3 py-3 text-secondary font-semibold text-ink-soft"
        >
          {t('mockExamResumeExam')}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-button bg-btn-bg px-3 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
        >
          {t('submit')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </footer>
      <BottomSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        closeLabel={t('close')}
        ariaLabelledby="mock-exam-submit-title"
        showCloseButton={false}
        wrapperClassName="!z-30"
        backdropClassName="!backdrop-blur-none"
        handleClassName="[&>div:first-child>div]:bg-border-strong [&>div:first-child>div]:opacity-60"
        panelClassName="border border-border"
        headerClassName="border-b border-border px-4 !pt-0 pb-3"
        contentClassName="space-y-3 px-4 pt-3 pb-4"
        header={
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-softer text-accent-deep">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="mock-exam-submit-title" className="text-card font-bold text-ink">
                {t('mockExamSubmitTitle')}
              </h2>
              <p className="mt-0.5 text-secondary text-ink-soft">{t('mockExamSubmitSubtitle')}</p>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          <SheetStat
            label={t('mockExamAnswered')}
            value={`${answeredCount} / ${attempt.questions.length}`}
            tone="accent"
          />
          <SheetStat label={t('mockExamFlagged')} value={flaggedCount} />
          <SheetStat
            label={t('mockExamTimeLeft')}
            value={formatSeconds(remainingSeconds)}
            tone={timerWarning ? 'danger' : 'accent'}
          />
        </div>
        {unansweredCount > 0 ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger-soft px-3 py-2.5 text-secondary font-semibold text-danger-deep">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('mockExamSubmitUnansweredWarning', { count: unansweredCount })}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="flex-1 rounded-button border-[1.5px] border-border bg-surface px-3 py-3 text-secondary font-semibold text-ink"
          >
            {t('mockExamSubmitCancel')}
          </button>
          <button
            type="button"
            onClick={() => void runtime.submit()}
            disabled={runtime.isLocked}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-button bg-btn-bg px-3 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
          >
            {t('mockExamSubmitConfirm')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </BottomSheet>
    </>
  )
}

function AnswerSheetSkeleton() {
  return (
    <>
      <header
        aria-busy="true"
        className="sticky top-0 z-10 border-b border-border bg-surface px-5 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-bg-alt" />
          <div className="mx-auto h-4 w-28 rounded-full bg-bg-alt" />
          <div className="h-6 w-16 rounded-pill bg-accent-softer" />
        </div>
      </header>
      <main className="flex-1 space-y-4 overflow-auto px-5 py-4">
        <div className="flex flex-wrap gap-2.5">
          <div className="h-4 w-20 rounded-full bg-bg-alt" />
          <div className="h-4 w-24 rounded-full bg-bg-alt" />
          <div className="h-4 w-20 rounded-full bg-bg-alt" />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SKELETON_TILE_KEYS.map((key) => (
            <div key={key} className="aspect-square rounded-lg border border-border bg-surface" />
          ))}
        </div>
        <section className="rounded-[12px] bg-bg-alt p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="h-3.5 w-20 rounded-full bg-surface" />
            <div className="h-3.5 w-12 rounded-full bg-surface" />
          </div>
          <div className="h-1.5 rounded-full bg-surface" />
          <div className="mt-3 h-3 w-48 rounded-full bg-surface" />
        </section>
      </main>
      <footer className="sticky bottom-0 flex shrink-0 gap-2.5 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <div className="h-11 flex-1 rounded-button border-[1.5px] border-border bg-surface" />
        <div className="h-11 flex-1 rounded-button bg-bg-alt" />
      </footer>
    </>
  )
}

const SKELETON_TILE_KEYS = Array.from({ length: 20 }, (_, index) => `tile-${index + 1}`)

function Legend({ label, className }: { label: string; className: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-helper font-medium text-ink-soft">
      <span className={['h-3.5 w-3.5 rounded', className].join(' ')} />
      {label}
    </div>
  )
}

function SheetStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  const bgClass = tone === 'danger' ? 'bg-danger-soft' : 'bg-bg-alt'
  const valueClass =
    tone === 'danger' ? 'text-danger-deep' : tone === 'accent' ? 'text-accent' : 'text-ink'
  return (
    <fieldset
      aria-label={`${value} ${label}`}
      className={['rounded-[10px] p-2 text-center', bgClass].join(' ')}
    >
      <legend className="sr-only">{`${value} ${label}`}</legend>
      <div className={['text-card font-bold tabular-nums', valueClass].join(' ')}>{value}</div>
      <div className="mt-0.5 text-[10px] text-ink-mute">{label}</div>
    </fieldset>
  )
}

function formatSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

function deriveResumeIndex(value: string | null, fallbackIndex: number, questionCount: number) {
  if (questionCount <= 0) return 0
  const parsed = parseSourceIndex(value)
  return clamp(parsed ?? fallbackIndex, 0, questionCount - 1)
}

function parseSourceIndex(value: string | null) {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
