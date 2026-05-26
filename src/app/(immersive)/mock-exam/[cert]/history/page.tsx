'use client'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { EmptyState } from '@/components/primitives/empty-state'
import { normalizeCert } from '@/data/loaders'
import { useMockExamHistory } from '@/hooks/use-mock-exam'
import { useT } from '@/hooks/use-t'
import { getMockExamProfile } from '@/lib/mock-exam/profile'
import type { SubmittedMockExamAttempt } from '@/lib/mock-exam/submission'
import { usePrefsStore } from '@/stores/prefs-store'

export default function MockExamHistoryPage() {
  const params = useParams<{ cert: string }>()
  const router = useRouter()
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const cert = normalizeCert(params.cert)
  const profile = getMockExamProfile(cert)
  const historyQuery = useMockExamHistory(cert)
  const history = historyQuery.data

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/mock-exam/${cert.toLowerCase()}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink"
            aria-label={t('back')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[13px] font-semibold text-ink">{t('mockExamHistory')}</h1>
            <p className="font-mono text-[10px] tracking-[0.04em] text-ink-mute">{cert}</p>
          </div>
          <div className="h-8 w-8" />
        </div>
      </header>
      <main className="flex-1 overflow-auto px-5 pt-[18px] pb-5">
        {historyQuery.isError ? (
          <EmptyState title={t('mockExamHistoryLoadError')} />
        ) : history === undefined ? null : history.length === 0 ? (
          <EmptyState title={t('mockExamFirstTimeTitle')} />
        ) : (
          <section>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <HistorySummaryCell
                label={t('mockExamBest')}
                value={String(Math.max(...history.map((attempt) => attempt.summary.score)))}
                accent="text-success"
              />
              <HistorySummaryCell
                label={t('mockExamAvg')}
                value={String(
                  Math.round(
                    history.reduce((total, attempt) => total + attempt.summary.score, 0) /
                      history.length,
                  ),
                )}
              />
              <HistorySummaryCell
                label={t('mockExamPassRate')}
                value={`${Math.round(
                  (history.filter((attempt) => attempt.summary.passed).length / history.length) *
                    100,
                )}%`}
                accent="text-accent"
              />
            </div>

            <div className="mb-4 rounded-[14px] border border-border bg-surface px-4 py-3">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-secondary font-bold text-ink">{t('mockExamScoreTrend')}</h2>
                <span className="font-mono text-[10px] tracking-[0.03em] text-ink-mute">
                  {t('mockExamAttemptsLabel', { count: history.length })}
                </span>
              </div>
              <ScoreTrend
                scores={history
                  .slice()
                  .reverse()
                  .map((attempt) => attempt.summary.score)}
                passScore={profile.passingScore}
                label={t('mockExamScoreTrend')}
              />
            </div>

            <h2 className="mb-2.5 font-mono text-helper font-bold uppercase tracking-[0.05em] text-ink-mute">
              {t('mockExamAllAttempts')}
            </h2>
            <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
              {history.map((attempt, index) => {
                const scoreDelta = deriveScoreDelta(history, index)
                return (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => router.push(`/mock-exam/attempt/${attempt.id}/result`)}
                    className="flex w-full items-center gap-3 border-border border-b p-3.5 text-left last:border-b-0"
                  >
                    <div
                      className={[
                        'flex h-[50px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[12px] border',
                        attempt.summary.passed
                          ? 'border-success/40 bg-success-soft text-success-deep'
                          : 'border-danger/40 bg-danger-soft text-danger-deep',
                      ].join(' ')}
                    >
                      <span className="text-card font-bold leading-none">
                        {attempt.summary.score}
                      </span>
                      <span className="mt-0.5 font-mono text-[8px] font-bold opacity-70">
                        /1000
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
                          {t('mockExamAttemptN', { n: history.length - index })}
                        </span>
                        <span
                          className={[
                            'rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em]',
                            attempt.summary.passed
                              ? 'bg-success-soft text-success-deep'
                              : 'bg-danger-soft text-danger-deep',
                          ].join(' ')}
                        >
                          {attempt.summary.passed ? t('mockExamPassed') : t('mockExamFailed')}
                        </span>
                        {attempt.summary.autoSubmitted ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-bg-alt px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-ink-mute">
                            <Clock className="h-2.5 w-2.5" />
                            {t('mockExamTimeout')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-mute">
                        <span className="font-mono">
                          {formatRelativeDate(attempt.submittedAt, locale)}
                        </span>
                        <span className="h-0.5 w-0.5 rounded-full bg-ink-mute" />
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDuration(attempt.summary.timeUsedSeconds)}
                        </span>
                        {scoreDelta === null ? null : (
                          <>
                            <span className="h-0.5 w-0.5 rounded-full bg-ink-mute" />
                            <ScoreDelta value={scoreDelta} />
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-mute" />
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </>
  )
}

function HistorySummaryCell({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-2 py-2.5 text-center">
      <div
        className={['text-lg font-bold leading-none tracking-[-0.02em]', accent ?? 'text-ink'].join(
          ' ',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] tracking-[0.02em] text-ink-mute">{label}</div>
    </div>
  )
}

function ScoreDelta({ value }: { value: number }) {
  const tone = value > 0 ? 'text-success-deep' : value < 0 ? 'text-danger-deep' : 'text-ink-mute'
  return (
    <span className={['font-mono text-[10px] font-bold tabular-nums', tone].join(' ')}>
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

function deriveScoreDelta(history: SubmittedMockExamAttempt[], index: number) {
  const previousAttempt = history[index + 1]
  if (!previousAttempt) return null
  return history[index].summary.score - previousAttempt.summary.score
}

function ScoreTrend({
  scores,
  passScore,
  label,
}: {
  scores: number[]
  passScore: number
  label: string
}) {
  const width = 280
  const height = 70
  const pad = 6
  const min = Math.min(...scores, passScore) - 30
  const max = Math.max(...scores, passScore) + 30
  const range = Math.max(max - min, 1)
  const xStep = scores.length > 1 ? (width - 2 * pad) / (scores.length - 1) : 0
  const points = scores.map((score, index) => ({
    x: scores.length > 1 ? pad + index * xStep : width / 2,
    y: height - pad - ((score - min) / range) * (height - 2 * pad),
    score,
  }))
  const passY = height - pad - ((passScore - min) / range) * (height - 2 * pad)
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
  const areaPath = points.length
    ? `${path} L ${points.at(-1)?.x.toFixed(1)} ${height - pad} L ${points[0].x.toFixed(1)} ${height - pad} Z`
    : ''

  return (
    <svg
      data-testid="mock-exam-score-trend"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={label}
      className="block"
    >
      <defs>
        <linearGradient id="mock-exam-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={pad}
        y1={passY}
        x2={width - pad}
        y2={passY}
        className="stroke-success"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <text
        x={width - pad}
        y={passY - 4}
        textAnchor="end"
        className="fill-success font-mono font-bold"
        fontSize="9"
      >
        {passScore}
      </text>
      {areaPath ? (
        <path d={areaPath} fill="url(#mock-exam-spark-fill)" className="text-accent" />
      ) : null}
      {path ? (
        <path
          d={path}
          fill="none"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${point.score}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 4 : 2.6}
          className={point.score >= passScore ? 'fill-success' : 'fill-danger'}
          stroke="var(--color-surface)"
          strokeWidth={index === points.length - 1 ? 2 : 1.2}
        />
      ))}
    </svg>
  )
}

function formatRelativeDate(timestamp: number, locale: 'zh' | 'en') {
  const date = new Date(timestamp)
  const now = new Date()
  const localeCode = locale === 'zh' ? 'zh-CN' : 'en-US'
  const dayDiff = getCalendarDayDiff(date, now)
  const relativeDay = new Intl.RelativeTimeFormat(localeCode, { numeric: 'auto' }).format(
    -dayDiff,
    'day',
  )

  if (dayDiff === 0) {
    const time = new Intl.DateTimeFormat(localeCode, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
    return `${relativeDay} · ${time}`
  }

  const absDayDiff = Math.abs(dayDiff)
  if (absDayDiff <= 6) return relativeDay

  const direction = dayDiff >= 0 ? -1 : 1
  const relative = new Intl.RelativeTimeFormat(localeCode, { numeric: 'auto' })
  if (absDayDiff < 30) return relative.format(direction * Math.round(absDayDiff / 7), 'week')
  if (absDayDiff < 365) return relative.format(direction * Math.round(absDayDiff / 30), 'month')
  return relative.format(direction * Math.round(absDayDiff / 365), 'year')
}

function getCalendarDayDiff(date: Date, now: Date) {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((nowStart - dateStart) / 86_400_000)
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}
