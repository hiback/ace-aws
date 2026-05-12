'use client'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useT } from '@/hooks/use-t'

type Tone = 'correct' | 'wrong' | 'partial'

interface StatusBannerProps {
  tone: Tone
}

export function StatusBanner({ tone }: StatusBannerProps) {
  const t = useT()
  const config: Record<
    Tone,
    { Icon: typeof CheckCircle2; bg: string; text: string; label: string }
  > = {
    correct: {
      Icon: CheckCircle2,
      bg: 'bg-success-soft',
      text: 'text-success-deep',
      label: t('bannerCorrect'),
    },
    wrong: {
      Icon: XCircle,
      bg: 'bg-danger-soft',
      text: 'text-danger-deep',
      label: t('bannerWrong'),
    },
    partial: {
      Icon: AlertTriangle,
      bg: 'bg-info-soft',
      text: 'text-info',
      label: t('bannerPartial'),
    },
  }
  const { Icon, bg, text, label } = config[tone]
  return (
    <div
      className={[
        'flex items-center gap-2 px-4 py-3 rounded-card text-card font-bold',
        bg,
        text,
      ].join(' ')}
    >
      <Icon className="w-5 h-5" strokeWidth={2.25} />
      {label}
    </div>
  )
}
