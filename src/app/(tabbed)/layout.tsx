import { BottomTabBar } from '@/components/chrome/bottom-tab-bar'
import { ToastHost } from '@/hooks/use-toast'

export default function TabbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-14 max-w-md mx-auto">
      {children}
      <ToastHost />
      <BottomTabBar />
    </div>
  )
}
