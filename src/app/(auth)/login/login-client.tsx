'use client'

import { Globe, UserRound } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useEffect, useState, useTransition } from 'react'
import { GitHubIcon } from '@/components/icons/github-icon'
import { useAccountPreferences } from '@/components/providers/account-preferences-provider'
import { useT } from '@/hooks/use-t'
import { completeOnboardingStep } from '@/lib/onboarding-client'
import { consumeSyncExpiredLoginMessage } from '@/lib/sync-login-message'
import { usePrefsStore } from '@/stores/prefs-store'

type LoginClientProps = {
  hasAuthError: boolean
}

export function LoginClient({ hasAuthError }: LoginClientProps) {
  const t = useT()
  const router = useRouter()
  const { status } = useSession()
  const accountPreferences = useAccountPreferences()
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)
  const [error, setError] = useState<string | null>(null)
  const [authGateCompleted, setAuthGateCompleted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (consumeSyncExpiredLoginMessage()) setError(t('loginSyncExpired'))
  }, [t])

  useEffect(() => {
    if (status !== 'authenticated') {
      setAuthGateCompleted(false)
      return
    }

    let active = true

    async function finishAuthGate() {
      try {
        await completeOnboardingStep('complete-auth-gate')
        if (active) setAuthGateCompleted(true)
      } catch {
        if (active) setError(t('loginOnboardingError'))
      }
    }

    void finishAuthGate()

    return () => {
      active = false
    }
  }, [status, t])

  useEffect(() => {
    if (!authGateCompleted) return

    if (accountPreferences.status === 'resolved') {
      router.replace(accountPreferences.resolvedCert ? '/' : '/select-cert')
      return
    }

    if (accountPreferences.status === 'error') {
      setError(t('loginAccountPreferencesError'))
    }
  }, [accountPreferences.resolvedCert, accountPreferences.status, authGateCompleted, router, t])

  function handleGitHubSignIn() {
    void signIn('github', { callbackUrl: '/login' })
  }

  function handleLanguageToggle() {
    startTransition(() => {
      setLocale(locale === 'en' ? 'zh' : 'en')
    })
  }

  function handleGuestContinue() {
    setError(null)
    startTransition(async () => {
      try {
        await completeOnboardingStep('complete-auth-gate')
        router.replace('/select-cert')
      } catch {
        setError(t('loginOnboardingError'))
      }
    })
  }

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-y-auto px-7 pt-8 pb-6">
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            aria-label={t('loginLanguageToggle')}
            onClick={handleLanguageToggle}
            className="inline-flex items-center gap-1 rounded-pill bg-bg-alt px-3 py-1.5 text-secondary font-medium text-ink-soft"
          >
            <Globe className="h-3.5 w-3.5" strokeWidth={1.8} />
            {locale === 'zh' ? 'EN' : '中文'}
          </button>
        </div>

        <section className="flex flex-1 flex-col">
          <div className="mb-8 flex items-center gap-3">
            <Image src="/logo.png" alt="ace-aws" width={44} height={44} priority />
            <div>
              <p className="text-[20px] font-bold leading-tight tracking-[-0.4px] text-ink">
                {t('appName')}
              </p>
              <p className="mt-0.5 text-secondary text-ink-mute">{t('appTagline')}</p>
            </div>
          </div>

          <h1 className="m-0 text-[28px] font-bold tracking-[-0.6px] text-ink">
            {t('loginWelcome')}
          </h1>
          <p className="mt-2 mb-7 text-[14px] leading-[1.5] text-ink-mute">{t('loginSubtitle')}</p>

          {hasAuthError ? (
            <p className="mb-3 rounded-card border border-danger/25 bg-danger/10 px-3 py-2 text-secondary text-danger">
              {t('loginAuthError')}
            </p>
          ) : null}
          {error ? (
            <p className="mb-3 rounded-card border border-danger/25 bg-danger/10 px-3 py-2 text-secondary text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleGitHubSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-btn-bg px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgb(46_99_201_/_25%)]"
          >
            <GitHubIcon className="h-4 w-4" />
            {t('signInWithGitHub')}
          </button>

          <div className="my-6 flex items-center gap-3 text-helper uppercase tracking-[1px] text-ink-mute">
            <div className="h-px flex-1 bg-border" />
            {t('loginOr')}
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGuestContinue}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-border bg-transparent px-4 py-3.5 text-[14px] font-semibold text-ink disabled:opacity-60"
          >
            <UserRound className="h-4 w-4" strokeWidth={1.8} />
            {t('continueAsGuest')}
          </button>

          <p className="mt-2 text-center text-helper text-ink-subtle">{t('guestModeNotice')}</p>
        </section>
      </div>
    </main>
  )
}
