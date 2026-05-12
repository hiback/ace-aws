import { TopBar } from '@/components/chrome/top-bar'
import { TabsBar } from '@/components/domain/tabs-bar'

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar title="题目列表" />
      <TabsBar />
      <main className="pb-6">{children}</main>
    </>
  )
}
