'use client'

import { ChevronRight, Trophy } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { MockExamScoreChart } from '@/components/mock-exam/score-chart'
import { Spinner } from '@/components/primitives/spinner'
import type { CertCode, Locale } from '@/data/types'
import { useMockExamHistory } from '@/hooks/use-mock-exam'
import {
  useDailyQuestionStats,
  useProgressStats,
  useStatsStreak,
  useWeakAreaStats,
} from '@/hooks/use-progress-stats'
import { useT } from '@/hooks/use-t'
import { getMockExamProfile } from '@/lib/mock-exam/profile'
import { TOPIC_KEYS } from '@/lib/topic'
import { usePrefsStore } from '@/stores/prefs-store'

export default function StatsPage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <StatsContent cert={currentCert} />
}

function StatsContent({ cert }: { cert: CertCode }) {
  const t = useT()
  const dailyStats = useDailyQuestionStats(cert)
  const progressStats = useProgressStats(cert)
  const streak = useStatsStreak(cert)
  const weakAreas = useWeakAreaStats(cert)
  const mockExamHistory = useMockExamHistory(cert)
  const mockExamProfile = getMockExamProfile(cert)
  const rows = dailyStats.data ?? []
  const maxAnswered = Math.max(1, ...rows.map((row) => row.answered))
  const answered = progressStats.data?.answered ?? 0
  const correct = progressStats.data?.correct ?? 0
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0

  return (
    <div className="flex min-h-full flex-col overflow-hidden">
      <header className="border-border border-b bg-surface px-5 py-[14px] text-center">
        <h1 className="text-[16px] font-semibold text-ink leading-tight">{t('statsTitle')}</h1>
      </header>

      <main className="flex-1 overflow-auto px-5 pt-[14px] pb-20">
        <div className="mb-[14px] grid grid-cols-3 gap-2">
          <StatCell
            label={t('statsStreak')}
            value={streak.data ?? 0}
            unit={t('statsStreakUnit')}
            accent="accent"
          />
          <StatCell label={t('homeAnswered')} value={answered} />
          <StatCell label={t('homeAccuracy')} value={accuracy} unit="%" accent="success" />
        </div>

        <MockExamStatsCard
          cert={cert}
          isLoading={mockExamHistory.isLoading}
          attempts={mockExamHistory.data ?? []}
          passScore={mockExamProfile.passingScore}
        />

        <SectionCard title={t('statsRecent7Title')}>
          {dailyStats.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner label={t('loading')} />
            </div>
          ) : (
            <RecentSevenDaysChart rows={rows} maxAnswered={maxAnswered} />
          )}
        </SectionCard>

        <SectionCard title={t('statsWeakAreasTitle')}>
          {weakAreas.isLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Spinner label={t('loading')} />
            </div>
          ) : weakAreas.data && weakAreas.data.length > 0 ? (
            <div className="flex flex-col gap-3">
              {weakAreas.data.map((area) => {
                const labelKey = TOPIC_KEYS[area.topic]
                return (
                  <TopicBar
                    key={area.topic}
                    label={labelKey ? t(labelKey) : area.topic}
                    pct={area.accuracy}
                    wrong={area.wrong}
                  />
                )
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-bg-alt px-3 py-3 text-[12px] text-ink-soft leading-[1.45]">
              {t('statsWeakAreasLowData')}
            </p>
          )}
        </SectionCard>
      </main>
    </div>
  )
}

function StatCell({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string | number
  unit?: string
  accent?: 'accent' | 'success'
}) {
  const valueColor =
    accent === 'accent' ? 'text-accent' : accent === 'success' ? 'text-success' : 'text-ink'

  return (
    <div className="rounded-[12px] border border-border bg-surface px-2 py-2.5 text-center">
      <p className={`font-bold text-[18px] leading-[1.1] tracking-[-0.4px] ${valueColor}`}>
        {value}
        {unit ? <span className="ml-px text-[11px] text-ink-mute">{unit}</span> : null}
      </p>
      <p className="mt-[3px] text-[10px] text-ink-mute tracking-[0.2px]">{label}</p>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-[14px] rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-[14px] font-bold text-[13px] text-ink tracking-[-0.2px]">{title}</h2>
      {children}
    </section>
  )
}

function MockExamStatsCard({
  cert,
  isLoading,
  attempts,
  passScore,
}: {
  cert: CertCode
  isLoading: boolean
  attempts: NonNullable<ReturnType<typeof useMockExamHistory>['data']>
  passScore: number
}) {
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const latest = attempts[0]
  const historyHref = `/mock-exam/${cert.toLowerCase()}/history`
  const titleRow = (
    <div className="flex items-center gap-2">
      <span className="font-bold text-[13px] text-ink tracking-[-0.2px]">
        {t('statsMockExamScoreTitle')}
      </span>
      <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono font-bold text-[9px] text-accent-deep tracking-[0.5px] uppercase">
        {cert}
      </span>
    </div>
  )

  return (
    <section className="mb-[14px] rounded-2xl border border-border bg-surface p-4">
      {isLoading ? (
        <>
          <div className="mb-[14px]">{titleRow}</div>
          <div className="flex h-16 items-center justify-center">
            <Spinner label={t('loading')} />
          </div>
        </>
      ) : latest ? (
        <>
          <Link href={historyHref} className="mb-[14px] flex w-full items-center justify-between">
            {titleRow}
            <span className="inline-flex items-center gap-0.5 font-semibold text-[11px] text-accent">
              {t('statsMockExamViewAllCta')}
              <ChevronRight className="h-[13px] w-[13px]" strokeWidth={2.2} />
            </span>
          </Link>
          <div className="mb-3 flex items-baseline gap-2">
            <span
              className={[
                'font-bold text-[30px] leading-none tracking-[-1px]',
                latest.summary.passed ? 'text-success-deep' : 'text-danger-deep',
              ].join(' ')}
            >
              {latest.summary.score}
            </span>
            <span className="font-mono text-[12px] text-ink-mute">/1000</span>
            <span
              className={[
                'rounded px-1.5 py-0.5 font-mono font-bold text-[9px] tracking-[0.4px] uppercase',
                latest.summary.passed
                  ? 'bg-success-soft text-success-deep'
                  : 'bg-danger-soft text-danger-deep',
              ].join(' ')}
            >
              {latest.summary.passed ? t('mockExamPassed') : t('mockExamFailed')}
            </span>
            <span className="ml-auto text-[11px] text-ink-mute">
              {attempts.length === 1
                ? `${t('statsMockExamFirstAttempt')} · ${formatRelativeSubmittedAt(latest.submittedAt, locale)}`
                : `${t('statsMockExamAttemptCount', { count: attempts.length })} · ${formatRelativeSubmittedAt(latest.submittedAt, locale)}`}
            </span>
          </div>
          <MockExamScoreChart
            scores={attempts
              .slice()
              .reverse()
              .map((attempt) => attempt.summary.score)}
            passScore={passScore}
            label={t('mockExamScoreTrend')}
            gaugeLabel={t('mockExamScoreGaugeAria', {
              score: latest.summary.score,
              passScore,
              status: latest.summary.passed ? t('mockExamPassed') : t('mockExamFailed'),
            })}
            passLineLabel={t('statsMockExamPassLineLabel')}
            passLineDeltaLabel={t('statsMockExamPassLineDeltaLabel')}
            passLineDeltaUnit={t('statsMockExamPassLineDeltaUnit')}
          />
        </>
      ) : (
        <>
          <div className="mb-[14px]">{titleRow}</div>
          <div className="mb-[14px] flex items-center gap-[11px]">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
              <Trophy className="h-[19px] w-[19px]" strokeWidth={2.1} />
            </div>
            <p className="text-[12px] text-ink-soft leading-[1.45]">
              {t('statsMockExamEmptyDescription')}
            </p>
          </div>
          <Link
            href={`/mock-exam/${cert.toLowerCase()}`}
            className="flex w-full items-center justify-center gap-1 rounded-[10px] bg-accent p-[11px] font-bold text-[13px] text-white tracking-[-0.1px]"
          >
            {t('statsMockExamStartCta')}
            <ChevronRight className="h-[14px] w-[14px]" strokeWidth={2.2} />
          </Link>
        </>
      )}
    </section>
  )
}

function RecentSevenDaysChart({
  rows,
  maxAnswered,
}: {
  rows: NonNullable<ReturnType<typeof useDailyQuestionStats>['data']>
  maxAnswered: number
}) {
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const total = rows.reduce((sum, row) => sum + row.answered, 0)
  const statusCopy =
    total === 0
      ? t('statsRecent7Empty')
      : total < 5
        ? t('statsRecent7LowData')
        : t('statsRecent7Description')

  return (
    <>
      <fieldset
        className="m-0 flex h-[140px] items-stretch justify-between gap-1.5 border-0 p-0 py-1"
        aria-label={t('statsRecent7Title')}
      >
        {rows.map((row) => {
          const totalHeight = row.answered > 0 ? Math.max(6, (row.answered / maxAnswered) * 100) : 6
          const correctHeight = row.answered > 0 ? (row.correctCount / row.answered) * 100 : 0
          return (
            <div key={row.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className={[
                  'font-mono font-bold text-[10px] tracking-[0.2px]',
                  row.isToday ? 'text-accent' : 'text-ink-mute',
                ].join(' ')}
              >
                {row.answered}
              </div>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={[
                    'relative w-full overflow-hidden rounded bg-border-strong',
                    row.isToday ? 'ring-2 ring-accent/70 ring-offset-1 ring-offset-surface' : '',
                  ].join(' ')}
                  style={{ height: `${totalHeight}%`, minHeight: 6 }}
                  role="img"
                  aria-label={t(row.isToday ? 'statsTodayDayAria' : 'statsDayAria', {
                    date: row.date,
                    answered: row.answered,
                    correct: row.correctCount,
                    wrong: row.wrongCount,
                  })}
                >
                  <div
                    className="absolute right-0 bottom-0 left-0 rounded bg-success"
                    style={{ height: `${correctHeight}%` }}
                  />
                </div>
              </div>
              <div
                className={[
                  'text-[10px]',
                  row.isToday ? 'font-bold text-accent' : 'font-medium text-ink-mute',
                ].join(' ')}
              >
                {formatWeekday(row.date, locale)}
              </div>
            </div>
          )
        })}
      </fieldset>
      <div className="mt-3 flex items-center gap-[14px] border-border border-t pt-3">
        <LegendDot color="success" label={t('statsCorrect')} />
        <LegendDot color="wrong" label={t('statsWrong')} />
        <div className="ml-auto text-[11px] text-ink-mute">
          {t('statsRecent7TotalPrefix')}
          <strong className="text-ink">{t('statsRecent7Total', { count: total })}</strong>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-mute leading-[1.4]">{statusCopy}</p>
    </>
  )
}

function LegendDot({ color, label }: { color: 'success' | 'wrong'; label: string }) {
  return (
    <div className="flex items-center gap-[5px]">
      <span
        className={[
          'h-2 w-2 rounded-sm',
          color === 'success' ? 'bg-success' : 'border border-border-strong bg-border-strong',
        ].join(' ')}
      />
      <span className="text-[11px] text-ink-mute">{label}</span>
    </div>
  )
}

function TopicBar({ label, pct, wrong }: { label: string; pct: number; wrong: number }) {
  const t = useT()
  const color = pct < 60 ? 'bg-danger text-danger' : 'bg-accent text-accent'
  const [barColor, textColor] = color.split(' ')

  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-[12.5px] text-ink">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-mute">
          {t('statsWeakAreasWrongCount', { count: wrong })} ·{' '}
          <strong className={textColor}>{pct}%</strong>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-bg-alt">
        <div className={`h-full rounded-[3px] ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatWeekday(date: string, locale: Locale) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return (
    locale === 'zh'
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  )[day]
}

function formatRelativeSubmittedAt(submittedAt: number, locale: Locale) {
  const elapsedDays = Math.floor(Math.max(0, Date.now() - submittedAt) / 86_400_000)
  return locale === 'zh' ? `${elapsedDays} 天前` : `${elapsedDays}d ago`
}
