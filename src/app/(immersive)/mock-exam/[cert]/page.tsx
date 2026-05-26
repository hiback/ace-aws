'use client'
import { ChartBar, ChevronLeft, ChevronRight, Info, Trophy } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives/button'
import { Spinner } from '@/components/primitives/spinner'
import { loadBank, normalizeCert } from '@/data/loaders'
import type { Locale } from '@/data/types'
import { useMockExamHistory, useSaveMockExamDraft } from '@/hooks/use-mock-exam'
import { useT } from '@/hooks/use-t'
import { getMockExamProfile } from '@/lib/mock-exam/profile'
import { startMockExamAttempt } from '@/lib/mock-exam/start-attempt'
import { usePrefsStore } from '@/stores/prefs-store'

export default function MockExamIntroPage() {
  const params = useParams<{ cert: string }>()
  const router = useRouter()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const cert = normalizeCert(params.cert)
  const profile = getMockExamProfile(cert)
  const history = useMockExamHistory(cert).data
  const saveMockExamDraft = useSaveMockExamDraft()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  const handleStart = () => {
    setError(false)
    startTransition(async () => {
      try {
        const bank = await loadBank(cert)
        const attempt = startMockExamAttempt({ bank, cert })
        await saveMockExamDraft.mutateAsync(attempt)
        router.push(`/mock-exam/attempt/${attempt.id}/0`)
      } catch (err) {
        console.error('Failed to start mock exam attempt', err)
        setError(true)
      }
    })
  }

  return (
    <>
      <header className="shrink-0 border-b border-border bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink"
            aria-label={t('back')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[13px] font-semibold text-ink">{t('mockExam')}</p>
            <p className="font-mono text-[10px] tracking-[0.04em] text-ink-mute">{cert}</p>
          </div>
          <div className="h-8 w-8" />
        </div>
      </header>
      <main className="flex-1 overflow-auto px-5 pt-[22px] pb-4">
        <section
          className="relative mb-[18px] overflow-hidden rounded-[18px] px-[18px] py-5 text-white"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))',
          }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <Trophy className="absolute right-5 top-5 h-7 w-7 opacity-40" />
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em]">
            {t('mockExam')}
          </h1>
          <p className="mt-1 max-w-[230px] text-secondary leading-snug text-white/85">
            {t('mockExamFullSimulation')}
          </p>
          <div className="mt-4 flex gap-4">
            <ExamStat value={profile.questionCount} unit={t('mockExamQuestions')} />
            <Divider />
            <ExamStat value={profile.timeLimitMinutes} unit={t('mockExamMinutes')} />
            <Divider />
            <ExamStat value={profile.passingScore} unit={t('mockExamPassScoreUnit')} />
          </div>
        </section>

        {history === undefined ? null : history.length > 0 ? (
          <button
            type="button"
            onClick={() => router.push(`/mock-exam/${cert.toLowerCase()}/history`)}
            className="mb-[18px] flex w-full items-center gap-3 rounded-[12px] border border-border bg-bg-alt px-3.5 py-3 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-ink-soft">
              <ChartBar className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="text-secondary text-ink-mute">{t('mockExamHistory')}</span>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.05em] text-accent-deep">
                  {t('mockExamAttemptsLabel', { count: history.length })}
                </span>
              </div>
              <div className="text-card font-semibold text-ink">
                <span className={history[0].summary.passed ? 'text-success' : 'text-danger'}>
                  {history[0].summary.score}
                </span>
                <span className="text-secondary font-normal text-ink-mute"> / 1000</span>
                <span className="ml-2 font-mono text-[11px] font-normal text-ink-mute">
                  · {t('mockExamLatest')} ·{' '}
                  {formatRelativeSubmittedAt(history[0].submittedAt, locale)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-ink-mute" />
          </button>
        ) : (
          <section className="mb-[18px] rounded-[12px] border border-dashed border-accent/40 bg-accent-softer px-3.5 py-3">
            <div className="flex gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-deep">
                <Trophy className="h-3.5 w-3.5" />
              </div>
              <div>
                <h2 className="text-secondary font-bold text-accent-deep">
                  {t('mockExamFirstTimeTitle')}
                </h2>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
                  {t('mockExamFirstTimeDescription', { minutes: profile.timeLimitMinutes })}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="mb-4">
          <h2 className="flex items-center gap-1.5 font-mono text-helper font-bold uppercase tracking-[0.05em] text-ink-mute">
            <Info className="h-3 w-3" />
            {t('mockExamRules')}
          </h2>
          <div className="mt-2.5 space-y-2">
            {[
              'mockExamRuleAllQuestionsScore',
              'mockExamRuleExplanationsHidden',
              'mockExamRuleUnansweredWrong',
              'mockExamRuleFlagQuestions',
              'mockExamRuleSaveExit',
            ].map((key, index) => (
              <div key={key} className="flex items-start gap-2.5">
                <span className="min-w-5 font-mono text-[10px] font-bold tracking-[0.05em] text-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-secondary leading-relaxed text-ink-soft">
                  {t(key as Parameters<typeof t>[0])}
                </span>
              </div>
            ))}
          </div>
        </section>

        {error ? <p className="text-secondary text-danger">{t('mockExamStartError')}</p> : null}
      </main>
      <footer className="shrink-0 border-t border-border bg-surface px-5 pt-3 pb-4 safe-bottom">
        <Button
          onClick={handleStart}
          fullWidth
          disabled={pending}
          className="gap-2"
          style={{
            boxShadow: '0 4px 12px color-mix(in srgb, var(--color-btn-bg) 40%, transparent)',
          }}
        >
          {pending ? <Spinner size={16} /> : <Trophy className="h-4 w-4" />}
          {t('mockExamBegin')}
        </Button>
      </footer>
    </>
  )
}

function ExamStat({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[22px] font-bold leading-none tracking-[-0.03em]">{value}</span>
      <span className="mt-1 text-[10.5px] text-white/85">{unit}</span>
    </div>
  )
}

function Divider() {
  return <div className="w-px self-stretch bg-white/25" />
}

function formatRelativeSubmittedAt(submittedAt: number, locale: Locale) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000))
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]
  const [unit, secondsPerUnit] =
    units.find(([, secondsPerUnit]) => elapsedSeconds >= secondsPerUnit) ?? units[units.length - 1]
  const value = Math.max(1, Math.floor(elapsedSeconds / secondsPerUnit))

  return new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    numeric: 'always',
    style: 'narrow',
  }).format(-value, unit)
}
