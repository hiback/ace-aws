'use client'
import { Bookmark, BookmarkCheck, ChevronLeft } from 'lucide-react'
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
import type { CertCode, Letter } from '@/data/types'
import {
  findNextUnansweredQid,
  useAnswer,
  useIsBookmarked,
  useSaveAnswer,
  useToggleBookmark,
} from '@/hooks/use-answer'
import { useQuestion } from '@/hooks/use-question'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { TOPIC_KEYS } from '@/lib/topic'
import { usePrefsStore } from '@/stores/prefs-store'

const ALLOWED_FROM = new Set(['/', '/list/wrong', '/list/bookmarks'])

export default function PracticePage() {
  const params = useParams<{ cert: CertCode; qid: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const qid = Number(params.qid)
  const cert = params.cert
  const fromRaw = searchParams.get('from')
  const from = fromRaw && ALLOWED_FROM.has(fromRaw) ? fromRaw : '/'
  const fromQuery = `?from=${encodeURIComponent(from)}`
  const [selection, setSelection] = useState<{ qid: number; picks: Letter[] }>({ qid, picks: [] })
  const [pending, startTransition] = useTransition()

  const bank = useQuestionBank(cert)
  const question = useQuestion(qid, cert)
  const answer = useAnswer(qid)
  const bookmarked = useIsBookmarked(qid)
  const saveAnswer = useSaveAnswer()
  const toggleBookmark = useToggleBookmark()
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
  const submitted = answer.data !== null && answer.data !== undefined
  const isMulti = q.type === 'multi'
  const required = q.type === 'multi' ? q.answer_count : 1
  const correctSorted = q.correct_answer
  const correctSet = new Set(correctSorted)
  const userPicksSorted = answer.data?.picks ?? []
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
    const sortedPicks = [...picks].sort() as Letter[]
    const correct =
      sortedPicks.length === correctSorted.length &&
      sortedPicks.every((p, i) => p === correctSorted[i])
    saveAnswer.mutate({ qid, picks, correct })
  }

  const handleNext = () => {
    startTransition(async () => {
      const next = await findNextUnansweredQid(qid, cert)
      if (next === null) router.push('/list/wrong')
      else router.push(`/practice/${cert}/${next}${fromQuery}`)
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
        />
      )
    })
  }

  const bannerTone: 'correct' | 'wrong' | 'partial' = (() => {
    if (!answer.data) return 'correct'
    if (answer.data.correct) return 'correct'
    if (isMulti) {
      const someCorrect = userPicksSorted.some((p) => correctSet.has(p))
      if (someCorrect) return 'partial'
    }
    return 'wrong'
  })()

  const correctKey = correctSorted.join('')
  const topicLabel = TOPIC_KEYS[q.topic] ? t(TOPIC_KEYS[q.topic]) : q.topic

  return (
    <>
      <header className="sticky top-0 z-10 bg-surface border-b border-border">
        <div className="px-3 pt-3 pb-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(from)}
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
                {t('practiceCountPrefix')} <span className="text-accent font-bold">{qid}</span>{' '}
                {t('practiceCountMiddle')} {total}
                {t('practiceCountSuffix') ? ` ${t('practiceCountSuffix')}` : ''}
              </span>
              <span
                className={[
                  'font-mono uppercase font-bold tracking-wider',
                  'text-[10px] leading-none px-1.5 py-1 rounded-badge',
                  isMulti ? 'bg-accent-soft text-accent-deep' : 'bg-bg-alt text-ink-soft',
                ].join(' ')}
              >
                {isMulti ? t('badgeMulti', { n: required }) : t('badgeSingle')}
              </span>
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
        <ProgressBar value={qid / Math.max(total, 1)} height={4} className="rounded-none" />
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
            <VoteDistribution distribution={q.vote_distribution} correctKey={correctKey} />
            <ExplanationCard zh={q.zh.explanation} en={q.en.explanation} locale={locale} />
          </>
        ) : null}
      </main>

      <StickyFooter>
        {submitted ? (
          <>
            <Button variant="outline" onClick={handleNext} className="flex-1" disabled={pending}>
              {t('skip')}
            </Button>
            <Button onClick={handleNext} className="flex-1" disabled={pending}>
              {pending ? <Spinner size={16} /> : t('next')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={handleNext} className="flex-1">
              {t('skip')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || saveAnswer.isPending}
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
