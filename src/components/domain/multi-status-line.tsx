'use client'
import { Info } from 'lucide-react'
import { useT } from '@/hooks/use-t'

interface MultiStatusLineProps {
  selected: number
  required: number
}

export function MultiStatusLine({ selected, required }: MultiStatusLineProps) {
  const t = useT()
  const remaining = required - selected
  const done = remaining <= 0
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5',
        'font-mono text-helper font-bold uppercase tracking-wide',
        done ? 'text-success-deep' : 'text-ink-mute',
      ].join(' ')}
    >
      <Info className="w-3 h-3" strokeWidth={2} />
      {done ? t('selectedNofN', { n: selected, total: required }) : t('selectN', { n: remaining })}
    </span>
  )
}
