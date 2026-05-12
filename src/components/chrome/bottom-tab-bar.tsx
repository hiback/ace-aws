'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Settings } from 'lucide-react'
import { useT } from '@/hooks/use-t'

const tabs = [
  { href: '/', label: 'tabHome' as const, Icon: Home },
  { href: '/settings', label: 'tabSettings' as const, Icon: Settings },
]

export function BottomTabBar() {
  const pathname = usePathname()
  const t = useT()
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border safe-bottom"
      role="navigation"
    >
      <ul className="flex items-stretch justify-around max-w-md mx-auto h-14">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={[
                  'flex flex-col items-center justify-center gap-1 h-full',
                  active ? 'text-accent' : 'text-ink-mute hover:text-ink-soft',
                ].join(' ')}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className="text-[10px] font-medium tracking-wide">{t(label)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
