'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useEffect, useState, useTransition } from 'react'
import { GitHubIcon } from '@/components/icons/github-icon'
import { useT } from '@/hooks/use-t'
import { completeOnboardingStep } from '@/lib/onboarding-client'
import { usePrefsStore } from '@/stores/prefs-store'

type LoginClientProps = {
  hasAuthError: boolean
}

export function LoginClient({ hasAuthError }: LoginClientProps) {
  const t = useT()
  const router = useRouter()
  const { status } = useSession()
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (status !== 'authenticated') return

    let active = true

    async function finishAuthGate() {
      try {
        await completeOnboardingStep('complete-auth-gate')
        if (active) router.replace('/select-cert')
      } catch {
        if (active) setError(t('loginOnboardingError'))
      }
    }

    void finishAuthGate()

    return () => {
      active = false
    }
  }, [router, status, t])

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
    <main className="min-h-dvh bg-bg px-5 py-6 text-ink">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col">
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={t('loginLanguageToggle')}
            onClick={handleLanguageToggle}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-secondary font-bold text-ink-mute"
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
        </div>

        <section className="flex flex-1 flex-col justify-center py-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image src="/logo.png" alt="ace-aws" width={96} height={96} priority />
            <p className="mt-4 text-title font-black tracking-tight">{t('appName')}</p>
            <p className="mt-1 text-secondary text-ink-mute">{t('appTagline')}</p>
          </div>

          <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <div className="text-center">
              <h1 className="text-heading font-black tracking-tight">{t('loginWelcome')}</h1>
              <p className="mt-2 text-body text-ink-mute">{t('loginSubtitle')}</p>
            </div>

            {hasAuthError ? (
              <p className="mt-5 rounded-card border border-danger/25 bg-danger/10 px-3 py-2 text-secondary text-danger">
                {t('loginAuthError')}
              </p>
            ) : null}
            {error ? (
              <p className="mt-5 rounded-card border border-danger/25 bg-danger/10 px-3 py-2 text-secondary text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-6 space-y-4">
              <button
                type="button"
                onClick={handleGitHubSignIn}
                className="flex w-full items-center justify-center gap-2 rounded-button bg-ink px-4 py-3 text-body font-bold text-bg"
              >
                <GitHubIcon className="h-5 w-5" />
                {t('signInWithGitHub')}
              </button>

              <div className="flex items-center gap-3 text-helper font-bold uppercase tracking-[1px] text-ink-subtle">
                <div className="h-px flex-1 bg-border" />
                {t('loginOr')}
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGuestContinue}
                disabled={isPending}
                className="w-full rounded-button border border-border bg-surface px-4 py-3 text-body font-bold text-ink hover:bg-bg-alt disabled:opacity-60"
              >
                {t('continueAsGuest')}
              </button>
            </div>

            <p className="mt-4 text-center text-helper text-ink-subtle">{t('guestModeNotice')}</p>
          </div>
        </section>
      </div>
    </main>
  )
}
