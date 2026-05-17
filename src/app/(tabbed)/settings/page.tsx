'use client'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Globe, LogOut, UserRound } from 'lucide-react'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { TopBar } from '@/components/chrome/top-bar'
import { GitHubIcon } from '@/components/icons/github-icon'
import type { Locale, Theme } from '@/data/types'
import { useT } from '@/hooks/use-t'
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

const APP_VERSION = '0.2.1'
const REPO_URL = 'https://github.com/hiback/ace-aws'

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
    <div className="inline-flex rounded-button border border-border bg-bg-alt p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'px-3 py-1.5 text-secondary font-medium rounded-button',
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
        <div className="w-7 h-7 rounded-md bg-bg-alt flex items-center justify-center flex-shrink-0">
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
    <div className="w-12 h-12 rounded-full bg-bg-alt border border-border flex items-center justify-center text-title font-bold text-ink">
      {fallback}
    </div>
  )
}

export default function SettingsPage() {
  const t = useT()
  const { data: session, status } = useSession()
  const theme = usePrefsStore((s) => s.theme)
  const setTheme = usePrefsStore((s) => s.setTheme)
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)
  const queryClient = useQueryClient()
  const user = (session?.user ?? null) as SessionUser | null
  const isSignedIn = status === 'authenticated' && user !== null
  const displayName = user?.name ?? user?.email ?? t('accountGitHubUser')
  const accountHandle = user?.email ?? null

  function handleSignIn() {
    void signIn('github')
  }

  function handleSignOut() {
    void (async () => {
      try {
        clearProgressScope('account')
      } catch {
        // localStorage can be unavailable; sign-out should still proceed.
      }
      queryClient.removeQueries({ queryKey: ['progress', 'account'] })
      try {
        await resetOnboarding()
      } catch {
        // Cookie cleanup is best-effort; authentication state must still clear.
      }
      void signOut({ callbackUrl: '/login' })
    })()
  }

  return (
    <>
      <TopBar title={t('settingsTitle')} leftAction={null} />
      <main className="px-4 pt-4 pb-6 space-y-5">
        <Section title={t('settingsAccount')}>
          <div className="rounded-card bg-surface border border-border overflow-hidden">
            {isSignedIn ? (
              <div className="p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <AccountAvatar user={user} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-body font-bold text-ink truncate">{displayName}</p>
                      <span className="rounded-full bg-bg-alt border border-border px-2 py-0.5 text-helper font-bold text-ink-mute">
                        {t('accountSignedIn')}
                      </span>
                    </div>
                    {accountHandle ? (
                      <p className="mt-1 text-secondary text-ink-mute truncate">{accountHandle}</p>
                    ) : null}
                    <p className="mt-1 text-helper text-ink-subtle">{t('accountGitHubUser')}</p>
                  </div>
                </div>

                <div className="rounded-card bg-bg-alt border border-border p-3 flex gap-3">
                  <div className="w-8 h-8 rounded-md bg-surface flex items-center justify-center flex-shrink-0">
                    <UserRound className="w-[18px] h-[18px] text-ink-soft" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-helper font-bold uppercase tracking-[1px] text-ink-mute">
                      {t('accountSyncStatus')}
                    </p>
                    <p className="mt-1 text-body font-bold text-ink">
                      {t('accountSyncComingSoon')}
                    </p>
                    <p className="mt-1 text-secondary text-ink-mute">
                      {t('accountSyncComingSoonDescription')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-button border border-border bg-surface px-4 py-2.5 text-body font-bold text-ink flex items-center justify-center gap-2 hover:bg-bg-alt"
                  >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    {t('signOut')}
                  </button>
                  <p className="text-helper text-ink-subtle text-center">
                    {t('signOutClearsProgress')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-bg-alt flex items-center justify-center flex-shrink-0">
                    <GitHubIcon className="w-5 h-5 text-ink-soft" />
                  </div>
                  <div>
                    <p className="text-body font-bold text-ink">{t('accountGitHubUser')}</p>
                    <p className="mt-1 text-secondary text-ink-mute">
                      {t('accountSignedOutDescription')}
                    </p>
                  </div>
                </div>

                <div className="rounded-card bg-bg-alt border border-border px-3 py-2.5 text-secondary text-ink-mute">
                  {t('accountLocalProgressNotice')}
                </div>

                <button
                  type="button"
                  onClick={handleSignIn}
                  className="w-full rounded-button bg-ink px-4 py-2.5 text-body font-bold text-bg flex items-center justify-center gap-2"
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
          <div className="rounded-card bg-surface border border-border">
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
              className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-bg-alt"
            >
              <span className="text-body text-ink">{t('settingsPrivacy')}</span>
              <ChevronRight className="w-4 h-4 text-ink-subtle" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 hover:bg-bg-alt"
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
