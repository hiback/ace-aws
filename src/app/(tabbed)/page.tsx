'use client'
import { Bell, Star, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { TopBar } from '@/components/chrome/top-bar'
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
        router.push(`/practice/dva-c02/${next}`)
      }
    })
  }

  if (currentCert === null) return null

  const accuracy =
    stats.data && stats.data.answered > 0
      ? Math.round((stats.data.correct / stats.data.answered) * 100)
      : 0

  return (
    <>
      <TopBar
        title={<span className="font-mono">ace-aws</span>}
        leftAction={null}
        rightAction={
          <button type="button" className="p-2 text-ink-soft" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </button>
        }
      />
      <main className="px-4 pt-4 pb-6 space-y-4">
        <p className="text-body text-ink-soft">{t('greeting')}</p>

        <HeroCard
          eyebrow="DVA-C02 · Associate"
          title="Developer Associate"
          stats={[
            {
              label: t('homeAnswered'),
              value: `${stats.data?.answered ?? 0}/${stats.data?.total ?? 0}`,
            },
            { label: t('homeAccuracy'), value: `${accuracy}%` },
          ]}
          cta={
            <Button
              variant="primary"
              size="md"
              className="!bg-white !text-accent-deep"
              onClick={handleContinue}
              disabled={pending}
            >
              {pending ? <Spinner size={16} /> : t('homeContinue')}
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <QuickActionCard
            icon={XCircle}
            label={t('homeWrong')}
            count={wrong.data?.length ?? 0}
            href="/list/wrong"
          />
          <QuickActionCard
            icon={Star}
            label={t('homeBookmarks')}
            count={bookmarks.data?.length ?? 0}
            href="/list/bookmarks"
          />
        </div>
      </main>
    </>
  )
}
