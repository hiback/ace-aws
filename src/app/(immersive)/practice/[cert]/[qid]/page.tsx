'use client'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { StickyFooter } from '@/components/chrome/sticky-footer'
import { TopBar } from '@/components/chrome/top-bar'
import { ExplanationCard } from '@/components/domain/explanation-card'
import { MultiStatusLine } from '@/components/domain/multi-status-line'
import { MultiVoteDistribution } from '@/components/domain/multi-vote-distribution'
import { OptionRow } from '@/components/domain/option-row'
import { OptionRowResult } from '@/components/domain/option-row-result'
import { QuestionStem } from '@/components/domain/question-stem'
import { StatusBanner } from '@/components/domain/status-banner'
import { Button } from '@/components/primitives/button'
import { EmptyState } from '@/components/primitives/empty-state'
import { Pill } from '@/components/primitives/pill'
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
import { usePrefsStore } from '@/stores/prefs-store'

export default function PracticePage() {
  const params = useParams<{ cert: CertCode; qid: string }>()
  const router = useRouter()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const qid = Number(params.qid)
  const cert = params.cert
  const [picks, setPicks] = useState<Letter[]>([])
  const [pending, startTransition] = useTransition()

  const bank = useQuestionBank(cert)
  const question = useQuestion(qid, cert)
  const answer = useAnswer(qid)
  const bookmarked = useIsBookmarked(qid)
  const saveAnswer = useSaveAnswer()
  const toggleBookmark = useToggleBookmark()

  useEffect(() => {
    setPicks([])
  }, [])

  if (question.isLoading || answer.isLoading || bank.isLoading) {
    return (
      <>
        <TopBar title="..." />
        <div className="px-4 py-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader has no stable id
            <div key={i} className="h-14 rounded-option bg-bg-alt animate-pulse" />
          ))}
        </div>
      </>
    )
  }

  if (!question.data) {
    return (
      <>
        <TopBar title="" />
        <EmptyState
          title={t('questionNotFound')}
          action={<Button onClick={() => router.push('/')}>{t('backToHome')}</Button>}
        />
      </>
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
    setPicks((prev) => {
      if (prev.includes(letter)) return prev.filter((p) => p !== letter)
      if (!isMulti) return [letter]
      if (prev.length < required) return [...prev, letter]
      return [...prev.slice(1), letter]
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
      else router.push(`/practice/${cert}/${next}`)
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
      const showVoteBar = q.type === 'single'
      const votePercent = q.type === 'single' ? q.vote_distribution[letter] : undefined
      return (
        <OptionRowResult
          key={letter}
          letter={letter}
          text={(locale === 'zh' ? q.zh.options[letter] : q.en.options[letter]) ?? ''}
          state={state}
          showVoteBar={showVoteBar}
          votePercent={votePercent}
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

  return (
    <>
      <TopBar
        title={
          <span className="font-mono text-secondary text-ink-mute">
            {cert} · {q.topic}
          </span>
        }
        rightAction={
          <button
            type="button"
            onClick={() => toggleBookmark.mutate(qid)}
            className="p-2 text-ink-soft"
            aria-label="Bookmark"
          >
            {bookmarked.data ? (
              <BookmarkCheck className="w-5 h-5 text-accent" strokeWidth={2.25} />
            ) : (
              <Bookmark className="w-5 h-5" />
            )}
          </button>
        }
      />
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-secondary text-ink-mute font-mono">
            {t('questionXofY', { x: qid, y: total })}
          </span>
          <Pill tone={isMulti ? 'accent' : 'default'}>
            {isMulti ? t('badgeMulti', { n: required }) : t('badgeSingle')}
          </Pill>
        </div>
        <ProgressBar value={qid / Math.max(total, 1)} height={2} />
      </div>

      <main className="px-4 pt-3 pb-32 space-y-4">
        <QuestionStem zh={q.zh.question} en={q.en.question} />

        {!submitted && isMulti ? (
          <MultiStatusLine selected={picks.length} required={required} />
        ) : null}

        <div className="space-y-2">{renderOptions()}</div>

        {submitted ? (
          <>
            <StatusBanner tone={bannerTone} />
            {q.type === 'multi' ? (
              <MultiVoteDistribution distribution={q.vote_distribution} correctKey={correctKey} />
            ) : null}
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
