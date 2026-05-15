'use client'
import { ArrowRight, Bell, Bookmark, Flag, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { CertSwitcherSheet } from '@/components/domain/cert-switcher-sheet'
import { HeroCard } from '@/components/domain/hero-card'
import { QuickActionCard } from '@/components/domain/quick-action-card'
import { Button } from '@/components/primitives/button'
import { Spinner } from '@/components/primitives/spinner'
import type { CertCode } from '@/data/types'
import { findNextUnansweredQid } from '@/hooks/use-answer'
import { useBookmarksList, useProgressStats, useWrongList } from '@/hooks/use-progress-stats'
import { useT } from '@/hooks/use-t'
import { certPath, getCertGroupLabelKey, getCertOption } from '@/lib/cert-catalog'
import { usePrefsStore } from '@/stores/prefs-store'

export default function HomePage() {
  const router = useRouter()
  const currentCert = usePrefsStore((s) => s.currentCert)

  // Onboarding redirect: no cert selected → /select-cert
  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  if (currentCert === null) return null

  return <HomeContent cert={currentCert} />
}

function HomeContent({ cert }: { cert: CertCode }) {
  const router = useRouter()
  const t = useT()
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const stats = useProgressStats(cert)
  const wrong = useWrongList(cert)
  const bookmarks = useBookmarksList(cert)
  const [pending, startTransition] = useTransition()
  const [certSheetOpen, setCertSheetOpen] = useState(false)

  const handleContinue = () => {
    startTransition(async () => {
      const next = await findNextUnansweredQid(0, cert)
      if (next === null) {
        router.push('/list/wrong') // empty wrong list will then show all-answered hint
      } else {
        router.push(`/practice/${certPath(cert)}/${next}?from=${encodeURIComponent('/')}`)
      }
    })
  }

  const handleBrowseAllCerts = () => {
    setCertSheetOpen(false)
    router.push('/select-cert?mode=switch')
  }

  const handleSelectCert = (nextCert: CertCode) => {
    setCurrentCert(nextCert)
    setCertSheetOpen(false)
  }

  const certOption = getCertOption(cert)
  const certLevelKey = getCertGroupLabelKey(cert)

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
            <p className="text-[10.5px] text-ink-mute leading-tight mt-0.5">{t('greeting')}</p>
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

      <p className="px-1 pt-2 text-helper font-bold uppercase tracking-[1.2px] text-ink-mute">
        {t('homeQuickStart')}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <QuickActionCard
          icon={Flag}
          label={t('homeWrong')}
          count={wrong.data?.length ?? 0}
          href="/list/wrong"
          iconBgClass="bg-danger-soft"
          iconColorClass="text-danger"
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
      />
    </main>
  )
}
