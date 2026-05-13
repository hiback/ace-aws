import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OptionRowResult } from '../src/components/domain/option-row-result'
import { Prose } from '../src/components/primitives/prose'
import bank from '../src/data/dva-c02.json'
import type { Letter } from '../src/data/types'

type RawQ = (typeof bank)[number]

function findById(id: number): RawQ {
  const q = (bank as RawQ[]).find((x) => x.id === id)
  if (!q) throw new Error(`fixture question id=${id} not found`)
  return q
}

afterEach(cleanup)

describe('question content rendering against real data', () => {
  it('renders a plain-prose stem (id=1) without dropping any text', () => {
    const q = findById(1)
    const { container } = render(<Prose variant="stem" source={q.en.question} />)
    // Strip whitespace differences before comparing.
    const got = container.textContent?.replace(/\s+/g, ' ').trim()
    const want = q.en.question.replace(/\s+/g, ' ').trim()
    expect(got).toBe(want)
  })

  it('renders a JSON-bearing option (id=75 letter A) as a <pre> block with the JSON preserved', () => {
    const q = findById(75)
    const text = (q.en.options as Record<string, string>).A
    expect(text.trim().startsWith('```json')).toBe(true)
    const { container } = render(
      <OptionRowResult letter={'A' as Letter} text={text} state="idle" showVoteBar={false} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('"source"')
    expect(pre?.textContent).toContain('aws.codecommit')
  })
})
