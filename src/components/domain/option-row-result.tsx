import { Check, X } from 'lucide-react'
import { Prose } from '@/components/primitives/prose'
import type { Letter } from '@/data/types'

type State = 'idle' | 'correct' | 'wrong' | 'missed-correct'

interface OptionRowResultProps {
  letter: Letter
  text: string
  state: State
  multi?: boolean
}

export function OptionRowResult({ letter, text, state, multi = false }: OptionRowResultProps) {
  const baseClass = [
    'w-full text-left px-3.5 py-3 flex items-start gap-3 border-[1.5px]',
    multi ? 'rounded-option-multi' : 'rounded-option',
  ].join(' ')
  const tileShape = multi ? 'rounded-letter-square' : 'rounded-full'
  let tileClass = 'bg-bg-alt text-ink-soft'
  let borderClass = 'border-border bg-surface'
  let textClass = 'text-ink-mute'
  let trailingIcon: React.ReactNode = null

  if (state === 'correct') {
    borderClass = 'border-success bg-success-soft'
    tileClass = 'bg-success text-white'
    textClass = 'text-ink'
    trailingIcon = <Check className="w-4 h-4 text-success" strokeWidth={2.5} />
  } else if (state === 'wrong') {
    borderClass = 'border-danger bg-danger-soft'
    tileClass = 'bg-danger text-white'
    textClass = 'text-ink'
    trailingIcon = <X className="w-4 h-4 text-danger" strokeWidth={2.5} />
  } else if (state === 'missed-correct') {
    borderClass = 'border-success bg-surface'
    tileClass = 'bg-success-soft text-success-deep'
    textClass = 'text-ink'
    trailingIcon = <Check className="w-4 h-4 text-success" strokeWidth={2.5} />
  }

  return (
    <div className={[baseClass, borderClass].join(' ')}>
      <span
        className={[
          'flex-shrink-0 w-7 h-7 flex items-center justify-center text-secondary font-bold',
          tileShape,
          tileClass,
        ].join(' ')}
      >
        {letter}
      </span>
      <div className={['min-w-0 flex-1', textClass].join(' ')}>
        <Prose variant="option" source={text} className="text-inherit [&_*]:text-inherit" />
      </div>
      {trailingIcon ? <div className="mt-1 flex-shrink-0">{trailingIcon}</div> : null}
    </div>
  )
}
