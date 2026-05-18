'use client'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Globe, LogOut, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { useState } from 'react'
import { TopBar } from '@/components/chrome/top-bar'
import { GitHubIcon } from '@/components/icons/github-icon'
import { useAccountProgressSync } from '@/components/providers/account-progress-sync-provider'
import type { Locale, Theme } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { useToast } from '@/hooks/use-toast'
import { resetOnboarding } from '@/lib/onboarding-client'
import { clearProgressScope } from '@/repositories/local-progress-repository'
import { usePrefsStore } from '@/stores/prefs-store'

/** Theme icon — circle with the left half filled and a vertical divider.
 *  Matches the design handoff's custom SVG. Signature mirrors lucide-react
 *  icons so it can be passed through the same `icon` prop. */
function ThemeIcon({ className, strokeWidth = 1.75, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M12 3 V21" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M12 3 A9 9 0 0 0 12 21 Z" fill="currentColor" />
    </svg>
  )
}

const APP_VERSION = '0.3.1'
const REPO_URL = 'https://github.com/hiback/ace-aws'

function formatSettingsTimestamp(date: Date | number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

type SessionUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-[10px] border border-border bg-bg-alt p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-lg px-2.5 py-1.5 text-secondary font-semibold',
            value === opt.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-mute',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

type IconComponent = ComponentType<{ className?: string; strokeWidth?: number }>

function SettingsRow({
  icon: Icon,
  label,
  control,
}: {
  icon?: IconComponent
  label: string
  control: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border last:border-b-0">
      {Icon ? (
        <div className="w-7 h-7 rounded-lg bg-bg-alt flex items-center justify-center flex-shrink-0">
          <Icon className="w-[18px] h-[18px] text-ink-soft" strokeWidth={1.75} />
        </div>
      ) : null}
      <span className="flex-1 text-body text-ink">{label}</span>
      {control}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-helper font-bold uppercase tracking-[1.2px] text-ink-mute mb-2 px-1">
        {title}
      </h2>
      {children}
    </section>
  )
}

function AccountAvatar({ user }: { user: SessionUser }) {
  const fallback = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()

  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={48}
        height={48}
        unoptimized
        className="w-12 h-12 rounded-full bg-bg-alt object-cover border border-border"
      />
    )
  }

  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-hero-from to-hero-to border border-border flex items-center justify-center text-[18px] font-bold text-white">
      {fallback}
    </div>
  )
}

function syncDotClass(status: ReturnType<typeof useAccountProgressSync>['status']) {
  if (status === 'synced') return 'bg-success shadow-[0_0_0_3px_var(--color-success-soft)]'
  if (status === 'failed') return 'bg-danger shadow-[0_0_0_3px_var(--color-danger-soft)]'
  return 'bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]'
}

export default function SettingsPage() {
  const t = useT()
  const { data: session, status } = useSession()
  const theme = usePrefsStore((s) => s.theme)
  const setTheme = usePrefsStore((s) => s.setTheme)
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)
  const queryClient = useQueryClient()
  const progressSync = useAccountProgressSync()
  const { toast } = useToast()
  const [signOutBlocked, setSignOutBlocked] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const user = (session?.user ?? null) as SessionUser | null
  const isSignedIn = status === 'authenticated' && user !== null
  const displayName = user?.name ?? user?.email ?? t('accountGitHubUser')
  const accountHandle = user?.email ?? null

  function handleSignIn() {
    void signIn('github')
  }

  const syncStateLabel = {
    syncing: t('accountProgressSyncStateSyncing'),
    failed: t('accountProgressSyncStateFailed'),
    dirty: t('accountProgressSyncStateDirty'),
    synced: t('accountProgressSyncStateSynced'),
  }[progressSync.status]
  const formattedLastSyncedAt = progressSync.lastSyncedAt
    ? formatSettingsTimestamp(progressSync.lastSyncedAt)
    : null
  const syncMetaLabel = formattedLastSyncedAt
    ? t('accountProgressSyncLastSynced', { time: formattedLastSyncedAt })
    : t('accountProgressSyncNeverSynced')
  const syncDisabled = progressSync.status === 'syncing' || progressSync.isImporting || signingOut

  async function finishSignOut(clearSyncState: boolean) {
    setSigningOut(true)
    if (clearSyncState) {
      progressSync.discardAccountSyncState()
    } else {
      try {
        clearProgressScope('account')
      } catch {
        // localStorage can be unavailable; sign-out should still proceed.
      }
      queryClient.removeQueries({ queryKey: ['progress', 'account'] })
    }
    try {
      await resetOnboarding()
    } catch {
      // Cookie cleanup is best-effort; authentication state must still clear.
    }
    await signOut({ callbackUrl: '/login' })
  }

  function handleSyncNow() {
    void (async () => {
      setSignOutBlocked(false)
      await progressSync.syncNow()
    })()
  }

  function handleImportAnonymousProgress() {
    void (async () => {
      const result = await progressSync.importAnonymousProgress()
      toast(
        result.ok
          ? t('settingsAnonymousImportSuccessToast')
          : t('settingsAnonymousImportFailureToast'),
      )
    })()
  }

  function handleSignOut() {
    void (async () => {
      const result = await progressSync.syncBeforeSignOut()
      if (!result.ok && result.reason === 'temporary') {
        setSignOutBlocked(true)
        return
      }
      await finishSignOut(false)
    })()
  }

  function handleRetrySignOutSync() {
    void (async () => {
      const result = await progressSync.syncBeforeSignOut()
      if (result.ok || result.reason === 'fatal') {
        setSignOutBlocked(false)
        await finishSignOut(false)
      }
    })()
  }

  function handleStillSignOut() {
    void finishSignOut(true)
  }

  return (
    <>
      <TopBar title={t('settingsTitle')} leftAction={null} />
      <main className="px-4 pt-4 pb-6 space-y-5">
        <Section title={t('settingsAccount')}>
          <div className="rounded-card bg-surface border border-border overflow-hidden">
            {isSignedIn ? (
              <div className="p-4 flex flex-col gap-3.5">
                <div className="flex items-start gap-3">
                  <AccountAvatar user={user} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-body font-bold text-ink truncate">{displayName}</p>
                    </div>
                    {accountHandle ? (
                      <p className="mt-0.5 text-secondary text-ink-mute truncate">
                        {accountHandle}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-helper text-ink-subtle">{t('accountGitHubUser')}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-button border border-border bg-bg-alt px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={[
                        'h-[7px] w-[7px] flex-shrink-0 rounded-full',
                        syncDotClass(progressSync.status),
                      ].join(' ')}
                    />
                    <span className="flex-shrink-0 text-[13px] font-semibold text-ink">
                      {syncStateLabel}
                    </span>
                    <span className="truncate text-secondary text-ink-mute">· {syncMetaLabel}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('accountProgressSyncSyncNow')}
                    title={t('accountProgressSyncSyncNow')}
                    onClick={handleSyncNow}
                    disabled={syncDisabled}
                    className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-soft disabled:opacity-50"
                  >
                    <RefreshCw
                      className={[
                        'h-[15px] w-[15px]',
                        progressSync.status === 'syncing' ? 'animate-spin' : '',
                      ].join(' ')}
                      strokeWidth={1.75}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  {signOutBlocked ? (
                    <div className="rounded-button border border-danger/30 bg-danger-soft p-3 space-y-3">
                      <div>
                        <p className="text-[13px] font-bold text-danger-deep">
                          {t('accountProgressSyncSignOutBlockedTitle')}
                        </p>
                        <p className="mt-1 text-secondary leading-relaxed text-ink-soft">
                          {t('accountProgressSyncSignOutBlockedDescription')}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleRetrySignOutSync}
                          disabled={syncDisabled}
                          className="rounded-[10px] bg-btn-bg px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          {t('accountProgressSyncRetrySync')}
                        </button>
                        <button
                          type="button"
                          onClick={handleStillSignOut}
                          disabled={progressSync.isImporting || signingOut}
                          className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] font-bold text-ink disabled:opacity-50"
                        >
                          {t('accountProgressSyncStillSignOut')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {progressSync.anonymousImportAvailable ? (
                    <button
                      type="button"
                      onClick={handleImportAnonymousProgress}
                      disabled={progressSync.isImporting || signingOut}
                      className="w-full rounded-[10px] border border-border bg-bg-alt px-4 py-[11px] text-[14px] font-semibold text-ink flex items-center justify-center gap-2 hover:bg-surface disabled:opacity-50"
                    >
                      {t('settingsAnonymousImportCta')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={syncDisabled}
                    className="w-full rounded-[10px] border border-border bg-transparent px-4 py-[11px] text-[14px] font-semibold text-ink-soft flex items-center justify-center gap-2 hover:bg-bg-alt disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {t('signOut')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-bg-alt flex items-center justify-center flex-shrink-0">
                    <GitHubIcon className="w-5 h-5 text-ink-soft" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-bold text-ink">{t('accountGitHubUser')}</p>
                    <p className="mt-1 text-secondary leading-relaxed text-ink-mute">
                      {t('accountSignedOutDescription')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignIn}
                  className="w-full rounded-[10px] bg-btn-bg px-4 py-[11px] text-[14px] font-bold text-white shadow-[0_2px_8px_rgb(46_99_201/0.18)] flex items-center justify-center gap-2"
                >
                  <GitHubIcon className="w-4 h-4" />
                  {t('signInWithGitHub')}
                </button>
              </div>
            )}
          </div>
        </Section>

        <Section title={t('settingsAppearance')}>
          <div className="rounded-card bg-surface border border-border">
            <SettingsRow
              icon={ThemeIcon}
              label={t('settingsTheme')}
              control={
                <Segmented<Theme>
                  value={theme}
                  options={[
                    { value: 'light', label: t('themeLight') },
                    { value: 'dark', label: t('themeDark') },
                    { value: 'system', label: t('themeSystem') },
                  ]}
                  onChange={setTheme}
                />
              }
            />
          </div>
        </Section>

        <Section title={t('settingsLanguage')}>
          <div className="rounded-card bg-surface border border-border">
            <SettingsRow
              icon={Globe}
              label={t('settingsLanguageLabel')}
              control={
                <Segmented<Locale>
                  value={locale}
                  options={[
                    { value: 'zh', label: t('langZh') },
                    { value: 'en', label: t('langEn') },
                  ]}
                  onChange={setLocale}
                />
              }
            />
          </div>
        </Section>

        <Section title={t('settingsAbout')}>
          <div className="rounded-card bg-surface border border-border overflow-hidden">
            <SettingsRow
              label={t('settingsVersion')}
              control={
                <span className="font-mono text-secondary text-ink-mute">{APP_VERSION}</span>
              }
            />
            <a
              href={`${REPO_URL}#privacy`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3.5 py-3 border-b border-border hover:bg-bg-alt"
            >
              <span className="text-body text-ink">{t('settingsPrivacy')}</span>
              <ChevronRight className="w-4 h-4 text-ink-subtle" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3.5 py-3 hover:bg-bg-alt"
            >
              <span className="text-body text-ink">{t('settingsLicense')}</span>
              <ChevronRight className="w-4 h-4 text-ink-subtle" />
            </a>
          </div>
        </Section>
      </main>
    </>
  )
}
