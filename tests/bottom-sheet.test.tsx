import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../src/components/primitives/bottom-sheet'

function sheetElement(open: boolean, onClose: () => void) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      closeLabel="Close"
      ariaLabelledby="sheet-title"
      header={<h2 id="sheet-title">Sheet title</h2>}
    >
      <button type="button">Body action</button>
    </BottomSheet>
  )
}

function renderSheet(onClose = vi.fn()) {
  render(sheetElement(true, onClose))

  return { onClose }
}

function dragFrom(element: HTMLElement, distance: number, durationMs = 120, pointerType = 'touch') {
  fireEvent.pointerDown(element, {
    pointerId: 1,
    pointerType,
    clientY: 100,
  })
  vi.advanceTimersByTime(durationMs)
  fireEvent.pointerMove(element, {
    pointerId: 1,
    pointerType,
    clientY: 100 + distance,
  })
  fireEvent.pointerUp(element, {
    pointerId: 1,
    pointerType,
    clientY: 100 + distance,
  })
}

function touchDragFrom(element: HTMLElement, distance: number, durationMs = 120) {
  dragFrom(element, distance, durationMs, 'touch')
}

function renderSheetWithOpen(open: boolean, onClose = vi.fn()) {
  return render(sheetElement(open, onClose))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BottomSheet', () => {
  it('touch drag from the header closes after the slide-out delay', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 120)

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(179)
    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the delayed drag-close when Escape fires during drag-close animation', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 120)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(179)
    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the delayed drag-close when backdrop fires during drag-close animation', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 120)
    fireEvent.click(screen.getAllByLabelText('Close')[0])

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the delayed drag-close when close button fires during drag-close animation', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 120)
    fireEvent.click(screen.getAllByLabelText('Close')[1])

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears a pending drag-close timer when the sheet closes externally', () => {
    const onClose = vi.fn()
    const { rerender } = renderSheetWithOpen(true, onClose)

    touchDragFrom(screen.getByText('Sheet title'), 120)
    rerender(sheetElement(false, onClose))
    vi.advanceTimersByTime(180)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('reopens at rest after a completed drag-close path', () => {
    const onClose = vi.fn()
    const { rerender } = renderSheetWithOpen(true, onClose)

    touchDragFrom(screen.getByText('Sheet title'), 120)
    vi.advanceTimersByTime(180)
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(sheetElement(false, onClose))
    rerender(sheetElement(true, onClose))

    const dialog = screen.getByRole('dialog')
    const panel = dialog.lastElementChild as HTMLElement
    expect(panel.style.transform).toBe('')
    expect(panel.style.transition).toBe('')
  })

  it('quick downward release closes after a brief hold', () => {
    const { onClose } = renderSheet()
    const header = screen.getByText('Sheet title')

    fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'touch', clientY: 100 })
    vi.advanceTimersByTime(600)
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'touch', clientY: 120 })
    vi.advanceTimersByTime(20)
    fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'touch', clientY: 180 })

    vi.advanceTimersByTime(180)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pen drag from the header closes after the slide-out delay', () => {
    const { onClose } = renderSheet()

    dragFrom(screen.getByText('Sheet title'), 120, 120, 'pen')

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fast downward touch fling closes below the distance threshold', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 50, 40)
    vi.advanceTimersByTime(180)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('drag below the close threshold returns to rest', () => {
    const { onClose } = renderSheet()
    const dialog = screen.getByRole('dialog')
    const panel = dialog.lastElementChild as HTMLElement

    touchDragFrom(screen.getByText('Sheet title'), 40)

    expect(panel.style.transition).toContain('transform')

    vi.advanceTimersByTime(180)

    expect(onClose).not.toHaveBeenCalled()
    expect(['', 'translateY(0px)']).toContain(panel.style.transform)
  })

  it('close button still closes after a below-threshold drag from the header text', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Sheet title'), 40)
    fireEvent.click(screen.getAllByLabelText('Close')[1])

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mouse drag does not close', () => {
    const { onClose } = renderSheet()
    const header = screen.getByText('Sheet title')

    fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'mouse', clientY: 100 })
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'mouse', clientY: 260 })
    fireEvent.pointerUp(header, { pointerId: 1, pointerType: 'mouse', clientY: 260 })
    vi.advanceTimersByTime(180)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('drag from the content body does not close', () => {
    const { onClose } = renderSheet()

    touchDragFrom(screen.getByText('Body action'), 140)
    vi.advanceTimersByTime(180)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('pointer cancel aborts an active drag without closing', () => {
    const { onClose } = renderSheet()
    const header = screen.getByText('Sheet title')

    fireEvent.pointerDown(header, { pointerId: 1, pointerType: 'touch', clientY: 100 })
    vi.advanceTimersByTime(120)
    fireEvent.pointerMove(header, { pointerId: 1, pointerType: 'touch', clientY: 220 })
    fireEvent.pointerCancel(header, { pointerId: 1, pointerType: 'touch', clientY: 220 })
    vi.advanceTimersByTime(180)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('touch drag can start on the built-in close button', () => {
    const { onClose } = renderSheet()
    const closeButton = screen.getAllByLabelText('Close')[1]

    touchDragFrom(closeButton, 120)
    fireEvent.click(closeButton)

    expect(onClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the close button closes immediately', () => {
    const { onClose } = renderSheet()

    fireEvent.click(screen.getAllByLabelText('Close')[1])

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop closes immediately', () => {
    const { onClose } = renderSheet()

    fireEvent.click(screen.getAllByLabelText('Close')[0])

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape closes immediately', () => {
    const { onClose } = renderSheet()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
