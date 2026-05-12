'use client'
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
  const { message, clear } = useToastStore()
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(clear, 3000)
    return () => window.clearTimeout(id)
  }, [message, clear])
  if (!message) return null
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-pill bg-ink text-bg text-secondary shadow-lg max-w-[80%] text-center">
      {message}
    </div>
  )
}
