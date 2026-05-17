'use client'
import { Check, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { StickyFooter } from '@/components/chrome/sticky-footer'
import { TopBar } from '@/components/chrome/top-bar'
import { Button } from '@/components/primitives/button'
import { Pill } from '@/components/primitives/pill'
import type { CertCode } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { CERT_GROUPS, type CertOption, isReadyCertCode } from '@/lib/cert-catalog'
import { completeOnboardingStep } from '@/lib/onboarding-client'
import { usePrefsStore } from '@/stores/prefs-store'

interface SelectCertClientProps {
  requestedMode: 'onboarding' | 'switch'
}

export function SelectCertClient({ requestedMode }: SelectCertClientProps) {
  const router = useRouter()
  const t = useT()
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const currentCert = usePrefsStore((s) => s.currentCert)
  const isSwitchMode = requestedMode === 'switch' && currentCert !== null
  const [selectedCert, setSelectedCert] = useState<CertCode | null>(
    requestedMode === 'switch' ? currentCert : null,
  )
  const [saveError, setSaveError] = useState(false)
  const [isPending, startTransition] = useTransition()
  const autoCompleteStarted = useRef(false)

  // Onboarding picker should not reopen after the user has already selected a cert.
  useEffect(() => {
    if (!currentCert || isSwitchMode || autoCompleteStarted.current) return
    autoCompleteStarted.current = true
    startTransition(async () => {
      setSaveError(false)
      try {
        await completeOnboardingStep('complete-cert-selection')
        router.replace('/')
      } catch {
        startTransition(() => {
          setSaveError(true)
        })
      }
    })
  }, [currentCert, isSwitchMode, router])

  useEffect(() => {
    if (isSwitchMode) setSelectedCert(currentCert)
  }, [currentCert, isSwitchMode])

  const handleSelect = (cert: CertOption) => {
    const code = cert.code
    if (!isReadyCertCode(code)) return
    setSaveError(false)
    setSelectedCert((selected) => {
      if (selected === code) return isSwitchMode ? selected : null
      return code
    })
  }

  const handleCta = () => {
    if (!selectedCert || isPending) return
    startTransition(async () => {
      setSaveError(false)
      try {
        await completeOnboardingStep('complete-cert-selection')
        startTransition(() => {
          setCurrentCert(selectedCert)
        })
        router.replace('/')
      } catch {
        startTransition(() => {
          setSaveError(true)
        })
      }
    })
  }

  return (
    <>
      <TopBar
        title={t(isSwitchMode ? 'selectCertBrowseTitle' : 'selectCertTitle')}
        leftAction={isSwitchMode ? 'back' : null}
        backHref="/"
      />
      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-24">
        <p className="mb-5 text-option leading-relaxed text-ink-mute">
          {t(isSwitchMode ? 'selectCertBrowseSubtitle' : 'selectCertSubtitle')}
        </p>

        <div className="space-y-6">
          {CERT_GROUPS.map((group) => (
            <section key={group.labelKey}>
              <h2 className="mb-2.5 text-helper font-bold uppercase tracking-[1.2px] text-ink-mute">
                {t(group.labelKey)}
              </h2>
              <div className="space-y-2.5">
                {group.certs.map((cert) => (
                  <CertCard
                    key={cert.code}
                    cert={cert}
                    selected={cert.code === selectedCert}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        {saveError ? (
          <p className="mt-4 text-helper font-medium text-danger" role="alert">
            {t('selectCertSaveFailed')}
          </p>
        ) : null}
      </main>
      <StickyFooter>
        <Button onClick={handleCta} fullWidth size="lg" disabled={!selectedCert || isPending}>
          {t(isSwitchMode ? 'selectCertBrowseCta' : 'selectCertCta')}
        </Button>
      </StickyFooter>
    </>
  )
}

function CertCard({
  cert,
  selected,
  onSelect,
}: {
  cert: CertOption
  selected: boolean
  onSelect: (cert: CertOption) => void
}) {
  const t = useT()
  const ready = cert.ready === true
  const highlighted = ready && selected
  const prefix = cert.code.split('-')[0]
  const className = [
    'relative flex w-full items-center gap-3 rounded-card border-[1.5px] p-3.5 text-left transition-colors select-none',
    highlighted
      ? 'border-accent bg-accent-softer text-ink'
      : ready
        ? 'border-border bg-surface text-ink hover:border-border-strong'
        : 'border-border bg-bg-alt text-ink-mute opacity-70',
    ready ? 'cursor-pointer' : 'cursor-not-allowed',
  ].join(' ')
  const content = (
    <>
      <span
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] font-mono text-helper font-bold tracking-[0.5px]',
          highlighted ? 'bg-accent text-white' : 'bg-bg-alt text-ink-soft',
        ].join(' ')}
      >
        {prefix}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <p
            className={[
              'truncate text-[14px] font-semibold',
              ready ? 'text-ink' : 'text-ink-soft',
            ].join(' ')}
          >
            {t(cert.titleKey)}
          </p>
          {cert.hot ? (
            <Pill tone="accent" className="shrink-0 gap-1">
              <Sparkles className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
              {t('certHot')}
            </Pill>
          ) : null}
        </div>
        <p className="font-mono text-helper text-ink-mute">
          {cert.code} ·{' '}
          {ready ? t('certQuestions', { count: cert.count ?? 0 }) : t('certComingSoon')}
        </p>
      </div>
      {ready ? (
        <span
          className={[
            'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border',
            highlighted ? 'border-accent bg-accent text-white' : 'border-border-strong bg-surface',
          ].join(' ')}
        >
          {highlighted ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
        </span>
      ) : null}
    </>
  )

  if (!ready) {
    return (
      <div className={className} aria-disabled="true">
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      aria-pressed={highlighted}
      onClick={() => onSelect(cert)}
    >
      {content}
    </button>
  )
}
