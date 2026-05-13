import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Prose } from '../src/components/primitives/prose'

describe('Prose', () => {
  it('renders plain prose without markdown syntax as a paragraph', () => {
    render(<Prose variant="stem" source="Hello world." />)
    const p = screen.getByText('Hello world.')
    expect(p.tagName).toBe('P')
  })

  it('preserves single newlines as <br> (remark-breaks)', () => {
    const { container } = render(<Prose variant="stem" source={'line one\nline two'} />)
    expect(container.querySelector('br')).not.toBeNull()
    expect(container.textContent).toContain('line one')
    expect(container.textContent).toContain('line two')
  })

  it('renders fenced ```json``` block as <pre><code>', () => {
    const src = '```json\n{ "foo": 1 }\n```'
    const { container } = render(<Prose variant="option" source={src} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    const code = pre?.querySelector('code')
    expect(code?.className).toMatch(/language-json/)
    expect(code?.textContent).toBe('{ "foo": 1 }\n')
  })

  it('renders inline `code` as a <code> element', () => {
    const { container } = render(<Prose variant="stem" source={'Use `aws s3 cp` to copy.'} />)
    const code = container.querySelector('code')
    expect(code?.textContent).toBe('aws s3 cp')
  })

  it('stem variant uses text-body class on paragraphs', () => {
    const { container } = render(<Prose variant="stem" source="X" />)
    expect(container.querySelector('p')?.className).toMatch(/text-body/)
  })

  it('option variant uses text-option class on paragraphs', () => {
    const { container } = render(<Prose variant="option" source="X" />)
    expect(container.querySelector('p')?.className).toMatch(/text-option/)
  })

  it('explanation variant renders headings with their distinct classes', () => {
    const { container } = render(<Prose variant="explanation" source="## Heading" />)
    const h2 = container.querySelector('h2')
    expect(h2).not.toBeNull()
    expect(h2?.className).toMatch(/border-b/)
  })
})
