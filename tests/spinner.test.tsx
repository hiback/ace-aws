import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Spinner } from '../src/components/primitives/spinner'
import { usePrefsStore } from '../src/stores/prefs-store'

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' })
})

afterEach(cleanup)

describe('Spinner', () => {
  it('uses the translated loading label by default', () => {
    render(<Spinner />)

    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
  })

  it('does not fall back to a hardcoded English label', () => {
    usePrefsStore.setState({ locale: 'zh' })

    render(<Spinner />)

    expect(screen.getByRole('status', { name: '加载中' })).not.toBeNull()
  })
})
