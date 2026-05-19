'use client'

import { X } from 'lucide-react'
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  closeLabel: string
  header: ReactNode
  children: ReactNode
  ariaLabelledby?: string
  footer?: ReactNode
  error?: ReactNode
  wrapperClassName?: string
  backdropClassName?: string
  panelClassName?: string
  handleClassName?: string
  headerClassName?: string
  contentClassName?: string
  closeButtonClassName?: string
  closeIconClassName?: string
  closeIconStrokeWidth?: number
}

const DRAG_ACTIVATE_PX = 12
const CLOSE_DISTANCE_PX = 96
const FLING_VELOCITY_PX_PER_MS = 0.8
const CLOSE_ANIMATION_MS = 180

function cx(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function BottomSheet({
  open,
  onClose,
  closeLabel,
  header,
  children,
  ariaLabelledby,
  footer,
  error,
  wrapperClassName,
  backdropClassName,
  panelClassName,
  handleClassName,
  headerClassName,
  contentClassName,
  closeButtonClassName,
  closeIconClassName,
  closeIconStrokeWidth = 2,
}: BottomSheetProps) {
  const dragRef = useRef({
    tracking: false,
    active: false,
    startY: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    recentVelocity: 0,
    pointerId: 0,
    startedOnCloseButton: false,
  })
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragCloseInProgressRef = useRef(false)
  const dragCloseDeliveredRef = useRef(false)
  const suppressCloseClickRef = useRef(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isClosingByDrag, setIsClosingByDrag] = useState(false)
  const [isReturning, setIsReturning] = useState(false)

  const resetDrag = useCallback(() => {
    dragRef.current = {
      tracking: false,
      active: false,
      startY: 0,
      startTime: 0,
      lastY: 0,
      lastTime: 0,
      recentVelocity: 0,
      pointerId: 0,
      startedOnCloseButton: false,
    }
  }, [])

  const clearDragCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const deliverDragClose = useCallback(() => {
    if (dragCloseDeliveredRef.current) return
    dragCloseDeliveredRef.current = true
    clearDragCloseTimer()
    onClose()
  }, [clearDragCloseTimer, onClose])

  const requestClose = useCallback(() => {
    if (dragCloseInProgressRef.current) return

    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, requestClose])

  useEffect(() => {
    if (open) return
    clearDragCloseTimer()
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current)
      returnTimerRef.current = null
    }
    resetDrag()
    suppressCloseClickRef.current = false
    dragCloseInProgressRef.current = false
    dragCloseDeliveredRef.current = false
    setIsClosingByDrag(false)
    setIsDragging(false)
    setIsReturning(false)
    setDragY(0)
  }, [open, clearDragCloseTimer, resetDrag])

  useEffect(() => {
    return () => {
      clearDragCloseTimer()
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current)
    }
  }, [clearDragCloseTimer])

  if (!open) return null

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

    const now = Date.now()
    dragRef.current = {
      tracking: true,
      active: false,
      startY: event.clientY,
      startTime: now,
      lastY: event.clientY,
      lastTime: now,
      recentVelocity: 0,
      pointerId: event.pointerId,
      startedOnCloseButton:
        event.target instanceof Element &&
        Boolean(event.target.closest('[data-bottom-sheet-close="true"]')),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.tracking || drag.pointerId !== event.pointerId) return

    const distance = Math.max(0, event.clientY - drag.startY)
    if (!drag.active && distance <= DRAG_ACTIVATE_PX) return

    const now = Date.now()
    const segmentDistance = Math.max(0, event.clientY - drag.lastY)
    const segmentElapsed = Math.max(1, now - drag.lastTime)
    drag.recentVelocity = segmentDistance / segmentElapsed
    drag.lastY = event.clientY
    drag.lastTime = now

    drag.active = true
    setIsDragging(true)
    setDragY(distance)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.tracking || drag.pointerId !== event.pointerId) return

    const distance = Math.max(0, event.clientY - drag.startY)
    const releaseDistance = Math.max(0, event.clientY - drag.lastY)
    const releaseElapsed = Math.max(1, Date.now() - drag.lastTime)
    const velocity = Math.max(drag.recentVelocity, releaseDistance / releaseElapsed)
    const shouldClose =
      drag.active && (distance > CLOSE_DISTANCE_PX || velocity >= FLING_VELOCITY_PX_PER_MS)

    resetDrag()

    if (shouldClose) {
      suppressCloseClickRef.current = drag.startedOnCloseButton
      dragCloseInProgressRef.current = true
      dragCloseDeliveredRef.current = false
      setIsClosingByDrag(true)
      setDragY(Math.max(distance, CLOSE_DISTANCE_PX))
      closeTimerRef.current = setTimeout(deliverDragClose, CLOSE_ANIMATION_MS)
      return
    }

    if (drag.active) suppressCloseClickRef.current = drag.startedOnCloseButton

    setIsDragging(false)
    setIsReturning(drag.active)
    setDragY(0)
    if (drag.active) {
      returnTimerRef.current = setTimeout(() => setIsReturning(false), CLOSE_ANIMATION_MS)
    }
  }

  const cancelDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.tracking || drag.pointerId !== event.pointerId) return

    resetDrag()
    setIsDragging(false)
    setIsReturning(drag.active)
    setDragY(0)
    if (drag.active) {
      returnTimerRef.current = setTimeout(() => setIsReturning(false), CLOSE_ANIMATION_MS)
    }
  }

  const closeFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressCloseClickRef.current) {
      suppressCloseClickRef.current = false
      event.preventDefault()
      return
    }

    requestClose()
  }

  const panelStyle: CSSProperties = {}
  if (isClosingByDrag) {
    panelStyle.transform = 'translateY(100%)'
    panelStyle.transition = `transform ${CLOSE_ANIMATION_MS}ms ease-out`
  } else if (dragY > 0) {
    panelStyle.transform = `translateY(${dragY}px)`
    panelStyle.transition = isDragging ? 'none' : 'transform 180ms ease-out'
  } else if (isReturning) {
    panelStyle.transform = 'translateY(0px)'
    panelStyle.transition = 'transform 180ms ease-out'
  }

  const backdropStyle: CSSProperties = {}
  if (isClosingByDrag) {
    backdropStyle.opacity = 0
    backdropStyle.transition = `opacity ${CLOSE_ANIMATION_MS}ms ease-out`
  } else if (dragY > 0) {
    backdropStyle.opacity = Math.max(0.25, 1 - dragY / 320)
  }

  return (
    <div
      className={cx('fixed inset-0 z-50 flex flex-col items-center justify-end', wrapperClassName)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={requestClose}
        className={cx('absolute inset-0 bg-black/40 backdrop-blur-[1px]', backdropClassName)}
        style={backdropStyle}
      />
      <div
        className={cx(
          'relative w-full max-w-md bg-surface rounded-t-[22px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden',
          panelClassName,
        )}
        style={panelStyle}
      >
        <div
          className={cx('shrink-0 touch-none', handleClassName)}
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        >
          <div className="flex justify-center pt-2 pb-1.5">
            <div className="w-9 h-1 rounded-full bg-border-strong/55" />
          </div>
          <div className={cx('flex items-center gap-2.5 px-4 pt-1 pb-3', headerClassName)}>
            <div className="min-w-0 flex-1">{header}</div>
            <button
              type="button"
              data-bottom-sheet-close="true"
              onClick={closeFromButton}
              aria-label={closeLabel}
              className={cx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-alt',
                closeButtonClassName,
              )}
            >
              <X
                className={cx('h-3.5 w-3.5 text-ink-soft', closeIconClassName)}
                strokeWidth={closeIconStrokeWidth}
              />
            </button>
          </div>
        </div>
        <div className={contentClassName}>{children}</div>
        {error}
        {footer}
      </div>
    </div>
  )
}
