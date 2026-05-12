import { BottomTabBar } from '@/components/chrome/bottom-tab-bar'

export default function TabbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-14 max-w-md mx-auto">
      {children}
      <BottomTabBar />
    </div>
  )
}
