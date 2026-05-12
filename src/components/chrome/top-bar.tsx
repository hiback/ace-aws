'use client'
import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

interface TopBarProps {
  title?: ReactNode
  leftAction?: 'back' | ReactNode
  rightAction?: ReactNode
  className?: string
}

export function TopBar({ title, leftAction = 'back', rightAction, className = '' }: TopBarProps) {
  const router = useRouter()
  const back = (
    <button
      type="button"
      onClick={() => router.back()}
      className="p-2 -ml-2 text-ink-soft hover:text-ink"
      aria-label="Back"
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  )
  return (
    <header
      className={[
        'sticky top-0 z-10 bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/70',
        'border-b border-border',
        className,
      ].join(' ')}
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
