'use client'

import { CheckCircle2 } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives/button'
import { EmptyState } from '@/components/primitives/empty-state'
import { Spinner } from '@/components/primitives/spinner'
import { useProgressModule } from '@/components/providers/progress-scope-provider'
import { loadBank, normalizeCert } from '@/data/loaders'
import { useQuestionBank } from '@/hooks/use-question-bank'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import { buildPracticeHref, normalizePracticeSource, parsePracticeSet } from '@/lib/practice-flow'
import {
  buildSmartPracticeSessionQids,
  SMART_PRACTICE_SESSION_SIZE,
} from '@/lib/smart-practice-session'

const COMPLETION_COPY = {
  '/': {
    title: 'practiceCompleteTitle',
    description: 'practiceCompleteDescription',
    primaryLabel: 'backToHome',
    primaryHref: '/',
    secondaryLabel: null,
    secondaryHref: null,
  },
  '/list': {
    title: 'allQuestionsReviewCompleteTitle',
    description: 'allQuestionsReviewCompleteDescription',
    primaryLabel: 'backToList',
    primaryHref: '/list',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
  '/list/wrong': {
    title: 'wrongReviewCompleteTitle',
    description: 'wrongReviewCompleteDescription',
    primaryLabel: 'backToWrongList',
    primaryHref: '/list/wrong',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
  '/list/bookmarks': {
    title: 'bookmarksReviewCompleteTitle',
    description: 'bookmarksReviewCompleteDescription',
    primaryLabel: 'backToBookmarks',
    primaryHref: '/list/bookmarks',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
  '/list/unanswered': {
    title: 'unansweredReviewCompleteTitle',
    description: 'unansweredReviewCompleteDescription',
    primaryLabel: 'backToUnanswered',
    primaryHref: '/list/unanswered',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
  '/wrong-redo': {
    title: 'wrongRedoCompleteTitle',
    description: 'wrongRedoCompleteDescription',
    primaryLabel: 'backToHome',
    primaryHref: '/',
    secondaryLabel: null,
    secondaryHref: null,
  },
} as const

export default function PracticeCompletePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const source = normalizePracticeSource(searchParams.get('from'))

  if (source === '/smart-practice') return <SmartPracticeCompletePage />

  const copy = COMPLETION_COPY[source]

  return (
    <main className="flex-1">
      <EmptyState
        icon={CheckCircle2}
        title={t(copy.title)}
        description={t(copy.description)}
        className="min-h-dvh"
        action={
          <div className="flex w-full min-w-56 flex-col gap-2">
            <Button onClick={() => router.push(copy.primaryHref)} fullWidth>
              {t(copy.primaryLabel)}
            </Button>
            {copy.secondaryHref && copy.secondaryLabel ? (
              <Button variant="outline" onClick={() => router.push(copy.secondaryHref)} fullWidth>
                {t(copy.secondaryLabel)}
              </Button>
            ) : null}
          </div>
        }
      />
    </main>
  )
}

function SmartPracticeCompletePage() {
  const params = useParams<{ cert: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const { toast } = useToast()
  const progress = useProgressModule()
  const cert = normalizeCert(params.cert)
  const bank = useQuestionBank(cert)
  const [pending, setPending] = useState(false)
  const bankIds = bank.data ? new Set(bank.data.map((question) => question.id)) : null
  const practiceSet = bankIds
    ? parsePracticeSet(searchParams.get('set'), bankIds, {
        maxItems: SMART_PRACTICE_SESSION_SIZE,
      })
    : null

  useEffect(() => {
    if (!bank.isLoading && bank.data && practiceSet === null) router.push('/')
  }, [bank.data, bank.isLoading, practiceSet, router])

  if (bank.isLoading || !bank.data) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center">
        <Spinner />
      </main>
    )
  }

  if (practiceSet === null) return null

  const progressByQid = new Map(progress.listProgress(cert).map((entry) => [entry.qid, entry]))
  const roundSize = practiceSet.length
  let correctCount = 0

  for (const qid of practiceSet) {
    if (progressByQid.get(qid)?.lastCorrect === true) correctCount += 1
  }

  const wrongCount = roundSize - correctCount
  const accuracy = roundSize > 0 ? Math.round((correctCount / roundSize) * 100) : 0
  const completionRing = `conic-gradient(var(--color-success) 0% ${accuracy}%, var(--color-bg-alt) ${accuracy}% 100%)`

  const handleAgain = async () => {
    if (pending) return

    setPending(true)
    try {
      const nextBank = await loadBank(cert)
      const qids = buildSmartPracticeSessionQids(
        nextBank.map((question) => question.id),
        progress.listProgress(cert),
      )
      if (qids.length === 0) {
        toast(t('homeSmartPracticeError'))
        setPending(false)
        return
      }
      router.push(buildPracticeHref(cert, qids[0], '/smart-practice', qids))
    } catch (error) {
      console.error('Failed to start smart practice session', error)
      toast(t('homeSmartPracticeError'))
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-auto px-6 py-6">
        <section className="flex min-h-[calc(100dvh-3rem)] items-center">
          <div className="w-full">
            <section className="py-5 text-center">
              <div
                className="mx-auto mb-4 flex h-[120px] w-[120px] items-center justify-center rounded-full"
                style={{ background: completionRing }}
                role="img"
                aria-label={t('smartPracticeCompleteHeadline', {
                  correct: correctCount,
                  total: roundSize,
                })}
              >
                <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-surface">
                  <div className="text-[28px] font-bold leading-none tracking-[-0.6px] text-ink">
                    {correctCount}
                    <span className="text-[14px] font-medium text-ink-mute">/{roundSize}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-ink-mute">
                    {t('smartPracticeRingLabel')}
                  </div>
                </div>
              </div>

              <h1 className="text-[22px] font-bold tracking-[-0.5px] text-ink">
                {t('smartPracticeCompleteTitle')} 🎉
              </h1>
              <p className="mt-1 text-[13px] text-ink-mute">
                {t('smartPracticeCompleteDescription', { count: roundSize })}
              </p>
            </section>

            <dl className="mb-[18px] grid grid-cols-3 gap-2">
              <SmartStat
                label={t('smartPracticeStatAccuracy')}
                value={accuracy}
                unit="%"
                tone="success"
              />
              <SmartStat label={t('smartPracticeStatWrong')} value={wrongCount} tone="danger" />
              <SmartStat
                label={t('smartPracticeStatRoundSize')}
                value={roundSize}
                unit={t('smartPracticeStatRoundUnit')}
              />
            </dl>

            <button
              type="button"
              onClick={handleAgain}
              disabled={pending}
              className="mb-2 w-full rounded-[14px] bg-btn-bg px-4 py-[14px] text-[14px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:bg-bg-alt disabled:text-ink-mute"
              style={{
                boxShadow: '0 4px 12px color-mix(in srgb, var(--color-btn-bg) 25%, transparent)',
              }}
            >
              {pending ? t('smartPracticeAgainPending') : t('smartPracticeAgain')}
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full rounded-[14px] border border-border bg-transparent px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-bg-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t('backToHome')}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function SmartStat({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string
  value: string | number
  unit?: string
  tone?: 'default' | 'success' | 'danger'
}) {
  const valueClassName = {
    default: 'text-ink',
    success: 'text-success',
    danger: 'text-danger',
  }[tone]

  return (
    <div className="rounded-[14px] border border-border bg-surface px-3 py-[14px] text-center">
      <dd
        className={['text-[22px] font-bold leading-none tracking-[-0.6px]', valueClassName].join(
          ' ',
        )}
      >
        {value}
        {unit ? <span className="ml-0.5 text-[12px] font-medium text-ink-mute">{unit}</span> : null}
      </dd>
      <dt className="mt-1 text-[10.5px] text-ink-mute">{label}</dt>
    </div>
  )
}
