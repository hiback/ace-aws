export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh max-w-md mx-auto flex flex-col">{children}</div>
}
