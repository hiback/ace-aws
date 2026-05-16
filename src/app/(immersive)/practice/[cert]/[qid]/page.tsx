'use client'
import { Bookmark, BookmarkCheck, Check, ChevronLeft, X } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { StickyFooter } from '@/components/chrome/sticky-footer'
import { ExplanationCard } from '@/components/domain/explanation-card'
import { MultiStatusLine } from '@/components/domain/multi-status-line'
import { OptionRow } from '@/components/domain/option-row'
import { OptionRowResult } from '@/components/domain/option-row-result'
import { QuestionStem } from '@/components/domain/question-stem'
import { StatusBanner } from '@/components/domain/status-banner'
import { VoteDistribution } from '@/components/domain/vote-distribution'
import { Button } from '@/components/primitives/button'
import { EmptyState } from '@/components/primitives/empty-state'
import { ProgressBar } from '@/components/primitives/progress-bar'
import { Spinner } from '@/components/primitives/spinner'
import { useProgressRepository } from '@/components/providers/progress-scope-provider'
import { normalizeCert } from '@/data/loaders'
import type { CertCode, Letter } from '@/data/types'
import {
  findNextListReviewQid,
  findNextUnansweredQid,
  useIsBookmarked,
  useQuestionProgress,
  useRecordAnswer,
  useToggleBookmark,
} from '@/hooks/use-answer'
import { useQuestion } from '@/hooks/use-question'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import {
  buildCompletionHref,
  buildPracticeHref,
  isListPracticeSource,
  normalizePracticeSource,
  parsePracticeSet,
} from '@/lib/practice-flow'
import { TOPIC_KEYS } from '@/lib/topic'
import { usePrefsStore } from '@/stores/prefs-store'

const RESULT_CHIP_CLASS = {
  correct: 'bg-success-soft text-success-deep',
  wrong: 'bg-danger-soft text-danger-deep',
  partial: 'bg-bg-alt text-accent-deep',
} as const

const RESULT_LABEL_KEY = {
  correct: 'bannerCorrect',
  wrong: 'bannerWrong',
  partial: 'bannerPartial',
} as const

function HeaderPartialMark() {
  return (
    <svg className="h-2.5 w-2.5" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M11 4.5 A6.5 6.5 0 0 1 11 17.5 Z" fill="currentColor" />
    </svg>
  )
}

export default function PracticePage() {
  const params = useParams<{ cert: string; qid: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const qid = Number(params.qid)
  const cert: CertCode = normalizeCert(params.cert)
  const source = normalizePracticeSource(searchParams.get('from'))
  const setRaw = searchParams.get('set')
  const isListReview = isListPracticeSource(source)
  const [selection, setSelection] = useState<{ qid: number; picks: Letter[] }>({ qid, picks: [] })
  const [resultModeQid, setResultModeQid] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const bank = useQuestionBank(cert)
  const question = useQuestion(qid, cert)
  const answer = useQuestionProgress(qid, cert)
  const bookmarked = useIsBookmarked(qid, cert)
  const recordAnswer = useRecordAnswer(cert)
  const toggleBookmark = useToggleBookmark(cert)
  const progressRepository = useProgressRepository()
  const picks = selection.qid === qid ? selection.picks : []

  if (question.isLoading || answer.isLoading || bank.isLoading) {
    return (
      <main className="flex-1 px-4 py-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader has no stable id
          <div key={i} className="h-14 rounded-option bg-bg-alt animate-pulse" />
        ))}
      </main>
    )
  }

  if (!question.data) {
    return (
      <main className="flex-1">
        <EmptyState
          title={t('questionNotFound')}
          action={<Button onClick={() => router.push('/')}>{t('backToHome')}</Button>}
        />
      </main>
    )
  }

  const q = question.data
  const total = bank.data?.length ?? 0
  const practiceSet = isListReview
    ? parsePracticeSet(setRaw, new Set(bank.data?.map((item) => item.id) ?? []))
    : null
  const listPosition = practiceSet?.indexOf(qid) ?? -1
  const displayCurrent = listPosition >= 0 ? listPosition + 1 : qid
  const displayTotal = listPosition >= 0 && practiceSet ? practiceSet.length : total
  const hasPreviousResult =
    answer.data?.lastAnsweredAt !== null && answer.data?.lastAnsweredAt !== undefined
  const submitted = hasPreviousResult && (!isListReview || resultModeQid === qid)
  const isMulti = q.type === 'multi'
  const required = q.type === 'multi' ? q.answer_count : 1
  const correctSorted = q.correct_answer
  const correctSet = new Set(correctSorted)
  const userPicksSorted = answer.data?.lastPicks ?? []
  const userPicksSet = new Set(userPicksSorted)

  const handlePick = (letter: Letter) => {
    if (submitted) return
    setSelection((prevSelection) => {
      const prev = prevSelection.qid === qid ? prevSelection.picks : []
      if (prev.includes(letter)) return { qid, picks: prev.filter((p) => p !== letter) }
      if (!isMulti) return { qid, picks: [letter] }
      if (prev.length < required) return { qid, picks: [...prev, letter] }
      return { qid, picks: [...prev.slice(1), letter] }
    })
  }

  const canSubmit = picks.length === required
  const handleSubmit = () => {
    if (!canSubmit || recordAnswer.isPending) return

    const sortedPicks = [...picks].sort() as Letter[]
    const correct =
      sortedPicks.length === correctSorted.length &&
      sortedPicks.every((p, i) => p === correctSorted[i])
    recordAnswer.mutate(
      { qid, picks, correct },
      {
        onSuccess: (_savedProgress, variables) => {
          if (variables.qid !== qid) return
          setResultModeQid(qid)
          setSelection({ qid, picks: [] })
        },
      },
    )
  }

  const handleViewLastResult = () => {
    setResultModeQid(qid)
  }

  const handleNext = () => {
    startTransition(async () => {
      if (isListReview) {
        const next = await findNextListReviewQid(qid, cert, source, setRaw, progressRepository)
        router.push(
          next === null
            ? buildCompletionHref(cert, source)
            : buildPracticeHref(cert, next, source, setRaw),
        )
        return
      }

      const next = await findNextUnansweredQid(qid, cert, progressRepository)
      router.push(
        next === null ? buildCompletionHref(cert, '/') : buildPracticeHref(cert, next, '/'),
      )
    })
  }

  const renderOptions = () => {
    const letters = Object.keys(q.en.options) as Letter[]
    if (!submitted) {
      return letters.map((letter) => (
        <OptionRow
          key={letter}
          letter={letter}
          text={(locale === 'zh' ? q.zh.options[letter] : q.en.options[letter]) ?? ''}
          selected={picks.includes(letter)}
          multi={isMulti}
          onClick={() => handlePick(letter)}
        />
      ))
    }
    return letters.map((letter) => {
      const isCorrect = correctSet.has(letter)
      const isPicked = userPicksSet.has(letter)
      let state: 'idle' | 'correct' | 'wrong' | 'missed-correct' = 'idle'
      if (isPicked && isCorrect) state = 'correct'
      else if (isPicked && !isCorrect) state = 'wrong'
      else if (!isPicked && isCorrect) state = 'missed-correct'
      return (
        <OptionRowResult
          key={letter}
          letter={letter}
          text={(locale === 'zh' ? q.zh.options[letter] : q.en.options[letter]) ?? ''}
          state={state}
          multi={isMulti}
        />
      )
    })
  }

  const bannerTone: 'correct' | 'wrong' | 'partial' = (() => {
    if (!answer.data) return 'correct'
    if (answer.data.lastCorrect) return 'correct'
    if (isMulti) {
      const someCorrect = userPicksSorted.some((p) => correctSet.has(p))
      if (someCorrect) return 'partial'
    }
    return 'wrong'
  })()

  const correctKey = correctSorted.join('')
  const userKey = userPicksSorted.join('')
  const topicLabel = TOPIC_KEYS[q.topic] ? t(TOPIC_KEYS[q.topic]) : q.topic
  const resultChip = submitted ? (
    <span
      className={[
        'inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.05em]',
        'rounded-pill px-2 py-1',
        RESULT_CHIP_CLASS[bannerTone],
      ].join(' ')}
    >
      {bannerTone === 'correct' ? (
        <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
      ) : bannerTone === 'wrong' ? (
        <X className="h-2.5 w-2.5" strokeWidth={2.5} />
      ) : (
        <HeaderPartialMark />
      )}
      {t(RESULT_LABEL_KEY[bannerTone])}
    </span>
  ) : null

  return (
    <>
      <header className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="px-5 pt-3 pb-3.5">
          <div className="mb-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(source)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink"
              aria-label={t('back')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 text-center">
              <p className="font-mono text-helper text-ink-mute font-medium tracking-wide truncate">
                {cert.toUpperCase()} · {topicLabel}
              </p>
              <p className="mt-0.5 text-option font-semibold text-ink flex items-center justify-center gap-2">
                <span>
                  {t('practiceCountPrefix')}{' '}
                  <span className="text-accent font-bold">{displayCurrent}</span>{' '}
                  {t('practiceCountMiddle')} {displayTotal}
                  {t('practiceCountSuffix') ? ` ${t('practiceCountSuffix')}` : ''}
                </span>
                {resultChip ?? (
                  <span
                    className={[
                      'font-mono uppercase font-bold tracking-wider',
                      'text-[10px] leading-none px-1.5 py-1 rounded-badge',
                      isMulti ? 'bg-accent-soft text-accent-deep' : 'bg-bg-alt text-ink-soft',
                    ].join(' ')}
                  >
                    {isMulti ? t('badgeMulti', { n: required }) : t('badgeSingle')}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleBookmark.mutate(qid)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft"
              aria-label={t('bookmark')}
            >
              {bookmarked.data ? (
                <BookmarkCheck className="w-5 h-5 text-accent" strokeWidth={2.25} />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
          </div>
          <ProgressBar value={displayCurrent / Math.max(displayTotal, 1)} height={4} />
        </div>
      </header>

      <main className="flex-1 px-5 pt-4 pb-6 space-y-4">
        <QuestionStem
          zhQuestion={q.zh.question}
          enQuestion={q.en.question}
          enOptions={q.en.options}
          hint={
            !submitted && isMulti ? (
              <MultiStatusLine selected={picks.length} required={required} />
            ) : null
          }
        />

        <div className="space-y-2">{renderOptions()}</div>

        {submitted ? (
          <>
            <StatusBanner
              tone={bannerTone}
              correctLetters={correctSorted}
              userLetters={userPicksSorted}
            />
            <VoteDistribution
              distribution={q.vote_distribution}
              correctKey={correctKey}
              userKey={userKey}
              isMulti={isMulti}
            />
            <ExplanationCard zh={q.zh.explanation} en={q.en.explanation} locale={locale} />
          </>
        ) : null}
      </main>

      <StickyFooter>
        {submitted ? (
          <Button onClick={handleNext} className="w-full" disabled={pending}>
            {pending ? <Spinner size={16} /> : t('next')}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={isListReview && hasPreviousResult ? handleViewLastResult : handleNext}
              className="flex-1"
              disabled={recordAnswer.isPending}
            >
              {isListReview && hasPreviousResult ? t('viewLastResult') : t('skip')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || recordAnswer.isPending}
              className="flex-1"
            >
              {t('submit')}
            </Button>
          </>
        )}
      </StickyFooter>
    </>
  )
}
