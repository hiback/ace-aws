import type { ReactNode } from 'react'

interface HeroCardProps {
  eyebrow: string
  title: string
  stats: { label: string; value: ReactNode }[]
  cta: ReactNode
}

export function HeroCard({ eyebrow, title, stats, cta }: HeroCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-hero p-5 text-white"
      style={{
        backgroundImage: 'linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))',
      }}
    >
      <div
        className="absolute -right-8 -top-12 w-40 h-40 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      />
      <div
        className="absolute -right-4 bottom-2 w-24 h-24 rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      />
      <p className="font-mono uppercase tracking-wide text-helper opacity-80">{eyebrow}</p>
      <h2 className="mt-1 text-page font-bold leading-tight">{title}</h2>
      <div className="mt-4 flex gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="font-mono text-card font-bold">{s.value}</p>
            <p className="text-helper opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5">{cta}</div>
    </div>
  )
}
