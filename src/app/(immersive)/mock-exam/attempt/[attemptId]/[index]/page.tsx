'use client'
import { AlertTriangle, ArrowRight, ChevronLeft, Clock, Flag, Grid2X2, Info, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { OptionRow } from '@/components/domain/option-row'
import { QuestionStem } from '@/components/domain/question-stem'
import { BottomSheet } from '@/components/primitives/bottom-sheet'
import { EmptyState } from '@/components/primitives/empty-state'
import { ProgressBar } from '@/components/primitives/progress-bar'
import type { Letter } from '@/data/types'
import { useMockExamRuntime } from '@/hooks/use-mock-exam-runtime'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import type { MockExamAttempt } from '@/lib/mock-exam/start-attempt'
import { usePrefsStore } from '@/stores/prefs-store'

export default function MockExamAttemptQuestionPage() {
  const params = useParams<{ attemptId: string; index: string }>()
  const router = useRouter()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const runtime = useMockExamRuntime(params.attemptId)
  const attempt = runtime.attempt
  const bank = useQuestionBank(attempt?.cert)
  const routeIndex = getSafeRouteIndex(params.index, attempt)
  const [exitOpen, setExitOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const reconciledRouteRef = useRef<string | null>(null)

  useEffect(() => {
    if (!attempt || routeIndex === null) return
    const routeKey = `${attempt.id}:${routeIndex}`
    if (reconciledRouteRef.current === routeKey) return
    reconciledRouteRef.current = routeKey
    void runtime.navigate(routeIndex)
  }, [attempt, routeIndex, runtime.navigate])

  const activeIndex = routeIndex ?? attempt?.currentIndex ?? 0
  const activeSnapshot = attempt?.questions[activeIndex]
  const question = bank.data?.find((item) => item.id === activeSnapshot?.qid)

  if (attempt === undefined || (attempt && bank.data === undefined && !bank.isError)) {
    return <MockExamQuestionSkeleton />
  }

  if (bank.isError || runtime.lastError === 'load') {
    return <EmptyState title={t('mockExamQuestionLoadError')} />
  }

  if (!attempt || !question) {
    return <EmptyState title={t('questionNotFound')} />
  }

  const displayIndex = activeIndex + 1
  const options = question.en.options
  const optionLetters = Object.keys(options) as Letter[]
  const requiredPickCount =
    activeSnapshot?.type === 'multi' ? activeSnapshot.correctAnswer.length : 1
  const isMulti = activeSnapshot?.type === 'multi'
  const isFlagged = activeSnapshot?.flagged ?? false
  const flaggedCount = attempt.questions.filter((item) => item.flagged).length
  const answeredCount = attempt.questions.filter((item) => item.answered).length
  const remainingSeconds = runtime.remainingSeconds
  const timerWarning = runtime.timerWarning
  const isLastQuestion = activeIndex >= attempt.questions.length - 1
  const runtimeIsOnRouteIndex = attempt.currentIndex === activeIndex
  const selectedPicks = runtimeIsOnRouteIndex
    ? runtime.currentPicks
    : (activeSnapshot?.userPicks ?? [])
  const multiSelectionComplete = isMulti ? selectedPicks.length === requiredPickCount : true
  const questionNumberMarker = `__CURRENT_QUESTION_${displayIndex}__`
  const [questionLabelPrefix = '', questionLabelSuffix = ''] = t('questionXofY', {
    x: questionNumberMarker,
    y: attempt.questionCount,
  }).split(questionNumberMarker)
  const multiAnswerHint = isMulti ? (
    <span
      className={[
        'inline-flex items-center gap-1.5 font-mono text-helper font-bold uppercase tracking-[0.05em]',
        selectedPicks.length === requiredPickCount ? 'text-success' : 'text-ink-mute',
      ].join(' ')}
    >
      <Info className="h-3 w-3" />
      {selectedPicks.length === requiredPickCount
        ? t('selectedNofN', { n: selectedPicks.length, total: requiredPickCount })
        : t('selectN', { n: requiredPickCount - selectedPicks.length })}
    </span>
  ) : null

  const handlePick = (letter: Letter) => {
    if (!runtimeIsOnRouteIndex) {
      void runtime.navigate(activeIndex)
      return
    }
    void runtime.pick(letter)
  }

  const handleFlag = () => {
    if (!runtimeIsOnRouteIndex) {
      void runtime.navigate(activeIndex)
      return
    }
    void runtime.toggleFlag()
  }

  const handleNavigate = (nextIndex: number) => {
    if (runtime.isLocked) return
    void runtime.navigate(nextIndex).then(() => {
      router.push(`/mock-exam/attempt/${attempt.id}/${nextIndex}`)
    })
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-alt text-ink-soft"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
          <div
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-pill border px-3 py-1.5',
              timerWarning
                ? 'border-danger/30 bg-danger-soft text-danger-deep'
                : 'border-accent/30 bg-accent-softer text-accent-deep',
            ].join(' ')}
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono text-[15px] font-bold tabular-nums tracking-[0.04em]">
              {formatSeconds(remainingSeconds)}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              router.push(`/mock-exam/attempt/${attempt.id}/sheet?from=${activeIndex}`)
            }
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft"
          >
            <Grid2X2 className="h-3 w-3" />
            {t('mockExamQuestionGrid')}
          </button>
        </div>
        <div className="border-t border-border px-5 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-secondary font-semibold text-ink">
              {questionLabelPrefix}
              <span className="text-accent">{displayIndex}</span>
              {questionLabelSuffix}
            </span>
            {isMulti ? (
              <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-accent-deep">
                {t('badgeMulti', { n: requiredPickCount })}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-mute">
              <Flag className="h-3 w-3" />
              {flaggedCount} {t('mockExamFlagged')}
            </span>
          </div>
          <ProgressBar value={displayIndex / attempt.questionCount} height={3} />
        </div>
      </header>
      <main className="flex-1 space-y-4 px-5 pt-[18px] pb-4">
        <QuestionStem
          zhQuestion={question.zh.question}
          enQuestion={question.en.question}
          enOptions={question.en.options}
          hint={multiAnswerHint}
        />
        <div className="space-y-2.5">
          {optionLetters.map((letter) => (
            <OptionRow
              key={letter}
              letter={letter}
              text={
                (locale === 'zh' ? question.zh.options[letter] : question.en.options[letter]) ?? ''
              }
              selected={selectedPicks.includes(letter)}
              multi={isMulti}
              onClick={() => handlePick(letter)}
            />
          ))}
        </div>
      </main>
      <footer className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <button
          type="button"
          disabled={activeIndex <= 0}
          onClick={() => handleNavigate(activeIndex - 1)}
          className="flex items-center gap-1 rounded-button border-[1.5px] border-border bg-surface px-3.5 py-2.5 text-secondary font-semibold text-ink-soft"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('mockExamPrevious')}
        </button>
        <button
          type="button"
          onClick={handleFlag}
          aria-pressed={isFlagged}
          className={[
            'flex items-center gap-1.5 rounded-button border-[1.5px] px-3 py-2.5 text-secondary font-semibold',
            isFlagged
              ? 'border-accent bg-accent text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]'
              : 'border-accent bg-accent-softer text-accent-deep',
          ].join(' ')}
        >
          <Flag className="h-3.5 w-3.5" fill={isFlagged ? 'currentColor' : 'none'} />
          {isFlagged ? t('mockExamFlagged') : t('mockExamFlag')}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={!isLastQuestion && !multiSelectionComplete}
          onClick={() =>
            isLastQuestion
              ? router.push(`/mock-exam/attempt/${attempt.id}/sheet?from=${activeIndex}`)
              : handleNavigate(activeIndex + 1)
          }
          className={[
            'flex items-center gap-1.5 rounded-button px-4.5 py-2.5 text-secondary font-semibold shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]',
            isLastQuestion || multiSelectionComplete
              ? 'bg-btn-bg text-white'
              : 'bg-bg-alt text-ink-mute shadow-none',
          ].join(' ')}
        >
          {isLastQuestion ? t('mockExamViewAnswerSheet') : t('next')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </footer>
      <BottomSheet
        open={exitOpen && !discardOpen}
        onClose={() => setExitOpen(false)}
        closeLabel={t('close')}
        ariaLabelledby="mock-exam-exit-title"
        showCloseButton={false}
        wrapperClassName="!z-30"
        handleClassName="[&>div:first-child>div]:bg-border-strong [&>div:first-child>div]:opacity-60"
        panelClassName="max-h-[94%] border border-border !shadow-sheet"
        headerClassName="border-b border-border px-4 !pt-0 pb-3"
        contentClassName="px-4 pt-3 pb-4"
        header={
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-danger-soft text-danger-deep">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="mock-exam-exit-title" className="text-card font-bold text-ink">
                {t('mockExamExitTitle')}
              </h2>
              <p className="mt-0.5 text-secondary leading-relaxed text-ink-soft">
                {t('mockExamExitSubtitle')}
              </p>
            </div>
          </div>
        }
      >
        <div className="mb-3.5 flex gap-1.5">
          <MockExamModalStat label={t('mockExamAnswered')} value={answeredCount} tone="accent" />
          <MockExamModalStat label={t('mockExamFlagged')} value={flaggedCount} />
          <MockExamModalStat
            label={t('mockExamTimeLeft')}
            value={formatSeconds(remainingSeconds)}
            tone={timerWarning ? 'danger' : 'accentDeep'}
          />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExitOpen(false)}
            className="w-full rounded-button bg-btn-bg px-4 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
          >
            {t('mockExamStayInExam')}
          </button>
          <button
            type="button"
            onClick={() => void runtime.saveExit()}
            className="w-full rounded-button border-[1.5px] border-border bg-surface px-4 py-3 text-secondary font-semibold text-ink"
          >
            {t('mockExamSaveAndExit')}
          </button>
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-button border-[1.5px] border-danger bg-danger-soft px-4 py-3 text-secondary font-bold text-danger-deep"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('mockExamDiscardDraft')}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        closeLabel={t('close')}
        ariaLabelledby="mock-exam-discard-title"
        showCloseButton={false}
        wrapperClassName="!z-40"
        backdropClassName="!bg-black/55"
        handleClassName="[&>div:first-child>div]:bg-border-strong [&>div:first-child>div]:opacity-60"
        panelClassName="max-h-[94%] border border-border !shadow-sheet"
        headerClassName="border-b border-border px-4 !pt-0 pb-3"
        contentClassName="px-4 pt-3 pb-4"
        header={
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-danger-soft text-danger-deep">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="mock-exam-discard-title" className="text-card font-bold text-ink">
                {t('mockExamDiscardTitle')}
              </h2>
              <p className="mt-0.5 text-secondary leading-relaxed text-ink-soft">
                {t('mockExamDiscardSubtitle')}
              </p>
            </div>
          </div>
        }
      >
        <div className="mb-3.5 flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger-soft px-3.5 py-3 text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-secondary font-semibold leading-relaxed">
            {t('mockExamDiscardWarning')}
          </p>
        </div>
        <div className="mb-3.5 flex gap-1.5">
          <MockExamModalStat label={t('mockExamAnswered')} value={answeredCount} tone="muted" />
          <MockExamModalStat label={t('mockExamFlagged')} value={flaggedCount} tone="muted" />
          <MockExamModalStat
            label={t('mockExamTimeLeft')}
            value={formatSeconds(remainingSeconds)}
            tone="muted"
          />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setDiscardOpen(false)}
            className="w-full rounded-button bg-btn-bg px-4 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
          >
            {t('mockExamKeepDraft')}
          </button>
          <button
            type="button"
            onClick={() => void runtime.discard()}
            className="flex w-full items-center justify-center gap-1.5 rounded-button border-[1.5px] border-danger bg-danger px-4 py-3 text-secondary font-bold text-white shadow-[0_4px_12px_rgb(213_93_93_/_0.25)]"
          >
            <X className="h-3.5 w-3.5" />
            {t('mockExamDiscardConfirm')}
          </button>
        </div>
      </BottomSheet>
    </>
  )
}

function MockExamQuestionSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface" aria-busy="true">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="h-7 w-7 rounded-lg bg-bg-alt" />
          <div className="h-8 flex-1 rounded-pill border border-border bg-bg-alt" />
          <div className="h-8 w-16 rounded-lg border border-border bg-bg-alt" />
        </div>
        <div className="border-t border-border px-5 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="h-4 w-28 rounded bg-bg-alt" />
            <div className="h-4 w-14 rounded bg-bg-alt" />
          </div>
          <div className="h-1 rounded-full bg-bg-alt" />
        </div>
      </header>
      <main className="flex-1 space-y-4 px-5 pt-[18px] pb-4">
        <div className="space-y-2 rounded-card border border-border bg-surface p-4">
          <div className="h-4 w-3/4 rounded bg-bg-alt" />
          <div className="h-4 w-full rounded bg-bg-alt" />
          <div className="h-4 w-2/3 rounded bg-bg-alt" />
        </div>
        <div className="space-y-2.5">
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} className="h-14 rounded-card border border-border bg-surface p-3">
              <div className="h-full rounded bg-bg-alt" />
            </div>
          ))}
        </div>
      </main>
      <footer className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3 safe-bottom">
        <div className="h-10 w-20 rounded-button border border-border bg-bg-alt" />
        <div className="h-10 w-20 rounded-button border border-border bg-bg-alt" />
        <div className="flex-1" />
        <div className="h-10 w-20 rounded-button bg-bg-alt" />
      </footer>
    </>
  )
}

function getSafeRouteIndex(indexParam: string, attempt: MockExamAttempt | null | undefined) {
  if (!attempt) return null
  const index = Number(indexParam)
  if (!Number.isInteger(index)) return attempt.currentIndex
  return Math.min(Math.max(index, 0), Math.max(attempt.questions.length - 1, 0))
}

type MockExamModalStatTone = 'default' | 'accent' | 'accentDeep' | 'danger' | 'muted'

const MOCK_EXAM_MODAL_STAT_VALUE_TONE_CLASS: Record<MockExamModalStatTone, string> = {
  default: 'text-ink',
  accent: 'text-accent',
  accentDeep: 'text-accent-deep',
  danger: 'text-danger-deep',
  muted: 'text-ink-mute',
}

function MockExamModalStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: MockExamModalStatTone
}) {
  return (
    <fieldset
      aria-label={`${value} ${label}`}
      className="flex-1 rounded-[10px] bg-bg-alt px-1.5 py-2.5 text-center"
    >
      <legend className="sr-only">{`${value} ${label}`}</legend>
      <div
        className={[
          'font-bold text-[17px] leading-none tabular-nums',
          MOCK_EXAM_MODAL_STAT_VALUE_TONE_CLASS[tone],
        ].join(' ')}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-ink-mute">{label}</div>
    </fieldset>
  )
}

function formatSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}
