import { Check, X } from 'lucide-react'
import type { Letter } from '@/data/types'
import { Prose } from '@/components/primitives/prose'
import { VoteBar } from './vote-bar'

type State = 'idle' | 'correct' | 'wrong' | 'missed-correct'

interface OptionRowResultProps {
  letter: Letter
  text: string
  state: State
  showVoteBar: boolean
  votePercent?: number
}

export function OptionRowResult({
  letter,
  text,
  state,
  showVoteBar,
  votePercent,
}: OptionRowResultProps) {
  const baseClass = 'w-full text-left p-3 flex items-start gap-3 rounded-option border-[1.5px]'
  let tileClass = 'bg-bg-alt text-ink-soft'
  let borderClass = 'border-border bg-surface'
  let textClass = 'text-ink-mute'
  let trailingIcon: React.ReactNode = null

  if (state === 'correct') {
    borderClass = 'border-success bg-success-soft'
    tileClass = 'bg-success text-white'
    textClass = 'text-ink'
    trailingIcon = (
      <Check className="w-4 h-4 text-success ml-auto flex-shrink-0" strokeWidth={2.5} />
    )
  } else if (state === 'wrong') {
    borderClass = 'border-danger bg-danger-soft'
    tileClass = 'bg-danger text-white'
    textClass = 'text-ink'
    trailingIcon = <X className="w-4 h-4 text-danger ml-auto flex-shrink-0" strokeWidth={2.5} />
  } else if (state === 'missed-correct') {
    borderClass = 'border-success'
    tileClass = 'bg-bg-alt text-ink-soft'
    textClass = 'text-ink'
    trailingIcon = (
      <Check className="w-4 h-4 text-success ml-auto flex-shrink-0" strokeWidth={2.5} />
    )
  }

  return (
    <div className={[baseClass, borderClass].join(' ')}>
      <div className="flex w-full gap-3">
        <span
          className={[
            'flex-shrink-0 w-7 h-7 flex items-center justify-center text-secondary font-bold rounded-full',
            tileClass,
          ].join(' ')}
        >
          {letter}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className={['flex-1', textClass].join(' ')}>
              <Prose variant="option" source={text} />
            </div>
            {trailingIcon}
          </div>
          {showVoteBar && typeof votePercent === 'number' ? (
            <VoteBar
              percent={votePercent}
              variant={
                state === 'correct' || state === 'missed-correct'
                  ? 'success'
                  : state === 'wrong'
                    ? 'accent'
                    : 'mute'
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
