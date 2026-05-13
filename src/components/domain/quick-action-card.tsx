import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface QuickActionCardProps {
  icon: LucideIcon
  label: string
  count: number
  href: string
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
  iconBgClass = 'bg-accent-soft',
  iconColorClass = 'text-accent',
  iconFilled = false,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="block p-4 rounded-card bg-surface border border-border hover:border-border-strong transition-colors"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconBgClass}`}>
        <Icon
          className={`w-[18px] h-[18px] ${iconColorClass}`}
          strokeWidth={1.75}
          {...(iconFilled ? { fill: 'currentColor' } : {})}
        />
      </div>
      <p className="text-body font-semibold text-ink">{label}</p>
      <p className="font-mono text-page font-bold text-ink leading-tight">{count}</p>
    </Link>
  )
}
