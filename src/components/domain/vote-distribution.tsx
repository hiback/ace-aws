'use client'
import type { Letter } from '@/data/types'
import { useT } from '@/hooks/use-t'

type VoteDistribution = Partial<Record<Letter, number>> | Record<string, number>

interface VoteDistributionProps {
  distribution: VoteDistribution
  correctKey: string
}

export function VoteDistribution({ distribution, correctKey }: VoteDistributionProps) {
  const t = useT()
  const sorted = Object.entries(distribution)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort(([, a], [, b]) => b - a)

  if (sorted.length === 0) return null

  return (
    <section className="rounded-card bg-surface border border-border p-4">
      <h3 className="font-mono text-mono-small text-ink-mute uppercase tracking-wide mb-3">
        {t('voteTitle')}
      </h3>
      <ul className="space-y-2">
        {sorted.map(([combo, percent]) => {
          const isCorrect = combo === correctKey
          const fill = isCorrect ? 'bg-success' : 'bg-accent'
          const text = isCorrect ? 'text-success-deep' : 'text-accent-deep'
          const label = combo.split('').join(' + ')
          return (
            <li key={combo} className="flex items-center gap-3">
              <span className="font-mono text-secondary font-bold w-16 text-ink">{label}</span>
              <div className="flex-1 h-1.5 rounded-pill bg-bg-alt overflow-hidden">
                <div className={['h-full', fill].join(' ')} style={{ width: `${percent}%` }} />
              </div>
              <span
                className={['font-mono text-secondary font-bold w-10 text-right', text].join(' ')}
              >
                {percent}%
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
