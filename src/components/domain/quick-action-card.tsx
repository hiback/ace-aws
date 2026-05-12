import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface QuickActionCardProps {
  icon: LucideIcon
  label: string
  count: number
  href: string
}

export function QuickActionCard({ icon: Icon, label, count, href }: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="block p-4 rounded-card bg-surface border border-border hover:border-border-strong transition-colors"
    >
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 text-ink-mute" strokeWidth={1.75} />
        <span className="font-mono text-page font-bold text-ink">{count}</span>
      </div>
      <p className="mt-3 text-body font-medium text-ink-soft">{label}</p>
    </Link>
  )
}
