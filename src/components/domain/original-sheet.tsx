'use client'
import { Globe } from 'lucide-react'
import { BottomSheet } from '@/components/primitives/bottom-sheet'
import { Prose } from '@/components/primitives/prose'
import type { Letter } from '@/data/types'
import { useT } from '@/hooks/use-t'

interface OriginalSheetProps {
  open: boolean
  onClose: () => void
  enQuestion: string
  enOptions: Partial<Record<Letter, string>>
}

export function OriginalSheet({ open, onClose, enQuestion, enOptions }: OriginalSheetProps) {
  const t = useT()

  if (!open) return null

  const letters = Object.keys(enOptions) as Letter[]

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      panelClassName="max-h-[80%]"
      headerClassName="border-b border-border"
      contentClassName="min-h-0 overflow-y-auto px-[18px] pt-3.5 pb-5"
      header={
        <div className="flex min-w-0 items-center gap-2.5">
          <Globe className="w-3.5 h-3.5 text-accent-deep" strokeWidth={2} />
          <div className="flex-1 text-secondary font-bold text-ink tracking-tight">
            {t('englishOriginal')}
          </div>
        </div>
      }
    >
      <div className="mb-3.5">
        <Prose
          variant="stem"
          source={enQuestion}
          className="[&_p]:text-[13.5px] [&_p]:leading-[1.6]"
        />
      </div>
      <div className="flex flex-col gap-2">
        {letters.map((k) => (
          <div key={k} className="flex gap-2.5 items-start px-2.5 py-2 rounded-lg bg-bg-alt">
            <div className="w-[22px] h-[22px] rounded-[5px] bg-surface text-ink-soft border border-border flex items-center justify-center text-[11px] font-bold shrink-0">
              {k}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <Prose
                variant="option"
                source={enOptions[k] ?? ''}
                className="[&_p]:text-[12.5px] [&_p]:text-ink-soft [&_p]:leading-[1.55]"
              />
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
