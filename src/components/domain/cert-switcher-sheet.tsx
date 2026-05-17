'use client'
import { ArrowRight, Check, ChevronRight, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { CertCode } from '@/data/types'
import { useT } from '@/hooks/use-t'
import {
  CERT_GROUPS,
  type CertOption,
  getCertGroupLabelKey,
  getCertOption,
  isReadyCertCode,
} from '@/lib/cert-catalog'
import type { StringKey } from '@/lib/strings'

interface CertSwitcherSheetProps {
  open: boolean
  onClose: () => void
  onBrowseAll: () => void
  onSelectCert: (cert: CertCode) => void
  currentCert: CertCode
  answered: number
  total: number
  accuracy: number
  busy?: boolean
  errorMessage?: string | null
}

interface UpcomingCert extends CertOption {
  groupLabelKey: StringKey
}

export function CertSwitcherSheet({
  open,
  onClose,
  onBrowseAll,
  onSelectCert,
  currentCert,
  answered,
  total,
  accuracy,
  busy = false,
  errorMessage = null,
}: CertSwitcherSheetProps) {
  const t = useT()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const completion = total > 0 ? Math.round((answered / total) * 100) : 0
  const current = getCertOption(currentCert)
  const currentLevelKey = getCertGroupLabelKey(currentCert)
  const allOther = CERT_GROUPS.flatMap((group) =>
    group.certs.map((cert) => ({ ...cert, groupLabelKey: group.labelKey })),
  ).filter((cert) => cert.code !== currentCert)
  const switchable = allOther.filter((cert) => isReadyCertCode(cert.code))
  const upcoming = allOther.filter((cert) => !isReadyCertCode(cert.code))

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-switcher-title"
    >
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px]"
      />
      <div className="relative flex h-[min(600px,88dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-[20px] bg-bg shadow-[0_-12px_36px_rgba(0,0,0,0.22)]">
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <div className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-[18px] pt-1.5 pb-3">
          <div className="min-w-0">
            <h2 id="cert-switcher-title" className="text-card font-bold tracking-tight text-ink">
              {t('certSwitchTitle')}
            </h2>
            <p className="mt-0.5 text-helper text-ink-mute">{t('certSwitchSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-bg-alt text-ink-soft"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
          <SectionLabel>{t('certSwitchCurrent')}</SectionLabel>
          <div className="relative overflow-hidden rounded-[14px] p-3.5 text-white bg-[linear-gradient(135deg,var(--color-hero-from),var(--color-hero-to))]">
            <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border border-white/25 bg-white/20 font-mono text-helper font-bold tracking-[0.4px]">
                {currentCert.split('-')[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-helper tracking-[0.4px] opacity-85">
                  {currentCert} · {t(currentLevelKey)}
                </p>
                <p className="mt-0.5 truncate text-[14.5px] font-bold tracking-tight">
                  {t(current.heroTitleKey ?? current.titleKey)}
                </p>
              </div>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-accent-deep">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
            </div>
            <div className="relative mt-3 flex items-baseline gap-3 font-mono text-helper opacity-90">
              <span>
                {answered}/{total} · {completion}%
              </span>
              <span>
                {t('homeAccuracy')} {accuracy}%
              </span>
            </div>
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${completion}%` }} />
            </div>
          </div>

          {switchable.length > 0 ? (
            <>
              <SectionLabel className="mt-[18px]">{t('certSwitchAvailable')}</SectionLabel>
              <div className="flex flex-col gap-1.5">
                {switchable.map((cert) => {
                  const code = cert.code
                  if (!isReadyCertCode(code)) return null
                  return (
                    <CertSwitchRow
                      key={code}
                      cert={cert}
                      disabled={busy}
                      onSelect={() => onSelectCert(code)}
                    />
                  )
                })}
              </div>
            </>
          ) : null}

          <SectionLabel className="mt-[18px]">{t('certSwitchComingSoon')}</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {upcoming.map((cert) => (
              <CertSwitchRow key={cert.code} cert={cert} />
            ))}
          </div>
        </div>

        {errorMessage ? (
          <p
            className="mx-4 mb-2 rounded-card border border-danger/25 bg-danger/10 px-3 py-2 text-helper text-danger"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="shrink-0 border-t border-border bg-bg px-4 pt-2.5 pb-4">
          <button
            type="button"
            onClick={onBrowseAll}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-button border border-border bg-surface text-option font-semibold text-ink transition-colors hover:bg-bg-alt"
          >
            {t('certSwitchBrowseAll')}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        'mb-2 px-1 text-helper font-bold uppercase tracking-[1.2px] text-ink-mute',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function CertSwitchRow({
  cert,
  onSelect,
  disabled = false,
}: {
  cert: UpcomingCert
  onSelect?: () => void
  disabled?: boolean
}) {
  const t = useT()
  const prefix = cert.code.split('-')[0]
  const ready = isReadyCertCode(cert.code)
  const content = (
    <>
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] font-mono text-mono-small font-bold tracking-[0.4px]',
          ready
            ? 'bg-[linear-gradient(135deg,var(--color-hero-from),var(--color-hero-to))] text-white'
            : 'bg-bg-alt text-ink-mute',
        ].join(' ')}
      >
        {prefix}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-option font-semibold text-ink">{t(cert.titleKey)}</p>
        <p className="mt-0.5 font-mono text-helper text-ink-mute">
          {cert.code} ·{' '}
          {ready ? t('certQuestions', { count: cert.count ?? 0 }) : t(cert.groupLabelKey)}
        </p>
      </div>
      {ready ? (
        <ChevronRight className="h-4 w-4 text-ink-subtle" strokeWidth={2} />
      ) : (
        <span className="rounded-[5px] bg-bg-alt px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.5px] text-ink-mute">
          {t('certComingSoon')}
        </span>
      )}
    </>
  )

  if (ready && onSelect) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-button border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-bg-alt disabled:opacity-60"
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className="flex items-center gap-3 rounded-button border border-border bg-surface px-3 py-2.5 opacity-60"
      aria-disabled="true"
    >
      {content}
    </div>
  )
}
