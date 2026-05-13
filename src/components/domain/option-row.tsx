import type { KeyboardEvent } from 'react'
import { Prose } from '@/components/primitives/prose'
import type { Letter } from '@/data/types'

interface OptionRowProps {
  letter: Letter
  text: string
  selected: boolean
  multi: boolean
  onClick: () => void
  disabled?: boolean
}

export function OptionRow({ letter, text, selected, multi, onClick, disabled }: OptionRowProps) {
  const tileShape = multi ? 'rounded-letter-square' : 'rounded-full'

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      aria-label={letter}
      className={[
        'w-full text-left p-3 flex items-start gap-3 transition-colors select-none',
        multi ? 'rounded-option-multi border-[1.5px]' : 'rounded-option border-[1.5px]',
        selected
          ? 'bg-accent-softer border-accent'
          : 'bg-surface border-border hover:border-border-strong',
        disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'flex-shrink-0 w-7 h-7 flex items-center justify-center text-secondary font-bold',
          tileShape,
          selected ? 'bg-accent text-white' : 'bg-bg-alt text-ink-soft',
        ].join(' ')}
        aria-hidden="true"
      >
        {letter}
      </span>
      <div className="flex-1 min-w-0">
        <Prose variant="option" source={text} />
      </div>
    </div>
  )
}
