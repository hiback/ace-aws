'use client'
import { useT } from '@/hooks/use-t'

type VoteDistribution = Partial<Record<string, number>>

interface VoteDistributionProps {
  distribution: VoteDistribution
  correctKey: string
  userKey?: string
  isMulti?: boolean
}

const COMBO_PALETTE = [
  'bg-[#C97A3D] dark:bg-[#D89868]',
  'bg-[#7A6BAE] dark:bg-[#A48EC8]',
  'bg-[#3F8FA8] dark:bg-[#6FAAC0]',
  'bg-[#B89030] dark:bg-[#D9B068]',
  'bg-[#A85775] dark:bg-[#C88A9F]',
]

const BAR_USER_STRIPE =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 4px, transparent 4px 8px)'
const LEGEND_USER_STRIPE =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 5px)'
const ORPHAN_USER_STRIPE =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-ink) 45%, transparent) 0 2px, transparent 2px 5px)'

function isOtherKey(key: string): boolean {
  return key === 'Other'
}

function normalizeComboKey(key: string): string {
  return key.toUpperCase().split('').sort().join('')
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function VoteDistribution({
  distribution,
  correctKey,
  userKey,
  isMulti = false,
}: VoteDistributionProps) {
  const t = useT()
  const sorted = Object.entries(distribution)
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]) && (entry[1] ?? 0) > 0)
    .map(([combo, percent]) => ({ combo, percent: Math.min(100, Math.max(0, percent)) }))
    .sort((a, b) => b.percent - a.percent)

  if (sorted.length === 0) return null

  let paletteIndex = 0
  const normalizedCorrect = normalizeComboKey(correctKey)
  const normalizedUser = userKey ? normalizeComboKey(userKey) : ''
  const computed = sorted.map(({ combo, percent }) => {
    const isOther = isOtherKey(combo)
    const sortedKey = isOther ? 'Other' : normalizeComboKey(combo)
    const isCorrect = !isOther && sortedKey === normalizedCorrect
    const isUser = !isOther && normalizedUser !== '' && sortedKey === normalizedUser
    const colorClass = isOther
      ? 'bg-ink-subtle'
      : isCorrect
        ? 'bg-success'
        : COMBO_PALETTE[paletteIndex++ % COMBO_PALETTE.length]
    return {
      combo,
      percent,
      percentLabel: formatPercent(percent),
      sortedKey,
      isCorrect,
      isUser,
      isOther,
      colorClass,
    }
  })
  const totalPercent = computed.reduce((sum, item) => sum + item.percent, 0)
  let visualStart = 0
  const visualItems = computed.map((item) => {
    const visualPercent = (item.percent / totalPercent) * 100
    const visualItem = { ...item, visualStart, visualPercent }
    visualStart += visualPercent
    return visualItem
  })
  const userVisualItem = visualItems.find((item) => item.isUser)

  const userMatched = computed.some((c) => c.isUser)
  const showOrphanUser = normalizedUser !== '' && !userMatched
  const realCount = computed.filter((c) => !c.isOther).length
  const title = isMulti ? t('voteTitleMulti') : t('voteTitle')
  const countLabel = isMulti
    ? t('voteComboCount', { count: realCount })
    : t('voteOptionCount', { count: realCount })
  const labelFor = (item: (typeof visualItems)[number]) =>
    item.isOther ? t('voteOther') : item.combo

  return (
    <section
      className="rounded-option-multi bg-bg-alt/55 border border-border px-3.5 py-3"
      aria-label={title}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-helper font-bold text-ink-soft tracking-tight">{title}</h3>
        <span className="font-mono text-[9.5px] font-bold text-ink-mute uppercase tracking-[0.08em]">
          {countLabel}
        </span>
      </div>

      <div className="relative">
        <div className="flex h-7 w-full overflow-hidden rounded-badge border border-border bg-bg-alt">
          {visualItems.map((item, index) => {
            const showLabel = item.percent >= 10
            return (
              <div
                key={item.combo}
                className={[
                  'min-w-1.5 flex shrink-0 items-center justify-center gap-1 border-surface text-white',
                  index === computed.length - 1 ? '' : 'border-r',
                  'font-mono text-mono-small font-bold tracking-wide',
                  item.colorClass,
                ].join(' ')}
                style={{
                  flexBasis: `${item.visualPercent}%`,
                }}
              >
                {showLabel ? (
                  <>
                    <span>{labelFor(item)}</span>
                    <span className="opacity-85">{item.percentLabel}%</span>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
        {userVisualItem ? (
          <div
            aria-hidden="true"
            data-user-vote-marker="bar"
            className="pointer-events-none absolute -top-0.5 -bottom-0.5 min-w-2 rounded-badge border-2 border-ink"
            style={{
              left: `${userVisualItem.visualStart}%`,
              width: `${userVisualItem.visualPercent}%`,
              backgroundImage: BAR_USER_STRIPE,
            }}
          />
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[10.5px] text-ink-soft">
        {visualItems.map((item) => (
          <span
            key={item.combo}
            className={[
              'inline-flex items-center gap-1.5',
              item.isCorrect || item.isUser ? 'font-bold' : 'font-medium',
              item.isCorrect
                ? 'text-success-deep'
                : item.isOther
                  ? 'text-ink-mute'
                  : 'text-ink-soft',
            ].join(' ')}
          >
            <span
              data-user-vote-marker={item.isUser ? 'legend' : undefined}
              className={['relative h-2.5 w-2.5 flex-shrink-0 rounded-[2px]', item.colorClass].join(
                ' ',
              )}
              style={{
                outline: item.isUser ? '1.5px solid var(--color-ink)' : undefined,
                outlineOffset: 0,
              }}
            >
              {item.isUser ? (
                <span
                  className="absolute inset-0 rounded-[2px]"
                  style={{ backgroundImage: LEGEND_USER_STRIPE }}
                />
              ) : null}
            </span>
            <span className="font-mono tracking-wide">{labelFor(item)}</span>
            <span className="font-mono font-semibold text-ink-mute">{item.percentLabel}%</span>
            {item.isCorrect ? (
              <span className="ml-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-success-deep">
                {t('voteCorrect')}
              </span>
            ) : null}
            {item.isUser ? (
              <span className="ml-0.5 rounded-[4px] border border-border-strong bg-bg-alt px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-ink">
                {t('voteYou')}
              </span>
            ) : null}
          </span>
        ))}
        {showOrphanUser ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-danger-deep">
            <span
              data-user-vote-marker="orphan-legend"
              className="relative h-2.5 w-2.5 flex-shrink-0 rounded-[2px] bg-bg-alt"
              style={{ outline: '1.5px solid var(--color-ink)', outlineOffset: 0 }}
            >
              <span
                className="absolute inset-0 rounded-[2px]"
                style={{ backgroundImage: ORPHAN_USER_STRIPE }}
              />
            </span>
            <span className="font-mono tracking-wide text-ink">{normalizedUser}</span>
            <span className="rounded-[4px] border border-border-strong bg-bg-alt px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-ink">
              {t('voteYou')}
            </span>
            <span className="text-[9.5px] font-medium text-ink-mute">
              · {t('voteNotInDistribution')}
            </span>
          </span>
        ) : null}
      </div>
    </section>
  )
}
