'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (message: string) => void
  clear: () => void
}

const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}))

export function useToast() {
  return { toast: useToastStore.getState().show }
}

export function ToastHost() {
  const pathname = usePathname() ?? ''
  const { message, clear } = useToastStore()
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(clear, 3000)
    return () => window.clearTimeout(id)
  }, [message, clear])
  if (!message) return null
  const bottomClass =
    ['/', '/wrong', '/bookmarks', '/settings', '/list'].includes(pathname) ||
    pathname.startsWith('/list/')
      ? 'bottom-20'
      : 'bottom-4'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${bottomClass} left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-pill bg-ink text-bg text-secondary shadow-lg max-w-sm text-center`}
    >
      {message}
    </div>
  )
}
