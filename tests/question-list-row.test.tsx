import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuestionListRow } from '../src/components/domain/question-list-row'
import { usePrefsStore } from '../src/stores/prefs-store'

const baseProps = {
  cert: 'DVA-C02' as const,
  qid: 7,
  topic: 'Development',
  questionPreview: 'Which service should you use?',
  from: '/list/wrong' as const,
}

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('QuestionListRow', () => {
  it('renders the wrong-count badge for wrong rows with a positive wrong count', () => {
    render(<QuestionListRow {...baseProps} status="wrong" wrongCount={3} />)

    expect(screen.getByText('Wrong 3x')).not.toBeNull()
  })

  it('does not render the wrong-count badge for correct rows', () => {
    render(<QuestionListRow {...baseProps} status="correct" wrongCount={3} />)

    expect(screen.queryByText('Wrong 3x')).toBeNull()
  })

  it('does not render the wrong-count badge for unanswered rows', () => {
    render(<QuestionListRow {...baseProps} status="unanswered" wrongCount={3} />)

    expect(screen.queryByText('Wrong 3x')).toBeNull()
  })

  it('encodes the list review source and snapshot in the href', () => {
    render(<QuestionListRow {...baseProps} set={[7, 9, 11]} />)

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/practice/dva-c02/7?from=%2Flist%2Fwrong&set=7%2C9%2C11',
    )
  })
})
