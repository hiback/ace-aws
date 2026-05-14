'use client'
import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useT } from '@/hooks/use-t'

interface TopBarProps {
  title?: ReactNode
  leftAction?: 'back' | ReactNode
  /** Logical parent route for the back button. When omitted, falls back to browser history. */
  backHref?: string
  rightAction?: ReactNode
  className?: string
}

export function TopBar({
  title,
  leftAction = 'back',
  backHref,
  rightAction,
  className = '',
}: TopBarProps) {
  const router = useRouter()
  const t = useT()
  const back = (
    <button
      type="button"
      onClick={() => (backHref ? router.push(backHref) : router.back())}
      className="p-2 -ml-2 text-ink-soft hover:text-ink"
      aria-label={t('back')}
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  )
  return (
    <header
      className={['sticky top-0 z-10 bg-surface', 'border-b border-border', className].join(' ')}
    >
      <div className="max-w-md mx-auto h-12 px-2 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">{leftAction === 'back' ? back : leftAction}</div>
        <div className="flex-1 min-w-0 text-center text-body font-bold text-ink truncate">
          {title}
        </div>
        <div className="flex-1 min-w-0 flex justify-end">{rightAction}</div>
      </div>
    </header>
  )
}
