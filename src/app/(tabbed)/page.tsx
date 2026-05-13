'use client'
import { ArrowRight, Bell, Bookmark, Flag } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { HeroCard } from '@/components/domain/hero-card'
import { QuickActionCard } from '@/components/domain/quick-action-card'
import { Button } from '@/components/primitives/button'
import { Spinner } from '@/components/primitives/spinner'
import { findNextUnansweredQid } from '@/hooks/use-answer'
import { useBookmarksList, useProgressStats, useWrongList } from '@/hooks/use-progress-stats'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

export default function HomePage() {
  const router = useRouter()
  const t = useT()
  const currentCert = usePrefsStore((s) => s.currentCert)
  const stats = useProgressStats()
  const wrong = useWrongList()
  const bookmarks = useBookmarksList()
  const [pending, startTransition] = useTransition()

  // Onboarding redirect: no cert selected → /select-cert
  useEffect(() => {
    if (currentCert === null) router.replace('/select-cert')
  }, [currentCert, router])

  const handleContinue = () => {
    startTransition(async () => {
      const next = await findNextUnansweredQid(0)
      if (next === null) {
        router.push('/list/wrong') // empty wrong list will then show all-answered hint
      } else {
        router.push(`/practice/dva-c02/${next}?from=${encodeURIComponent('/')}`)
      }
    })
  }

  if (currentCert === null) return null

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
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
      </header>

      <HeroCard
        eyebrow={t('certDvaEyebrow')}
        title={t('certDvaTitle')}
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
            className="!bg-white !text-accent-deep !font-bold gap-1.5"
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
    </main>
  )
}
