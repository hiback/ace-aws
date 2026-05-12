interface VoteBarProps {
  percent: number
  variant?: 'success' | 'accent' | 'mute'
}

export function VoteBar({ percent, variant = 'accent' }: VoteBarProps) {
  const fill =
    variant === 'success' ? 'bg-success' : variant === 'mute' ? 'bg-ink-subtle' : 'bg-accent'
  const text =
    variant === 'success' ? 'text-success-deep' : variant === 'mute' ? 'text-ink-mute' : 'text-accent-deep'
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 rounded-pill bg-bg-alt overflow-hidden">
        <div className={['h-full', fill].join(' ')} style={{ width: `${percent}%` }} />
      </div>
      <span className={['font-mono text-secondary font-bold', text].join(' ')}>{percent}%</span>
    </div>
  )
}
