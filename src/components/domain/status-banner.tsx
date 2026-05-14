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
    fill: string
    shadow: string
    labelKey: 'bannerCorrect' | 'bannerWrong' | 'bannerPartial'
  }
> = {
  correct: {
    fill: 'bg-[#2F7D55] dark:bg-[#245C43]',
    shadow: 'shadow-[0_4px_14px_-6px_rgba(47,125,85,0.55)]',
    labelKey: 'bannerCorrect',
  },
  wrong: {
    fill: 'bg-[#B84A4A] dark:bg-[#8F3A3A]',
    shadow: 'shadow-[0_4px_14px_-6px_rgba(184,74,74,0.55)]',
    labelKey: 'bannerWrong',
  },
  partial: {
    fill: 'bg-[#1F55B6] dark:bg-[#264A84]',
    shadow: 'shadow-[0_4px_14px_-6px_rgba(31,85,182,0.55)]',
    labelKey: 'bannerPartial',
  },
}

function PartialMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M11 4.5 A6.5 6.5 0 0 1 11 17.5 Z" fill="currentColor" />
    </svg>
  )
}

export function StatusBanner({ tone, correctLetters, userLetters }: StatusBannerProps) {
  const t = useT()
  const { fill, shadow, labelKey } = TONE[tone]
  const isMultiPartial = tone === 'partial' && correctLetters.length > 1
  const overlap = userLetters.filter((l) => correctLetters.includes(l)).length
  const correctLabel = correctLetters.join(' + ')
  const userLabel = userLetters.length > 0 ? userLetters.join(' + ') : '-'

  return (
    <div
      className={['flex items-center gap-3 rounded-option px-4 py-3 text-white', fill, shadow].join(
        ' ',
      )}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white/20 text-current">
        {tone === 'correct' ? (
          <Check className="h-4 w-4 text-current" strokeWidth={2.5} />
        ) : tone === 'wrong' ? (
          <X className="h-4 w-4 text-current" strokeWidth={2.5} />
        ) : (
          <PartialMark />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold leading-tight tracking-[0.01em] text-current">
          {t(labelKey)}
          {isMultiPartial ? (
            <span className="ml-2 text-secondary font-mono font-semibold opacity-80">
              {overlap}/{correctLetters.length}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-secondary leading-snug text-current">
          {t('correctAnswerIs')} <strong className="font-bold text-current">{correctLabel}</strong>
          {' · '}
          {t('yourAnswer')} <strong className="font-bold text-current">{userLabel}</strong>
        </p>
      </div>
    </div>
  )
}
