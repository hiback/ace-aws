import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center px-6 py-12',
        className,
      ].join(' ')}
    >
      {Icon ? <Icon className="w-12 h-12 mb-4 text-ink-subtle" strokeWidth={1.5} /> : null}
      <p className="text-card font-bold text-ink">{title}</p>
      {description ? <p className="mt-2 text-body text-ink-mute max-w-xs">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
