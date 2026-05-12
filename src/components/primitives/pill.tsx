import type { ReactNode } from 'react'

type Tone = 'default' | 'accent' | 'success' | 'danger' | 'info'

interface PillProps {
  tone?: Tone
  className?: string
  children: ReactNode
}

const toneClasses: Record<Tone, string> = {
  default: 'bg-bg-alt text-ink-soft',
  accent:  'bg-accent-soft text-accent-deep',
  success: 'bg-success-soft text-success-deep',
  danger:  'bg-danger-soft text-danger-deep',
  info:    'bg-info-soft text-info',
}

export function Pill({ tone = 'default', className = '', children }: PillProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-helper font-mono uppercase tracking-wide',
        'rounded-pill',
        toneClasses[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
