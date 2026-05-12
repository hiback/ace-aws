'use client'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { StickyFooter } from '@/components/chrome/sticky-footer'
import { TopBar } from '@/components/chrome/top-bar'
import { Button } from '@/components/primitives/button'
import { Pill } from '@/components/primitives/pill'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

export default function SelectCertPage() {
  const router = useRouter()
  const t = useT()
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const currentCert = usePrefsStore((s) => s.currentCert)

  // pre-select if already chosen (rare to hit this page after first run)
  useEffect(() => {
    if (currentCert) router.replace('/')
  }, [currentCert, router])

  const handleStart = () => {
    setCurrentCert('DVA-C02')
    router.replace('/')
  }

  return (
    <>
      <TopBar title={t('selectCertTitle')} leftAction={null} />
      <main className="px-4 pt-6 pb-32">
        <button
          type="button"
          onClick={handleStart}
          className="w-full text-left p-4 rounded-card border-2 border-accent bg-accent-softer flex items-center gap-3"
        >
          <div className="w-14 h-14 rounded-card bg-accent text-white flex items-center justify-center font-mono text-card font-bold">
            DVA
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-card font-bold text-ink">DVA-C02</p>
            <p className="text-secondary text-ink-soft">{t('certDvaTitle')}</p>
            <Pill tone="accent" className="mt-2">{t('certDvaQCount')}</Pill>
          </div>
          <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center">
            <Check className="w-4 h-4" strokeWidth={2.5} />
          </div>
        </button>
      </main>
      <StickyFooter>
        <Button onClick={handleStart} fullWidth size="lg">
          {t('selectCertCta')}
        </Button>
      </StickyFooter>
    </>
  )
}
