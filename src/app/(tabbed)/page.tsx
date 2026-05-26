'use client'
import {
  ArrowRight,
  Bell,
  Bookmark,
  Clock,
  Flag,
  List,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState, useTransition } from 'react'
import { CertSwitcherSheet } from '@/components/domain/cert-switcher-sheet'
import { HeroCard } from '@/components/domain/hero-card'
import { QuickActionCard } from '@/components/domain/quick-action-card'
import { Button } from '@/components/primitives/button'
import { Spinner } from '@/components/primitives/spinner'
import { useAccountPreferences } from '@/components/providers/account-preferences-provider'
import { useProgressScope } from '@/components/providers/progress-scope-provider'
import { loadBank } from '@/data/loaders'
import type { CertCode } from '@/data/types'
import { findNextUnansweredQid } from '@/hooks/use-answer'
import { useMockExamDraft, useSaveMockExamDraft } from '@/hooks/use-mock-exam'
import { useBookmarksList, useProgressStats, useWrongRedoCount } from '@/hooks/use-progress-stats'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import { certPath, getCertGroupLabelKey, getCertOption } from '@/lib/cert-catalog'
import {
  deriveMockExamRemainingSeconds,
  resumeSavedMockExamDraft,
} from '@/lib/mock-exam/attempt-state'
import { getMockExamProfile } from '@/lib/mock-exam/profile'
import { buildPracticeHref } from '@/lib/practice-flow'
import { buildSmartPracticeSessionQids } from '@/lib/smart-practice-session'
import { buildWrongRedoSessionQids } from '@/lib/wrong-redo-session'
import { usePrefsStore } from '@/stores/prefs-store'

type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

const GREETING_KEYS = {
  morning: 'greetingMorning',
  afternoon: 'greetingAfternoon',
  evening: 'greetingEvening',
  night: 'greetingNight',
} as const

const DEFAULT_GREETING_PERIOD: GreetingPeriod = 'morning'

function getLocalGreetingPeriod(): GreetingPeriod {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

export default function HomePage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  // Onboarding redirect: no cert selected → /select-cert
  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <HomeContent key={currentCert} cert={currentCert} />
}

function HomeContent({ cert }: { cert: CertCode }) {
  const router = useRouter()
  const t = useT()
  const { toast } = useToast()
  const { data: session, status } = useSession()
  const accountPreferences = useAccountPreferences()
  const { progress } = useProgressScope()
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const stats = useProgressStats(cert)
  const wrongRedoCount = useWrongRedoCount(cert)
  const bookmarks = useBookmarksList(cert)
  const mockExamDraftQuery = useMockExamDraft(cert)
  const saveMockExamDraft = useSaveMockExamDraft()
  const [pending, startTransition] = useTransition()
  const [smartPracticePending, setSmartPracticePending] = useState(false)
  const [wrongRedoPending, setWrongRedoPending] = useState(false)
  const [certSwitchPending, startCertSwitchTransition] = useTransition()
  const [certSheetOpen, setCertSheetOpen] = useState(false)
  const [certSwitchError, setCertSwitchError] = useState(false)
  const [greetingPeriod, setGreetingPeriod] = useState<GreetingPeriod>(DEFAULT_GREETING_PERIOD)

  useEffect(() => {
    setGreetingPeriod(getLocalGreetingPeriod())
  }, [])

  useEffect(() => {
    const draft = mockExamDraftQuery.data
    if (draft && (draft.draftStatus === 'active' || draft.draftStatus === undefined)) {
      router.replace(`/mock-exam/attempt/${draft.id}/${draft.currentIndex}`)
    }
  }, [mockExamDraftQuery.data, router])

  const observedMockExamDraft = mockExamDraftQuery.isError ? null : mockExamDraftQuery.data
  const mockExamDraft =
    observedMockExamDraft === undefined
      ? undefined
      : observedMockExamDraft?.draftStatus === 'saved'
        ? observedMockExamDraft
        : null

  const handleContinue = () => {
    startTransition(async () => {
      const next = await findNextUnansweredQid(0, cert, progress)
      if (next === null) {
        router.push('/list/wrong') // empty wrong list will then show all-answered hint
      } else {
        router.push(`/practice/${certPath(cert)}/${next}?from=${encodeURIComponent('/')}`)
      }
    })
  }

  const handleWrongRedo = async () => {
    if (wrongRedoPending || wrongRedoCount.isPending || (wrongRedoCount.data ?? 0) === 0) return

    setWrongRedoPending(true)
    try {
      const bank = await loadBank(cert)
      const qids = buildWrongRedoSessionQids(
        bank.map((question) => question.id),
        progress.listProgress(cert),
      )
      if (qids.length === 0) {
        setWrongRedoPending(false)
        return
      }
      router.push(buildPracticeHref(cert, qids[0], '/wrong-redo', qids))
    } catch (error) {
      console.error('Failed to start wrong redo session', error)
      setWrongRedoPending(false)
    }
  }

  const handleSmartPractice = async () => {
    if (smartPracticePending) return

    setSmartPracticePending(true)
    try {
      const bank = await loadBank(cert)
      const qids = buildSmartPracticeSessionQids(
        bank.map((question) => question.id),
        progress.listProgress(cert),
      )
      if (qids.length === 0) {
        toast(t('homeSmartPracticeError'))
        setSmartPracticePending(false)
        return
      }
      router.push(buildPracticeHref(cert, qids[0], '/smart-practice', qids))
    } catch (error) {
      console.error('Failed to start smart practice session', error)
      toast(t('homeSmartPracticeError'))
      setSmartPracticePending(false)
    }
  }

  const handleBrowseAllCerts = () => {
    setCertSwitchError(false)
    setCertSheetOpen(false)
    router.push('/select-cert?mode=switch')
  }

  const handleResumeMockExam = async () => {
    if (!mockExamDraft) return
    const resumed = resumeSavedMockExamDraft(mockExamDraft, Date.now())
    await saveMockExamDraft.mutateAsync(resumed)
    router.push(`/mock-exam/attempt/${resumed.id}/${resumed.currentIndex}`)
  }

  const handleSelectCert = (nextCert: CertCode) => {
    if (nextCert === cert || certSwitchPending) return
    setCertSwitchError(false)
    startCertSwitchTransition(async () => {
      try {
        if (status === 'authenticated') {
          await accountPreferences.saveCurrentCert(nextCert)
        }
        setCurrentCert(nextCert)
        setCertSheetOpen(false)
      } catch {
        setCertSwitchError(true)
      }
    })
  }

  const certOption = getCertOption(cert)
  const mockExamProfile = getMockExamProfile(cert)
  const mockExamAnswered =
    mockExamDraft?.questions.filter((question) => question.answered).length ?? 0
  const mockExamRemainingSeconds = mockExamDraft
    ? deriveMockExamRemainingSeconds(mockExamDraft, Date.now())
    : null
  const mockExamProgressPercent =
    mockExamDraft && mockExamDraft.questionCount > 0
      ? (mockExamAnswered / mockExamDraft.questionCount) * 100
      : 0
  const certLevelKey = getCertGroupLabelKey(cert)
  const displayName =
    status === 'authenticated'
      ? session?.user?.name?.trim() || session?.user?.email?.trim() || null
      : null
  const greetingName = displayName ?? t('greetingGuestName')
  const greeting = t(GREETING_KEYS[greetingPeriod], { name: greetingName })

  const accuracy =
    stats.data && stats.data.answered > 0
      ? Math.round((stats.data.correct / stats.data.answered) * 100)
      : 0

  return (
    <main className="px-5 pt-5 pb-6 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="ace-aws" width={36} height={36} priority className="block" />
          <div>
            <p className="text-card font-bold text-ink tracking-tight leading-tight">
              {t('appName')}
            </p>
            <p className="text-[10.5px] text-ink-mute leading-tight mt-0.5">{greeting}</p>
          </div>
        </div>
        <button
          type="button"
          className="w-9 h-9 rounded-lg border border-border bg-surface text-ink-soft flex items-center justify-center"
          aria-label={t('notifications')}
        >
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
      </header>

      <HeroCard
        eyebrow={`${cert} · ${t(certLevelKey)}`}
        title={t(certOption.heroTitleKey ?? certOption.titleKey)}
        headerAction={
          <button
            type="button"
            onClick={() => setCertSheetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-white/25 bg-white/15 px-2.5 py-1.5 text-secondary font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label={t('certSwitchAria')}
          >
            {t('certSwitchChip')}
            <RefreshCw className="w-3 h-3" strokeWidth={2.25} />
          </button>
        }
        stats={[
          {
            label: t('homeAnswered'),
            value: (
              <>
                {stats.data?.answered ?? 0}
                <span className="text-[13px] font-bold opacity-70">/{stats.data?.total ?? 0}</span>
              </>
            ),
          },
          {
            label: t('homeAccuracy'),
            value: (
              <>
                {accuracy}
                <span className="text-[13px] font-bold opacity-70">%</span>
              </>
            ),
          },
        ]}
        cta={
          <Button
            variant="primary"
            size="md"
            fullWidth
            className="!bg-surface !text-accent-deep disabled:!bg-bg-alt disabled:!text-ink-mute !font-bold gap-1.5"
            onClick={handleContinue}
            disabled={pending}
          >
            {pending ? (
              <Spinner size={16} />
            ) : (
              <>
                {t('homeContinue')}
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
              </>
            )}
          </Button>
        }
      />

      {mockExamDraft === undefined ? (
        <section className="flex items-center justify-center rounded-[16px] border border-border bg-surface p-3.5">
          <Spinner size={16} />
        </section>
      ) : mockExamDraft ? (
        <section
          data-testid="mock-exam-saved-entry"
          className="rounded-[16px] border-[1.5px] border-accent/55 bg-surface px-3.5 pt-3.5 pb-3"
          style={{
            boxShadow: '0 2px 10px color-mix(in srgb, var(--color-accent) 10%, transparent)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-accent/40 bg-accent-soft text-accent-deep">
              <SolidPauseIcon className="h-[22px] w-[22px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
                  {t('mockExam')}
                </h2>
                <span className="rounded-[4px] border border-accent/30 bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.05em] text-accent-deep">
                  {t('mockExamPaused')}
                </span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10.5px] tracking-[0.03em] text-ink-mute">
                {cert}
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleResumeMockExam}
              className="shrink-0 gap-1 px-3"
              style={{
                boxShadow: '0 2px 8px color-mix(in srgb, var(--color-btn-bg) 40%, transparent)',
              }}
            >
              {t('mockExamResume')}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2.5">
            <div className="inline-flex items-baseline gap-1.5">
              <span className="font-mono text-[16px] font-bold tabular-nums text-ink">
                {formatSeconds(mockExamRemainingSeconds ?? 0)}
              </span>
              <span className="text-[11px] text-ink-mute">{t('mockExamTimeLeftShort')}</span>
            </div>
            <div className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="sr-only">
                {mockExamAnswered}/{mockExamDraft.questionCount} {t('mockExamAnswered')}
              </span>
              <span
                aria-hidden="true"
                className="font-mono text-[14px] font-bold tabular-nums text-ink"
              >
                {mockExamAnswered}
                <span className="font-medium text-ink-mute">/{mockExamDraft.questionCount}</span>
              </span>
              <span aria-hidden="true" className="text-[11px] text-ink-mute">
                {t('mockExamAnswered')}
              </span>
            </div>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-pill bg-bg-alt"
            role="progressbar"
            aria-label={t('mockExamAnsweredProgressAria')}
            aria-valuemin={0}
            aria-valuemax={mockExamDraft.questionCount}
            aria-valuenow={mockExamAnswered}
          >
            <div
              className="h-full rounded-pill bg-gradient-to-r from-accent to-accent-deep"
              style={{ width: `${mockExamProgressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-mute">
            <SolidPauseIcon className="h-2.5 w-2.5" />
            {t('mockExamTimeLeftSaved')}
          </div>
        </section>
      ) : (
        <section className="rounded-[16px] border border-border bg-surface p-3.5 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-accent-soft bg-gradient-to-br from-accent/15 to-accent-deep/25 text-accent">
            <Trophy className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <h2 className="text-[14px] font-bold tracking-[-0.01em] text-ink">{t('mockExam')}</h2>
              <span className="rounded-badge bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.05em] text-accent-deep">
                {cert}
              </span>
            </div>
            <div className="flex items-center gap-2.5 whitespace-nowrap text-[11px] text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {mockExamProfile.timeLimitMinutes} {t('mockExamMinutes')}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-ink-mute" />
              <span>
                {mockExamProfile.questionCount} {t('mockExamQuestionsShort')}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => router.push(`/mock-exam/${certPath(cert)}`)}
            className="shrink-0 gap-1 px-3"
            style={{
              boxShadow: '0 2px 8px color-mix(in srgb, var(--color-btn-bg) 30%, transparent)',
            }}
          >
            {t('mockExamStart')}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </section>
      )}

      <p className="px-1 pt-2 text-helper font-bold uppercase tracking-[1.2px] text-ink-mute">
        {t('homeQuickStart')}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <QuickActionCard
          icon={Sparkles}
          label={t('homeSmartPractice')}
          description={t('homeSmartPracticeDescription')}
          onClick={handleSmartPractice}
          disabled={smartPracticePending}
          iconBgClass="bg-accent-soft"
          iconColorClass="text-accent"
        />
        <QuickActionCard
          icon={Flag}
          label={t('homeWrongRedo')}
          count={wrongRedoCount.data ?? 0}
          onClick={handleWrongRedo}
          disabled={
            wrongRedoPending || wrongRedoCount.isPending || (wrongRedoCount.data ?? 0) === 0
          }
          iconBgClass="bg-danger-soft"
          iconColorClass="text-danger"
        />
        <QuickActionCard
          icon={List}
          label={t('homeList')}
          href="/list"
          iconBgClass="bg-accent-soft"
          iconColorClass="text-accent"
        />
        <QuickActionCard
          icon={Bookmark}
          label={t('homeBookmarks')}
          count={bookmarks.data?.length ?? 0}
          href="/list/bookmarks"
          iconBgClass="bg-accent-soft"
          iconColorClass="text-accent"
          iconFilled
        />
      </div>
      <CertSwitcherSheet
        open={certSheetOpen}
        onClose={() => setCertSheetOpen(false)}
        onBrowseAll={handleBrowseAllCerts}
        onSelectCert={handleSelectCert}
        currentCert={cert}
        answered={stats.data?.answered ?? 0}
        total={stats.data?.total ?? 0}
        accuracy={accuracy}
        busy={certSwitchPending}
        errorMessage={certSwitchError ? t('selectCertSaveFailed') : null}
      />
    </main>
  )
}

function SolidPauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  )
}

function formatSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}
