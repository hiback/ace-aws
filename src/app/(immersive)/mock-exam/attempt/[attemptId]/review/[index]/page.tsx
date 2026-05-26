'use client'
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  LayoutGrid,
  X,
} from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/primitives/empty-state'
import { Prose } from '@/components/primitives/prose'
import { Spinner } from '@/components/primitives/spinner'
import { useAccountProgressSync } from '@/components/providers/account-progress-sync-provider'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import { loadBank } from '@/data/loaders'
import type { Letter, Question } from '@/data/types'
import { useMockExamHistory, useSubmittedMockExamAttempt } from '@/hooks/use-mock-exam'
import { useT } from '@/hooks/use-t'
import { MOCK_EXAM_DOMAIN_LABEL_KEYS } from '@/lib/mock-exam/domain-labels'
import {
  getMockExamReviewOptionState,
  type MockExamReviewOptionState,
} from '@/lib/mock-exam/review'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'
import { usePrefsStore } from '@/stores/prefs-store'

type ReviewFilter = 'all' | 'wrong' | 'flagged'

function normalizeReviewFilter(value: string | null): ReviewFilter {
  return value === 'wrong' || value === 'flagged' ? value : 'all'
}

function buildReviewHref(attemptId: string, index: number, filter: ReviewFilter) {
  const href = `/mock-exam/attempt/${attemptId}/review/${index}`
  return filter === 'all' ? href : `${href}?filter=${filter}`
}

export default function MockExamReviewPage() {
  const params = useParams<{ attemptId: string; index: string }>()
  const attemptId = params.attemptId
  const routeIndex = params.index
  const t = useT()
  const submittedQuery = useSubmittedMockExamAttempt(attemptId)

  if (submittedQuery.isPending) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner size={16} />
      </main>
    )
  }

  const submitted = submittedQuery.data
  if (!submitted) {
    return <EmptyState title={t('questionNotFound')} />
  }

  return (
    <MockExamReviewContent
      key={`${submitted.id}:${routeIndex}`}
      submitted={submitted}
      routeIndex={routeIndex}
    />
  )
}

function MockExamReviewContent({
  submitted,
  routeIndex,
}: {
  submitted: SubmittedMockExamAttempt
  routeIndex: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const historyQuery = useMockExamHistory(submitted.cert)
  const history = historyQuery.isError ? [] : historyQuery.data
  const [questions, setQuestions] = useState<Array<Question | null> | null>(null)
  const urlFilter = normalizeReviewFilter(searchParams.get('filter'))
  const [filter, setFilter] = useState<ReviewFilter>(urlFilter)
  const [overrideIndex, setOverrideIndex] = useState<number | null>(null)
  const [showSheet, setShowSheet] = useState(false)

  useEffect(() => {
    setFilter(urlFilter)
  }, [urlFilter])

  useEffect(() => {
    let cancelled = false
    setQuestions(null)
    loadBank(submitted.cert)
      .then((bank) => {
        if (cancelled) return
        setQuestions(
          submitted.questions.map(
            (item) => bank.find((bankQuestion) => bankQuestion.id === item.qid) ?? null,
          ),
        )
      })
      .catch(() => {
        if (!cancelled) setQuestions(submitted.questions.map(() => null))
      })
    return () => {
      cancelled = true
    }
  }, [submitted])

  if (questions === null || history === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner size={16} />
      </main>
    )
  }

  const parsedIndex = Number(routeIndex)
  const index = Number.isFinite(parsedIndex)
    ? Math.min(Math.max(Math.trunc(parsedIndex), 0), submitted.questions.length - 1)
    : 0
  const attemptNumber = deriveReviewAttemptNumber(submitted, history)
  const routeSnapshot = submitted.questions[index]

  if (!routeSnapshot) {
    return <EmptyState title={t('questionNotFound')} />
  }

  const allIndexes = submitted.questions.map((_, index) => index)
  const wrongIndexes = submitted.questions.flatMap((question, index) =>
    question.answered && question.correct === false ? [index] : [],
  )
  const flaggedIndexes = submitted.questions.flatMap((question, index) =>
    question.flagged ? [index] : [],
  )
  const filteredIndexes =
    filter === 'wrong' ? wrongIndexes : filter === 'flagged' ? flaggedIndexes : allIndexes
  const displayIndex = overrideIndex ?? index
  const activeIndex = filteredIndexes.includes(displayIndex)
    ? displayIndex
    : (filteredIndexes[0] ?? displayIndex)
  const filteredPosition = filteredIndexes.indexOf(activeIndex)
  const snapshot = submitted.questions[activeIndex]
  const question = questions[activeIndex]
  const total = submitted.questions.length
  const isCorrect = snapshot.correct === true
  const isUnanswered = !snapshot.answered
  const resultLabel = isUnanswered
    ? t('questionStatusUnanswered')
    : isCorrect
      ? t('questionStatusCorrect')
      : t('questionStatusWrong')
  const resultTone = isUnanswered
    ? 'bg-bg-alt text-ink-mute'
    : isCorrect
      ? 'bg-success-soft text-success-deep'
      : 'bg-danger-soft text-danger-deep'
  const localized = question?.[locale]
  const domainLabelKey = MOCK_EXAM_DOMAIN_LABEL_KEYS[snapshot.domain]
  const domainLabel = domainLabelKey ? t(domainLabelKey) : snapshot.domain
  const filterLabel =
    filter === 'wrong'
      ? t('mockExamReviewWrong')
      : filter === 'flagged'
        ? t('mockExamFlagged')
        : t('mockExamReviewAll')

  const chooseFilter = (nextFilter: ReviewFilter) => {
    setFilter(nextFilter)
    const nextIndexes =
      nextFilter === 'wrong' ? wrongIndexes : nextFilter === 'flagged' ? flaggedIndexes : allIndexes
    const nextIndex = nextIndexes.includes(activeIndex)
      ? activeIndex
      : (nextIndexes[0] ?? activeIndex)
    setOverrideIndex(nextIndex)
    setShowSheet(false)
    router.push(buildReviewHref(submitted.id, nextIndex, nextFilter))
  }

  if (showSheet) {
    return (
      <ReviewAnswerSheet
        submitted={submitted}
        currentIndex={activeIndex}
        attemptNumber={attemptNumber}
        onBack={() => setShowSheet(false)}
        onJump={(index) => {
          setFilter('all')
          setOverrideIndex(index)
          setShowSheet(false)
          router.push(buildReviewHref(submitted.id, index, 'all'))
        }}
      />
    )
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/mock-exam/attempt/${submitted.id}/result`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-alt text-ink-soft"
            aria-label={t('back')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="font-mono text-[11px] tracking-[0.04em] text-ink-mute">
              {formatAttemptSubtitle(t, submitted, attemptNumber)}
            </p>
            <h1 className="text-secondary font-semibold text-ink">
              {t('mockExamReviewTitle')}{' '}
              <span className="font-mono text-[11px] text-ink-mute">
                {activeIndex + 1}/{total}
              </span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowSheet(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-alt text-ink-soft"
            aria-label={t('mockExamAnswerSheet')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="border-border border-b bg-surface px-4 py-2.5">
        <div className="flex rounded-[10px] border border-border bg-bg-alt p-0.5">
          <ReviewScopeButton
            label={t('mockExamReviewAll')}
            count={allIndexes.length}
            active={filter === 'all'}
            onClick={() => chooseFilter('all')}
          />
          <ReviewScopeButton
            label={t('mockExamReviewWrong')}
            count={wrongIndexes.length}
            active={filter === 'wrong'}
            tone="danger"
            onClick={() => chooseFilter('wrong')}
          />
          <ReviewScopeButton
            label={t('mockExamFlagged')}
            count={flaggedIndexes.length}
            active={filter === 'flagged'}
            tone="accent"
            onClick={() => chooseFilter('flagged')}
          />
        </div>
      </div>
      {filteredIndexes.length === 0 ? (
        <main className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="text-card font-bold text-ink">
              {filter === 'flagged'
                ? t('mockExamReviewEmptyFlagged')
                : t('mockExamReviewEmptyWrong')}
            </p>
          </div>
        </main>
      ) : (
        <main className="flex-1 overflow-auto px-4.5 py-4">
          <ReviewResultRow
            cert={submitted.cert}
            qid={snapshot.qid}
            flagged={snapshot.flagged}
            isCorrect={isCorrect}
            isUnanswered={isUnanswered}
            resultLabel={resultLabel}
            resultTone={resultTone}
            domainLabel={domainLabel}
          />
          {localized ? (
            <Prose source={localized.question} variant="stem" className="mb-3.5" />
          ) : (
            <div className="mb-3.5 rounded-card border border-border bg-bg-alt p-3 text-secondary font-semibold text-ink-soft">
              {t('questionNotFound')}
            </div>
          )}

          <div className="mb-3.5 grid grid-cols-2 gap-2">
            <AnswerBadge
              label={t('mockExamYourAnswer')}
              value={isUnanswered ? t('mockExamNoAnswer') : snapshot.userPicks.join(',')}
              tone={isCorrect ? 'good' : 'bad'}
            />
            <AnswerBadge
              label={t('mockExamCorrectAnswer')}
              value={snapshot.correctAnswer.join(',')}
              tone="good"
            />
          </div>

          <div className="mb-4 space-y-2">
            {localized
              ? Object.entries(localized.options).map(([letter, text]) => (
                  <ReviewOptionRow
                    key={letter}
                    letter={letter as Letter}
                    text={text ?? ''}
                    state={getMockExamReviewOptionState(letter as Letter, snapshot)}
                  />
                ))
              : null}
          </div>

          <section className="rounded-card border border-border bg-surface p-3.5">
            <h2 className="mb-2 text-secondary font-bold text-ink">{t('explanationTitle')}</h2>
            {localized ? <Prose source={localized.explanation} variant="explanation" /> : null}
          </section>
        </main>
      )}
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <button
          type="button"
          disabled={filteredPosition <= 0}
          onClick={() =>
            router.push(
              buildReviewHref(submitted.id, filteredIndexes[filteredPosition - 1], filter),
            )
          }
          className="flex items-center gap-1 rounded-button border-[1.5px] border-border bg-surface px-3.5 py-2.5 text-secondary font-semibold text-ink-soft disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('mockExamPrevious')}
        </button>
        <div className="flex-1 text-center font-mono text-[10.5px] uppercase tracking-[0.05em] text-ink-mute">
          {filterLabel} {filteredPosition >= 0 ? filteredPosition + 1 : 0} /{' '}
          {filteredIndexes.length}
        </div>
        <button
          type="button"
          disabled={filteredPosition < 0 || filteredPosition >= filteredIndexes.length - 1}
          onClick={() =>
            router.push(
              buildReviewHref(submitted.id, filteredIndexes[filteredPosition + 1], filter),
            )
          }
          className="flex items-center gap-1 rounded-button bg-btn-bg px-3.5 py-2.5 text-secondary font-semibold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)] disabled:bg-bg-alt disabled:text-ink-mute disabled:shadow-none"
        >
          {t('next')}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </>
  )
}

function ReviewResultRow({
  cert,
  qid,
  flagged,
  isCorrect,
  isUnanswered,
  resultLabel,
  resultTone,
  domainLabel,
}: {
  cert: SubmittedMockExamAttempt['cert']
  qid: number
  flagged: boolean
  isCorrect: boolean
  isUnanswered: boolean
  resultLabel: string
  resultTone: string
  domainLabel: string
}) {
  const t = useT()
  const { progress, scope } = useProgressScope()
  const { enqueueDirtySync } = useAccountProgressSync()
  const [isBookmarked, setIsBookmarked] = useState(() => progress.isBookmarked(qid, cert))

  useEffect(() => {
    setIsBookmarked(progress.isBookmarked(qid, cert))
  }, [cert, progress, qid])

  const handleToggleBookmark = () => {
    progress.toggleBookmark(qid, cert)
    setIsBookmarked(progress.isBookmarked(qid, cert))
    if (scope === 'account') enqueueDirtySync(cert)
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={[
          'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.04em]',
          resultTone,
        ].join(' ')}
      >
        {isCorrect ? (
          <Check className="h-3 w-3" />
        ) : isUnanswered ? null : (
          <X className="h-3 w-3" />
        )}
        {resultLabel}
      </span>
      <span className="min-w-0 truncate font-mono text-[10.5px] tracking-[0.03em] text-ink-mute">
        {domainLabel}
      </span>
      {flagged ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-accent-soft px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-accent-deep">
          <Flag className="h-3 w-3" />
          {t('mockExamFlagged')}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleToggleBookmark}
        aria-label={t('bookmark')}
        aria-pressed={isBookmarked}
        className={[
          'ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-bg-alt',
          isBookmarked ? 'text-accent-deep' : '',
        ].join(' ')}
      >
        {isBookmarked ? (
          <BookmarkCheck className="h-4 w-4" strokeWidth={2.25} />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}

function ReviewOptionRow({
  letter,
  text,
  state,
}: {
  letter: Letter
  text: string
  state: MockExamReviewOptionState
}) {
  const rowClassName = {
    correct: 'border-success bg-success-soft text-success-deep',
    wrong: 'border-danger bg-danger-soft text-danger-deep',
    'missed-correct': 'border-success bg-surface text-success-deep',
    dim: 'border-border bg-surface text-ink-soft opacity-70',
  }[state]
  const letterClassName = {
    correct: 'bg-success text-white',
    wrong: 'bg-danger text-white',
    'missed-correct': 'bg-success-soft text-success-deep',
    dim: 'bg-bg-alt text-ink-soft',
  }[state]
  const trailingIcon =
    state === 'correct' || state === 'missed-correct' ? (
      <Check className="h-4 w-4 text-success" />
    ) : state === 'wrong' ? (
      <X className="h-4 w-4 text-danger" />
    ) : null
  return (
    <div
      className={[
        'flex w-full items-start gap-3 rounded-card border p-3 text-left',
        rowClassName,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-bold',
          letterClassName,
        ].join(' ')}
      >
        {letter}
      </span>
      <Prose source={text} variant="option" className="min-w-0 flex-1" />
      {trailingIcon ? <span className="mt-1 shrink-0">{trailingIcon}</span> : null}
    </div>
  )
}

function ReviewScopeButton({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  tone?: 'danger' | 'accent'
  onClick: () => void
}) {
  const activeTone =
    tone === 'danger' ? 'text-danger-deep' : tone === 'accent' ? 'text-accent-deep' : 'text-ink'
  const countTone =
    active && tone === 'danger'
      ? 'bg-danger-soft text-danger-deep'
      : active && tone === 'accent'
        ? 'bg-accent-soft text-accent-deep'
        : active
          ? 'bg-bg-alt text-ink'
          : 'text-ink-mute'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-secondary font-semibold',
        active
          ? `bg-surface shadow-[0_1px_2px_var(--color-border)] ${activeTone}`
          : 'text-ink-soft',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className={['rounded px-1.5 font-mono text-[10px] font-bold', countTone].join(' ')}>
        {count}
      </span>
    </button>
  )
}

function ReviewAnswerSheet({
  submitted,
  currentIndex,
  attemptNumber,
  onBack,
  onJump,
}: {
  submitted: SubmittedMockExamAttempt
  currentIndex: number
  attemptNumber: number
  onBack: () => void
  onJump: (index: number) => void
}) {
  const t = useT()
  const correct = submitted.questions.filter((question) => question.correct === true).length
  const wrong = submitted.questions.filter(
    (question) => question.answered && question.correct === false,
  ).length
  const unanswered = submitted.questions.filter((question) => !question.answered).length
  const flagged = submitted.questions.filter((question) => question.flagged).length
  const accuracy = Math.round((correct / submitted.questions.length) * 100)

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-alt text-ink-soft"
            aria-label={t('back')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="font-mono text-[11px] tracking-[0.04em] text-ink-mute">
              {formatAttemptSubtitle(t, submitted, attemptNumber)}
            </p>
            <h1 className="text-secondary font-semibold text-ink">{t('mockExamAnswerSheet')}</h1>
          </div>
          <div className="rounded-pill bg-success-soft px-2.5 py-1 font-mono text-[11px] font-bold text-success-deep">
            {submitted.summary.score}
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto px-4.5 py-4">
        <section className="mb-3.5 flex items-center gap-3 rounded-card bg-bg-alt px-3.5 py-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-mute">
              {t('mockExamAccuracy')}
            </p>
            <p className="text-2xl font-bold leading-none text-ink">{accuracy}%</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex h-2 overflow-hidden rounded bg-surface">
              <div
                className="bg-success"
                style={{ width: `${(correct / submitted.questions.length) * 100}%` }}
              />
              <div
                className="bg-danger"
                style={{ width: `${(wrong / submitted.questions.length) * 100}%` }}
              />
              <div
                className="bg-ink-mute/35"
                style={{ width: `${(unanswered / submitted.questions.length) * 100}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tracking-[0.03em] text-ink-soft">
              <span className="font-bold text-success-deep">{correct}</span> /{' '}
              <span className="font-bold text-danger-deep">{wrong}</span> / {unanswered}
            </p>
          </div>
        </section>
        <div className="mb-3 flex flex-wrap gap-3">
          <GridLegend fill="bg-success" label={`${correct} ${t('mockExamCorrect')}`} />
          <GridLegend fill="bg-danger" label={`${wrong} ${t('mockExamReviewWrong')}`} />
          <GridLegend
            fill="bg-surface border border-border"
            label={`${unanswered} ${t('mockExamSkipped')}`}
          />
          <GridLegend
            fill="bg-bg-alt ring-2 ring-accent-deep"
            label={`${flagged} ${t('mockExamFlagged')}`}
          />
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(2.25rem, 1fr))' }}
        >
          {submitted.questions.map((question, index) => {
            const state = !question.answered
              ? t('mockExamUnanswered')
              : question.correct
                ? t('mockExamCorrect')
                : t('mockExamReviewWrong')
            const stateClass = !question.answered
              ? 'border-border bg-surface text-ink-mute'
              : question.correct
                ? 'border-success bg-success text-white'
                : 'border-danger bg-danger text-white'
            return (
              <button
                key={question.qid}
                type="button"
                onClick={() => onJump(index)}
                aria-label={`${index + 1} ${state}${question.flagged ? ` ${t('mockExamFlagged')}` : ''}`}
                aria-current={index === currentIndex ? 'true' : undefined}
                className={[
                  'relative flex aspect-square items-center justify-center rounded-lg border-[1.5px] font-mono text-[12px] font-bold',
                  stateClass,
                  index === currentIndex ? 'outline-2 outline-offset-2 outline-ink' : '',
                ].join(' ')}
              >
                {index + 1}
                {question.flagged ? (
                  <span className="-right-1 -top-1 absolute h-2.5 w-2.5 rounded-full border border-surface bg-accent-deep" />
                ) : null}
              </button>
            )
          })}
        </div>
      </main>
      <footer className="sticky bottom-0 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <button
          type="button"
          onClick={onBack}
          className="flex w-full items-center justify-center gap-1 rounded-button bg-btn-bg px-4 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('mockExamBackToQuestion')}
        </button>
      </footer>
    </>
  )
}

function deriveReviewAttemptNumber(
  submitted: SubmittedMockExamAttempt,
  history: SubmittedMockExamAttempt[],
) {
  const sameCertHistory = history.filter((attempt) => attempt.cert === submitted.cert)
  const exactIndex = sameCertHistory.findIndex((attempt) => attempt.id === submitted.id)
  if (exactIndex >= 0) return sameCertHistory.length - exactIndex

  const olderOrSameAttempts = sameCertHistory.filter(
    (attempt) => attempt.submittedAt <= submitted.submittedAt,
  ).length
  return Math.max(olderOrSameAttempts, 1)
}

function formatAttemptSubtitle(
  t: ReturnType<typeof useT>,
  submitted: SubmittedMockExamAttempt,
  attemptNumber: number,
) {
  return `${submitted.cert} · ${t('mockExamAttemptN', { n: attemptNumber })}`
}

function GridLegend({ fill, label }: { fill: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={['h-3.5 w-3.5 rounded', fill].join(' ')} />
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
    </div>
  )
}

function AnswerBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'bad'
}) {
  const good = tone === 'good'
  return (
    <div
      className={[
        'flex items-center gap-2.5 rounded-[10px] border p-2.5',
        good ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[13px] font-bold text-white',
          good ? 'bg-success' : 'bg-danger',
        ].join(' ')}
      >
        {value}
      </div>
      <div
        className={[
          'font-mono text-[10px] font-bold uppercase tracking-[0.05em]',
          good ? 'text-success-deep' : 'text-danger-deep',
        ].join(' ')}
      >
        {label}
      </div>
    </div>
  )
}
