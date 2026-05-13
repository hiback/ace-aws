'use client'
import { Info } from 'lucide-react'
import { Prose } from '@/components/primitives/prose'
import { useT } from '@/hooks/use-t'

interface ExplanationCardProps {
  zh: string
  en: string
  locale: 'zh' | 'en'
}

export function ExplanationCard({ zh, en, locale }: ExplanationCardProps) {
  const t = useT()
  const source = locale === 'zh' ? zh : en
  if (!source) return null
  return (
    <section className="mt-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-accent-soft flex items-center justify-center flex-shrink-0">
          <Info className="w-3.5 h-3.5 text-accent-deep" strokeWidth={2.25} />
        </div>
        <h3 className="text-card font-bold text-ink tracking-tight">{t('explanationTitle')}</h3>
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-ink-mute">
          {t('explanationTag')}
        </span>
      </div>
      <div className="rounded-card bg-surface border border-border shadow-sm px-4 pt-4 pb-2">
        <Prose variant="explanation" source={source} />
      </div>
    </section>
  )
}
