'use client'
import { AlertTriangle, BookOpen, Trophy } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { EmptyState } from '@/components/primitives/empty-state'
import { ProgressBar } from '@/components/primitives/progress-bar'
import { useSubmittedMockExamAttempt } from '@/hooks/use-mock-exam'
import { useT } from '@/hooks/use-t'
import { MOCK_EXAM_DOMAIN_LABEL_KEYS } from '@/lib/mock-exam/domain-labels'
import { getMockExamProfile } from '@/lib/mock-exam/profile'

export default function MockExamResultPage() {
  const params = useParams<{ attemptId: string }>()
  const router = useRouter()
  const t = useT()
  const submittedQuery = useSubmittedMockExamAttempt(params.attemptId)

  if (submittedQuery.isPending) {
    return <ResultSkeleton />
  }

  const submitted = submittedQuery.data
  if (!submitted) {
    return <EmptyState title={t('questionNotFound')} />
  }

  const { summary } = submitted
  const profile = getMockExamProfile(submitted.cert)
  const heroStyle = {
    backgroundImage: summary.passed
      ? 'linear-gradient(160deg, var(--color-success-hero-from), var(--color-success-hero-to))'
      : 'linear-gradient(160deg, var(--color-danger-hero-from), var(--color-danger-hero-to))',
  }
  const domains = profile.domains.map((profileDomain) => {
    return (
      summary.domains.find((domain) => domain.name === profileDomain.name) ?? {
        name: profileDomain.name,
        correctCount: 0,
        totalCount: 0,
        accuracy: 0,
        weight: profileDomain.weight,
      }
    )
  })

  return (
    <main className="flex-1 overflow-auto">
      <section
        className="relative overflow-hidden px-5 py-7 text-center text-white"
        style={heroStyle}
      >
        <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/20">
          {summary.passed ? <Trophy className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </div>
        <p className="relative font-mono text-[12px] font-bold uppercase tracking-[0.08em] opacity-85">
          {summary.passed ? t('mockExamPassed') : t('mockExamFailed')}
        </p>
        <h1 className="relative mt-1 text-[64px] font-bold leading-none tracking-[-0.04em]">
          {summary.score}
        </h1>
        <p className="relative mt-1 text-secondary opacity-85">
          {t('mockExamOutOf1000')} · {t('mockExamPassScore')} {profile.passingScore}
        </p>
      </section>

      <section className="space-y-4 px-5 pt-[18px] pb-5">
        <div className="grid grid-cols-3 gap-2">
          <SmallStat
            label={t('mockExamCorrect')}
            value={`${summary.correctCount}/${summary.totalCount}`}
            accent="text-success"
          />
          <SmallStat
            label={t('mockExamAccuracy')}
            value={`${Math.round(summary.accuracy * 100)}%`}
          />
          <SmallStat
            label={t('mockExamTimeUsed')}
            value={formatDuration(summary.timeUsedSeconds)}
          />
        </div>
        <section>
          <h2 className="mb-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-ink-mute">
            {t('mockExamBreakdown')}
          </h2>
          <div className="space-y-3 rounded-[14px] border border-border bg-surface p-3.5">
            {domains.map((domain) => {
              const pct = Math.round(domain.accuracy * 100)
              const labelKey = MOCK_EXAM_DOMAIN_LABEL_KEYS[domain.name]
              return (
                <div key={domain.name}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-secondary font-medium text-ink">
                      {labelKey ? t(labelKey) : domain.name}
                    </span>
                    <span className="font-mono text-[10px] text-ink-mute">{domain.weight}%</span>
                    <span
                      className={[
                        'w-9 text-right font-mono text-secondary font-bold',
                        pct >= 65 ? 'text-success-deep' : 'text-danger-deep',
                      ].join(' ')}
                    >
                      {pct}%
                    </span>
                  </div>
                  <ProgressBar value={domain.accuracy} height={6} />
                </div>
              )
            })}
          </div>
        </section>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.push(`/mock-exam/attempt/${submitted.id}/review/0`)}
            className="flex w-full items-center justify-center gap-1.5 rounded-button bg-btn-bg px-4 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_rgb(99_102_241_/_0.25)]"
          >
            <BookOpen className="h-[15px] w-[15px]" />
            {t('mockExamReviewAnswers')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full rounded-button px-4 py-2.5 text-[14px] font-medium text-ink-soft"
          >
            {t('backToHome')}
          </button>
        </div>
      </section>
    </main>
  )
}

function ResultSkeleton() {
  return (
    <main aria-busy="true" className="flex-1 overflow-auto">
      <section
        className="relative overflow-hidden px-5 py-7 text-center text-white"
        style={{
          backgroundImage: 'linear-gradient(160deg, var(--color-hero-from), var(--color-hero-to))',
        }}
      >
        <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative mx-auto mb-3 h-14 w-14 rounded-full border-2 border-white/30 bg-white/20" />
        <div className="relative mx-auto h-3 w-20 rounded-full bg-white/25" />
        <div className="relative mx-auto mt-3 h-14 w-28 rounded-[14px] bg-white/25" />
        <div className="relative mx-auto mt-3 h-3.5 w-44 rounded-full bg-white/20" />
      </section>

      <section className="space-y-4 px-5 pt-[18px] pb-5">
        <div className="grid grid-cols-3 gap-2">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <section>
          <div className="mb-2.5 h-3 w-24 rounded-full bg-bg-alt" />
          <div className="space-y-3 rounded-[14px] border border-border bg-surface p-3.5">
            {RESULT_SKELETON_DOMAIN_KEYS.map((key) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center gap-2">
                  <div className="h-3.5 flex-1 rounded-full bg-bg-alt" />
                  <div className="h-3 w-7 rounded-full bg-bg-alt" />
                  <div className="h-3.5 w-9 rounded-full bg-bg-alt" />
                </div>
                <div className="h-1.5 rounded-full bg-bg-alt" />
              </div>
            ))}
          </div>
        </section>

        <div data-testid="mock-exam-result-skeleton-actions" className="space-y-2">
          <div className="h-11 rounded-button bg-bg-alt" />
          <div className="mx-auto h-9 w-28 rounded-button bg-bg-alt" />
        </div>
      </section>
    </main>
  )
}

function SkeletonStat() {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-2 py-2.5 text-center">
      <div className="mx-auto h-5 w-10 rounded-full bg-bg-alt" />
      <div className="mx-auto mt-1 h-2.5 w-14 rounded-full bg-bg-alt" />
    </div>
  )
}

const RESULT_SKELETON_DOMAIN_KEYS = ['domain-1', 'domain-2', 'domain-3', 'domain-4']

function SmallStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-2 py-2.5 text-center">
      <div className={['text-card font-bold leading-none', accent ?? 'text-ink'].join(' ')}>
        {value}
      </div>
      <div className="mt-1 text-[10px] text-ink-mute">{label}</div>
    </div>
  )
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}
