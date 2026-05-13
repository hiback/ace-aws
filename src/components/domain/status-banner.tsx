'use client'
import { Check, X } from 'lucide-react'
import type { Letter } from '@/data/types'
import { useT } from '@/hooks/use-t'

type Tone = 'correct' | 'wrong' | 'partial'

interface StatusBannerProps {
  tone: Tone
  correctLetters: Letter[]
  userLetters: Letter[]
}

const TONE: Record<
  Tone,
  {
    bg: string
    circle: string
    ink: string
    labelKey: 'bannerCorrect' | 'bannerWrong' | 'bannerPartial'
  }
> = {
  correct: {
    bg: 'bg-success-soft',
    circle: 'bg-success',
    ink: 'text-success-deep',
    labelKey: 'bannerCorrect',
  },
  wrong: {
    bg: 'bg-danger-soft',
    circle: 'bg-danger',
    ink: 'text-danger-deep',
    labelKey: 'bannerWrong',
  },
  partial: {
    bg: 'bg-bg-alt',
    circle: 'bg-accent',
    ink: 'text-accent-deep',
    labelKey: 'bannerPartial',
  },
}

function PartialMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="#fff" strokeWidth="2.5" fill="none" />
      <path d="M11 4.5 A6.5 6.5 0 0 1 11 17.5 Z" fill="#fff" />
    </svg>
  )
}

export function StatusBanner({ tone, correctLetters, userLetters }: StatusBannerProps) {
  const t = useT()
  const { bg, circle, ink, labelKey } = TONE[tone]
  const isFullyCorrect = tone === 'correct'
  const isMultiPartial = tone === 'partial' && correctLetters.length > 1
  const overlap = userLetters.filter((l) => correctLetters.includes(l)).length

  return (
    <div className={['flex items-center gap-3 px-5 py-3.5 rounded-card', bg].join(' ')}>
      <div
        className={[
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white',
          circle,
        ].join(' ')}
      >
        {tone === 'correct' ? (
          <Check className="w-[22px] h-[22px]" strokeWidth={2.5} />
        ) : tone === 'wrong' ? (
          <X className="w-[22px] h-[22px]" strokeWidth={2.5} />
        ) : (
          <PartialMark />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={['text-card font-bold leading-tight', ink].join(' ')}>
          {t(labelKey)}
          {isMultiPartial ? (
            <span className="ml-2 text-secondary font-mono font-semibold text-ink-soft">
              {overlap}/{correctLetters.length}
            </span>
          ) : null}
        </p>
        <p className="text-secondary text-ink-soft mt-0.5 leading-snug">
          {t('correctAnswerIs')}{' '}
          <strong className="text-success-deep font-bold">{correctLetters.join(' + ')}</strong>
          {isFullyCorrect ? null : (
            <>
              {' · '}
              {t('yourAnswer')}{' '}
              <strong className="text-danger-deep font-bold">{userLetters.join(' + ')}</strong>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
