'use client'
import { ChevronDown, ChevronUp, Globe } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'

interface QuestionStemProps {
  zh: string
  en: string
}

export function QuestionStem({ zh, en }: QuestionStemProps) {
  const locale = usePrefsStore((s) => s.locale)
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  const primaryText = locale === 'zh' ? zh : en
  const showToggle = locale === 'zh' && zh !== en

  return (
    <div className="space-y-3">
      <p className="text-body text-ink leading-[1.65] whitespace-pre-wrap">{primaryText}</p>
      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={[
            'inline-flex items-center gap-1 px-3 h-8 rounded-button text-secondary font-medium border',
            expanded
              ? 'bg-accent text-white border-accent'
              : 'bg-surface text-ink-soft border-border',
          ].join(' ')}
        >
          <Globe className="w-3.5 h-3.5" strokeWidth={2} />
          {t('enToggle')}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      ) : null}
      {expanded ? (
        <div className="rounded-card bg-bg-alt p-3">
          <p className="font-mono text-mono-small text-ink-mute uppercase tracking-wide mb-1">
            {t('englishOriginal')}
          </p>
          <p className="text-body text-ink-soft leading-[1.65] whitespace-pre-wrap">{en}</p>
        </div>
      ) : null}
    </div>
  )
}
