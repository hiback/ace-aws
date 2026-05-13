interface ProgressBarProps {
  value: number // 0..1
  height?: 2 | 3 | 4 | 6
  color?: 'accent' | 'success' | 'danger'
  trackColor?: 'border' | 'bg-alt'
  className?: string
}

export function ProgressBar({
  value,
  height = 2,
  color = 'accent',
  trackColor = 'bg-alt',
  className = '',
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const heightClass =
    height === 2 ? 'h-0.5' : height === 3 ? 'h-[3px]' : height === 4 ? 'h-1' : 'h-1.5'
  const trackClass = trackColor === 'border' ? 'bg-border' : 'bg-bg-alt'
  const fillClass =
    color === 'success' ? 'bg-success' : color === 'danger' ? 'bg-danger' : 'bg-accent'
  return (
    <div
      className={['w-full overflow-hidden rounded-pill', heightClass, trackClass, className].join(
        ' ',
      )}
    >
      <div
        className={['h-full transition-[width]', fillClass].join(' ')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
