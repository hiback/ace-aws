'use client'
import dynamic from 'next/dynamic'
import { Spinner } from '@/components/primitives/spinner'
import { useT } from '@/hooks/use-t'

const ExplanationMarkdown = dynamic(() => import('./explanation-markdown'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  ),
})

interface ExplanationCardProps {
  zh: string
  en: string
  locale: 'zh' | 'en'
}

export function ExplanationCard({ zh, en, locale }: ExplanationCardProps) {
  const t = useT()
  const source = locale === 'zh' ? zh : en
  return (
    <section className="rounded-card bg-surface border border-border p-4">
      <h3 className="font-mono text-mono-small text-ink-mute uppercase tracking-wide mb-3">
        {t('explanationTitle')}
      </h3>
      <ExplanationMarkdown source={source} />
    </section>
  )
}
