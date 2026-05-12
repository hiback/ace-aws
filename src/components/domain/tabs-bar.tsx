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
    <nav className="sticky top-12 z-10 bg-bg/95 backdrop-blur border-b border-border">
      <div className="max-w-md mx-auto px-2 flex">
        {tabs.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex-1 text-center py-3 text-secondary font-medium',
                active
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-ink-mute border-b-2 border-transparent hover:text-ink-soft',
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
