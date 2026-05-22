import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface QuickActionCardProps {
  icon: LucideIcon
  label: string
  count?: number
  href?: string
  onClick?: () => void
  disabled?: boolean
  /** Tailwind classes for the icon tile background + icon color. */
  iconBgClass?: string
  iconColorClass?: string
  /** Render the icon with fill="currentColor" (e.g. filled bookmark). */
  iconFilled?: boolean
}

export function QuickActionCard({
  icon: Icon,
  label,
  count,
  href,
  onClick,
  disabled = false,
  iconBgClass = 'bg-accent-soft',
  iconColorClass = 'text-accent',
  iconFilled = false,
}: QuickActionCardProps) {
  const className = [
    'block p-4 rounded-card bg-surface border border-border transition-colors',
    disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-border-strong',
  ].join(' ')
  const content = (
    <>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconBgClass}`}>
        <Icon
          className={`w-[18px] h-[18px] ${iconColorClass}`}
          strokeWidth={1.75}
          {...(iconFilled ? { fill: 'currentColor' } : {})}
        />
      </div>
      <p className="text-body font-semibold text-ink">{label}</p>
      {typeof count === 'number' ? (
        <p className="font-mono text-page font-bold text-ink leading-tight">{count}</p>
      ) : null}
    </>
  )

  if (onClick || disabled || !href) {
    const buttonDisabled = disabled || !onClick
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={buttonDisabled}
        aria-disabled={buttonDisabled ? 'true' : undefined}
        className={`w-full text-left ${className}`}
      >
        {content}
      </button>
    )
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}
