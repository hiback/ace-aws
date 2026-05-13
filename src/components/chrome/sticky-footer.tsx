import type { ReactNode } from 'react'

interface StickyFooterProps {
  children: ReactNode
  className?: string
}

export function StickyFooter({ children, className = '' }: StickyFooterProps) {
  return (
    <footer
      className={[
        'sticky bottom-0 z-10 bg-surface',
        'border-t border-border safe-bottom',
        className,
      ].join(' ')}
    >
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">{children}</div>
    </footer>
  )
}
