'use client'
import { TopBar } from '@/components/chrome/top-bar'
import { TabsBar } from '@/components/domain/tabs-bar'
import { useT } from '@/hooks/use-t'

export default function ListLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <>
      <TopBar title={t('questionListTitle')} backHref="/" />
      <TabsBar />
      <main className="pb-6">{children}</main>
    </>
  )
}
