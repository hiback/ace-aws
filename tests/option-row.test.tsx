import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OptionRow } from '../src/components/domain/option-row'

afterEach(cleanup)

describe('OptionRow', () => {
  it('fires onClick when activated by mouse', () => {
    const onClick = vi.fn()
    render(<OptionRow letter="A" text="hello" selected={false} multi={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /A/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fires onClick when activated by Enter or Space', () => {
    const onClick = vi.fn()
    render(<OptionRow letter="A" text="hello" selected={false} multi={false} onClick={onClick} />)
    const el = screen.getByRole('button', { name: /A/ })
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <OptionRow
        letter="A"
        text="hello"
        selected={false}
        multi={false}
        onClick={onClick}
        disabled
      />,
    )
    const el = screen.getByRole('button', { name: /A/ })
    fireEvent.click(el)
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders fenced JSON block inside the option as <pre>', () => {
    const src = '```json\n{ "foo": 1 }\n```'
    const { container } = render(
      <OptionRow letter="A" text={src} selected={false} multi={false} onClick={() => {}} />,
    )
    expect(container.querySelector('pre')).not.toBeNull()
  })
})
