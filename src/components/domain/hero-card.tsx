import type { ReactNode } from 'react'

interface HeroCardProps {
  eyebrow: string
  title: string
  stats: { label: string; value: ReactNode }[]
  cta: ReactNode
  headerAction?: ReactNode
}

export function HeroCard({ eyebrow, title, stats, cta, headerAction }: HeroCardProps) {
  return (
    <div
      className="relative isolate overflow-hidden rounded-hero p-5 text-white"
      style={{
        backgroundImage: 'linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))',
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-12 z-0 w-40 h-40 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      />
      <div
        className="pointer-events-none absolute -right-4 bottom-2 z-0 w-24 h-24 rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono uppercase tracking-wide text-helper opacity-80">{eyebrow}</p>
            <h2 className="mt-1 text-page font-bold leading-tight">{title}</h2>
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
        <div className="mt-4 flex gap-6">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-page font-bold tracking-tight leading-none">{s.value}</p>
              <p className="text-helper opacity-80 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">{cta}</div>
      </div>
    </div>
  )
}
