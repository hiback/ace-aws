import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BookmarksPage from '../src/app/(tabbed)/list/bookmarks/page'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const bookmarkMocks = vi.hoisted(() => ({
  qids: [] as number[],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('../src/hooks/use-answer', () => ({
  useQuestionProgress: () => ({ data: null, isLoading: false }),
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useBookmarksList: () => ({
    data: bookmarkMocks.qids,
    isLoading: false,
  }),
}))

vi.mock('../src/hooks/use-question-bank', () => ({
  useQuestionBank: () => ({
    data: [
      { id: 1, topic: 'Development', zh: { question: '题目 1' }, en: { question: 'Q1' } },
      { id: 2, topic: 'Security', zh: { question: '题目 2' }, en: { question: 'Q2' } },
    ],
    isLoading: false,
  }),
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  bookmarkMocks.qids = []
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('BookmarksPage', () => {
  it('omits missing-bank bookmarks from rows and snapshots', () => {
    bookmarkMocks.qids = [1, 99, 2]

    render(<BookmarksPage />)

    expect(screen.queryByText('Q99')).toBeNull()
    expect(screen.getByText('Q1').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/1?from=%2Flist%2Fbookmarks&set=1%2C2',
    )
    expect(screen.getByText('Q2').closest('a')?.getAttribute('href')).toBe(
      '/practice/dva-c02/2?from=%2Flist%2Fbookmarks&set=1%2C2',
    )
  })

  it('shows the empty state when every bookmark is missing from the bank', () => {
    bookmarkMocks.qids = [99]

    render(<BookmarksPage />)

    expect(screen.getByText('No bookmarks yet. Mark questions while practicing.')).not.toBeNull()
    expect(document.querySelector('ul')).toBeNull()
  })
})
