'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/hooks/use-t'

const tabs = [
  { href: '/list/wrong', label: 'tabWrong' as const },
  { href: '/list/bookmarks', label: 'tabBookmarks' as const },
]

export function TabsBar() {
  const pathname = usePathname()
  const t = useT()
  return (
    <nav className="sticky top-12 z-10 bg-surface border-b border-border">
      <div className="max-w-md mx-auto flex items-center gap-2 overflow-x-auto px-5 py-3">
        {tabs.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={[
                'px-3 py-1.5 rounded-pill text-secondary font-semibold whitespace-nowrap transition-colors',
                active ? 'bg-accent text-white' : 'bg-bg-alt text-ink-soft hover:text-ink',
              ].join(' ')}
            >
              {t(label)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
