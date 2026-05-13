'use client'
import { Globe } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { Letter } from '@/data/types'
import { useT } from '@/hooks/use-t'
import { usePrefsStore } from '@/stores/prefs-store'
import { OriginalSheet } from './original-sheet'

interface QuestionStemProps {
  zhQuestion: string
  enQuestion: string
  enOptions: Partial<Record<Letter, string>>
  hint?: ReactNode
}

export function QuestionStem({ zhQuestion, enQuestion, enOptions, hint }: QuestionStemProps) {
  const locale = usePrefsStore((s) => s.locale)
  const t = useT()
  const [sheetOpen, setSheetOpen] = useState(false)

  const primaryText = locale === 'zh' ? zhQuestion : enQuestion
  const showEnButton = locale === 'zh' && zhQuestion !== enQuestion
  const showRow = Boolean(hint) || showEnButton

  return (
    <div className="space-y-3">
      <p className="text-body text-ink leading-[1.65] whitespace-pre-wrap">{primaryText}</p>
      {showRow ? (
        <div className="flex items-center gap-2.5 flex-wrap">
          {hint ? <div className="flex items-center">{hint}</div> : null}
          <div className="flex-1" />
          {showEnButton ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1.5 bg-surface border border-border text-ink-soft text-[11.5px] font-bold tracking-wider px-2.5 py-1 rounded-pill shadow-[0_1px_2px_var(--color-border)] cursor-pointer"
            >
              <Globe className="w-3 h-3 text-ink-soft" strokeWidth={2} />
              {t('enToggle')}
            </button>
          ) : null}
        </div>
      ) : null}
      {showEnButton ? (
        <OriginalSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          enQuestion={enQuestion}
          enOptions={enOptions}
        />
      ) : null}
    </div>
  )
}
