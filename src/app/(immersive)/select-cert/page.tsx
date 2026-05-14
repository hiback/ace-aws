'use client'
import { Check, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { StickyFooter } from '@/components/chrome/sticky-footer'
import { TopBar } from '@/components/chrome/top-bar'
import { Button } from '@/components/primitives/button'
import { Pill } from '@/components/primitives/pill'
import { useT } from '@/hooks/use-t'
import type { StringKey } from '@/lib/strings'
import { usePrefsStore } from '@/stores/prefs-store'

interface CertOption {
  code: string
  titleKey: StringKey
  count?: number
  ready?: boolean
  hot?: boolean
}

const CERT_GROUPS: { labelKey: StringKey; certs: CertOption[] }[] = [
  {
    labelKey: 'certGroupFoundational',
    certs: [
      { code: 'CLF-C02', titleKey: 'certClfTitle' },
      { code: 'AIF-C01', titleKey: 'certAifTitle' },
    ],
  },
  {
    labelKey: 'certGroupAssociate',
    certs: [
      { code: 'SAA-C03', titleKey: 'certSaaTitle' },
      { code: 'DVA-C02', titleKey: 'certDvaSelectTitle', count: 557, ready: true, hot: true },
      { code: 'SOA-C02', titleKey: 'certSoaTitle' },
      { code: 'DEA-C01', titleKey: 'certDeaTitle' },
      { code: 'MLA-C01', titleKey: 'certMlaTitle' },
    ],
  },
  {
    labelKey: 'certGroupProfessional',
    certs: [
      { code: 'SAP-C02', titleKey: 'certSapTitle' },
      { code: 'DOP-C02', titleKey: 'certDopTitle' },
    ],
  },
  {
    labelKey: 'certGroupSpecialty',
    certs: [
      { code: 'ANS-C01', titleKey: 'certAnsTitle' },
      { code: 'SCS-C02', titleKey: 'certScsTitle' },
      { code: 'MLS-C01', titleKey: 'certMlsTitle' },
    ],
  },
]

export default function SelectCertPage() {
  const router = useRouter()
  const t = useT()
  const setCurrentCert = usePrefsStore((s) => s.setCurrentCert)
  const currentCert = usePrefsStore((s) => s.currentCert)

  // Pre-select if already chosen; this page is still only the onboarding cert picker.
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
      <main className="flex-1 overflow-y-auto px-5 pt-5 pb-24">
        <p className="mb-5 text-option leading-relaxed text-ink-mute">{t('selectCertSubtitle')}</p>

        <div className="space-y-6">
          {CERT_GROUPS.map((group) => (
            <section key={group.labelKey}>
              <h2 className="mb-2.5 text-helper font-bold uppercase tracking-[1.2px] text-ink-mute">
                {t(group.labelKey)}
              </h2>
              <div className="space-y-2.5">
                {group.certs.map((cert) => (
                  <CertCard key={cert.code} cert={cert} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <StickyFooter>
        <Button onClick={handleStart} fullWidth size="lg">
          {t('selectCertCta')}
        </Button>
      </StickyFooter>
    </>
  )
}

function CertCard({ cert }: { cert: CertOption }) {
  const t = useT()
  const ready = cert.ready === true
  const prefix = cert.code.split('-')[0]
  const className = [
    'relative flex w-full items-center gap-3 rounded-card border-[1.5px] p-3.5 text-left',
    ready ? 'border-accent bg-accent-softer text-ink' : 'border-border bg-bg-alt text-ink-mute',
  ].join(' ')
  const content = (
    <>
      <div
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] font-mono text-helper font-bold tracking-[0.5px]',
          ready ? '' : 'bg-surface text-ink-mute',
        ].join(' ')}
        style={
          ready
            ? {
                backgroundImage:
                  'linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))',
                color: '#fff',
              }
            : undefined
        }
      >
        <span className={ready ? undefined : 'text-ink-mute'}>{prefix}</span>
      </div>
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
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
      ) : null}
    </>
  )

  return (
    <div className={className} aria-disabled={ready ? undefined : 'true'}>
      {content}
    </div>
  )
}
