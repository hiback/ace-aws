'use client'
import { ChevronRight } from 'lucide-react'
import { TopBar } from '@/components/chrome/top-bar'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'
import type { Locale, Theme } from '@/data/types'

const APP_VERSION = '0.1.0'
const REPO_URL = 'https://github.com/hiback/ace-aws'

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

function SettingsRow({
  label,
  control,
}: {
  label: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
      <span className="text-body text-ink">{label}</span>
      {control}
    </div>
  )
}

export default function SettingsPage() {
  const t = useT()
  const theme = usePrefsStore((s) => s.theme)
  const setTheme = usePrefsStore((s) => s.setTheme)
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)

  return (
    <>
      <TopBar title={t('settingsTitle')} leftAction={null} />
      <main className="px-4 pt-4 pb-6 space-y-5">
        <section>
          <h2 className="text-helper font-mono uppercase tracking-wide text-ink-mute mb-2 px-1">
            {t('settingsAppearance')}
          </h2>
          <div className="rounded-card bg-surface border border-border">
            <SettingsRow
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
        </section>

        <section>
          <h2 className="text-helper font-mono uppercase tracking-wide text-ink-mute mb-2 px-1">
            {t('settingsLanguage')}
          </h2>
          <div className="rounded-card bg-surface border border-border">
            <SettingsRow
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
        </section>

        <section>
          <h2 className="text-helper font-mono uppercase tracking-wide text-ink-mute mb-2 px-1">
            {t('settingsAbout')}
          </h2>
          <div className="rounded-card bg-surface border border-border">
            <SettingsRow
              label={t('settingsVersion')}
              control={<span className="font-mono text-secondary text-ink-mute">{APP_VERSION}</span>}
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
        </section>
      </main>
    </>
  )
}
