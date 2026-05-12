'use client'
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
    <p
      className={[
        'font-mono text-mono-small uppercase tracking-wide',
        done ? 'text-success-deep' : 'text-ink-mute',
      ].join(' ')}
    >
      {done ? t('selectedNofN', { n: selected, total: required }) : t('selectN', { n: remaining })}
    </p>
  )
}
