'use client'
import { Globe, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Letter } from '@/data/types'

interface OriginalSheetProps {
  open: boolean
  onClose: () => void
  enQuestion: string
  enOptions: Partial<Record<Letter, string>>
}

export function OriginalSheet({ open, onClose, enQuestion, enOptions }: OriginalSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const letters = Object.keys(enOptions) as Letter[]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-md h-[80%] bg-surface rounded-t-[22px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden">
        <div className="flex justify-center pt-2 pb-1.5 shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-strong/55" />
        </div>
        <div className="px-4 pt-1 pb-3 flex items-center gap-2.5 border-b border-border shrink-0">
          <Globe className="w-3.5 h-3.5 text-accent-deep" strokeWidth={2} />
          <div className="flex-1 text-secondary font-bold text-ink tracking-tight">
            English Original
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-bg-alt flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5 text-ink-soft" strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-[18px] pt-3.5 pb-5">
          <p className="text-[13.5px] text-ink leading-[1.6] mb-3.5 whitespace-pre-wrap">
            {enQuestion}
          </p>
          <div className="flex flex-col gap-2">
            {letters.map((k) => (
              <div key={k} className="flex gap-2.5 items-start px-2.5 py-2 rounded-lg bg-bg-alt">
                <div className="w-[22px] h-[22px] rounded-[5px] bg-surface text-ink-soft border border-border flex items-center justify-center text-[11px] font-bold shrink-0">
                  {k}
                </div>
                <div className="flex-1 text-[12.5px] text-ink-soft leading-[1.55] pt-0.5 whitespace-pre-wrap">
                  {enOptions[k] ?? ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
