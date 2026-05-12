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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full text-left p-3 flex items-start gap-3 transition-colors',
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
      >
        {letter}
      </span>
      <span className="text-option text-ink leading-[1.55]">{text}</span>
    </button>
  )
}
