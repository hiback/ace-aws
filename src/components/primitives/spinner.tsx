interface SpinnerProps {
  size?: 16 | 24 | 32
  className?: string
}

export function Spinner({ size = 24, className = '' }: SpinnerProps) {
  return (
    <span
      className={[
        'inline-block animate-spin rounded-full border-2 border-border border-t-accent',
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
      aria-label="Loading"
      role="status"
    />
  )
}
