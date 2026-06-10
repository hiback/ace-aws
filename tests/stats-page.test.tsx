import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatsPage from '../src/app/(tabbed)/stats/page'
import type { SubmittedMockExamAttempt } from '../src/lib/mock-exam/submission'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const statsMocks = vi.hoisted(() => {
  const makeDailyRows = () => [
    { date: '2026-01-01', correctCount: 0, wrongCount: 0, answered: 0, isToday: false },
    { date: '2026-01-02', correctCount: 1, wrongCount: 0, answered: 1, isToday: false },
    { date: '2026-01-03', correctCount: 0, wrongCount: 2, answered: 2, isToday: false },
    { date: '2026-01-04', correctCount: 0, wrongCount: 0, answered: 0, isToday: false },
    { date: '2026-01-05', correctCount: 2, wrongCount: 1, answered: 3, isToday: false },
    { date: '2026-01-06', correctCount: 0, wrongCount: 0, answered: 0, isToday: false },
    { date: '2026-01-07', correctCount: 3, wrongCount: 1, answered: 4, isToday: true },
  ]

  return {
    makeDailyRows,
    dailyStats: {
      data: makeDailyRows(),
      isLoading: false,
    },
    streak: { data: 3, isLoading: false },
    weakAreas: {
      data: [{ topic: 'Development', answered: 2, correct: 1, wrong: 1, accuracy: 50 }],
      isLoading: false,
    },
  }
})

const mockExamMocks = vi.hoisted(() => ({
  history: [] as SubmittedMockExamAttempt[],
  isLoading: false,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('../src/hooks/use-progress-stats', () => ({
  useDailyQuestionStats: () => statsMocks.dailyStats,
  useProgressStats: () => ({ data: { answered: 9, correct: 6, total: 557 }, isLoading: false }),
  useStatsStreak: () => statsMocks.streak,
  useWeakAreaStats: () => statsMocks.weakAreas,
}))

vi.mock('../src/hooks/use-mock-exam', () => ({
  useMockExamHistory: () => ({ data: mockExamMocks.history, isLoading: mockExamMocks.isLoading }),
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  mockExamMocks.history = []
  mockExamMocks.isLoading = false
  statsMocks.dailyStats = { data: statsMocks.makeDailyRows(), isLoading: false }
  statsMocks.streak = { data: 3, isLoading: false }
  statsMocks.weakAreas = {
    data: [{ topic: 'Development', answered: 2, correct: 1, wrong: 1, accuracy: 50 }],
    isLoading: false,
  }
  usePrefsStore.setState({ locale: 'en', theme: 'system', currentCert: 'DVA-C02' })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StatsPage', () => {
  it('renders the dashboard header and three design stat cells', () => {
    render(<StatsPage />)

    expect(screen.getByText('Stats')).not.toBeNull()
    expect(screen.getByText('Streak')).not.toBeNull()
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getByText('Answered')).not.toBeNull()
    expect(screen.getByText('Accuracy')).not.toBeNull()
    expect(screen.queryByText('Correct total')).toBeNull()
  })

  it('renders recent seven days daily question stats in the design chart format', () => {
    usePrefsStore.setState({ locale: 'en', theme: 'dark', currentCert: 'DVA-C02' })

    render(<StatsPage />)

    expect(screen.getByText('Last 7 days')).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Last 7 days' })).not.toBeNull()
    expect(screen.getByText('Correct')).not.toBeNull()
    expect(screen.getByText('Wrong')).not.toBeNull()
    expect(screen.queryByText('Today')).toBeNull()
    expect(
      screen.getAllByText((_, node) => node?.textContent === '10 questions').length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByLabelText('Today, 2026-01-07: 4 answered, 3 correct, 1 wrong'),
    ).not.toBeNull()
    expect(screen.getByLabelText('2026-01-04: 0 answered, 0 correct, 0 wrong')).not.toBeNull()
    expect(screen.queryByText(/4 answered/)).toBeNull()
  })

  it('renders Chinese weekday labels for the recent seven days chart in zh locale', () => {
    usePrefsStore.setState({ locale: 'zh', currentCert: 'DVA-C02' })

    render(<StatsPage />)

    expect(screen.getByText('最近 7 天')).not.toBeNull()
    expect(screen.getAllByText('四').length).toBeGreaterThan(0)
    expect(screen.getAllByText('三').length).toBeGreaterThan(0)
  })

  it('explains an empty recent seven days chart in English', () => {
    statsMocks.dailyStats = {
      data: statsMocks.dailyStats.data.map((row) => ({
        ...row,
        correctCount: 0,
        wrongCount: 0,
        answered: 0,
      })),
      isLoading: false,
    }

    render(<StatsPage />)

    expect(screen.getByText('No practice attempts in the last 7 days.')).not.toBeNull()
    expect(screen.getByText('0 questions')).not.toBeNull()
  })

  it('explains an empty recent seven days chart in Chinese', () => {
    usePrefsStore.setState({ locale: 'zh', currentCert: 'DVA-C02' })
    statsMocks.dailyStats = {
      data: statsMocks.dailyStats.data.map((row) => ({
        ...row,
        correctCount: 0,
        wrongCount: 0,
        answered: 0,
      })),
      isLoading: false,
    }

    render(<StatsPage />)

    expect(screen.getByText('最近 7 天还没有普通练习答题记录。')).not.toBeNull()
    expect(screen.getByText('0 题')).not.toBeNull()
  })

  it('explains low recent seven days data in English', () => {
    statsMocks.dailyStats = {
      data: statsMocks.dailyStats.data.map((row, index) => ({
        ...row,
        correctCount: index === 6 ? 1 : 0,
        wrongCount: 0,
        answered: index === 6 ? 1 : 0,
      })),
      isLoading: false,
    }

    render(<StatsPage />)

    expect(
      screen.getByText('Recent 7-day data is still low; treat this as answer volume only.'),
    ).not.toBeNull()
  })

  it('explains low recent seven days data in Chinese', () => {
    usePrefsStore.setState({ locale: 'zh', currentCert: 'DVA-C02' })
    statsMocks.dailyStats = {
      data: statsMocks.dailyStats.data.map((row, index) => ({
        ...row,
        correctCount: index === 6 ? 1 : 0,
        wrongCount: 0,
        answered: index === 6 ? 1 : 0,
      })),
      isLoading: false,
    }

    render(<StatsPage />)

    expect(screen.getByText('最近 7 天数据还少，先把它当作答题量提示。')).not.toBeNull()
  })

  it('shows a guided mock exam empty state with a start entry when there are no attempts', () => {
    render(<StatsPage />)

    expect(screen.getByText('Mock exam scores')).not.toBeNull()
    expect(
      screen.getByText('No mock exams yet. Take a full simulation to gauge your readiness.'),
    ).not.toBeNull()
    const startLink = screen.getByRole('link', { name: /Start a mock exam/ })
    expect(startLink.getAttribute('href')).toBe('/mock-exam/dva-c02')
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull()
  })

  it('shows one submitted mock exam attempt as a single-score summary with history entry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    mockExamMocks.history = [
      makeSubmittedAttempt('single-attempt', 850, true, '2026-01-07T12:00:00Z'),
    ]

    render(<StatsPage />)

    expect(
      screen.getByRole('img', {
        name: 'Mock exam score gauge: 850, pass score 720, Passed',
      }),
    ).not.toBeNull()
    expect(screen.getByText('850')).not.toBeNull()
    expect(screen.getByText('Passed')).not.toBeNull()
    expect(screen.getByText('Pass 720')).not.toBeNull()
    expect(screen.getByText('First attempt · 3d ago')).not.toBeNull()
    expect(screen.getByRole('link', { name: /View all/ }).getAttribute('href')).toBe(
      '/mock-exam/dva-c02/history',
    )
    expect(screen.queryByText('Score trend')).toBeNull()
  })

  it('shows multiple submitted mock exam attempts as a score trend summary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    mockExamMocks.history = [
      makeSubmittedAttempt('latest-attempt', 850, true, '2026-01-07T12:00:00Z'),
      makeSubmittedAttempt('previous-attempt', 810, true, '2026-01-05T12:00:00Z'),
    ]

    render(<StatsPage />)

    expect(screen.getByText('850')).not.toBeNull()
    expect(screen.getByText('2 attempts · 3d ago')).not.toBeNull()
    expect(screen.getByTestId('mock-exam-score-trend')).not.toBeNull()
    expect(screen.queryByRole('img', { name: /Mock exam score gauge/ })).toBeNull()
    expect(screen.queryByText('+40 from previous attempt')).toBeNull()
    expect(screen.getByRole('link', { name: /View all/ }).getAttribute('href')).toBe(
      '/mock-exam/dva-c02/history',
    )
  })

  it('renders weak areas from current-certification question progress without fabricated domain totals', () => {
    render(<StatsPage />)

    expect(screen.getByText('Weak areas')).not.toBeNull()
    expect(screen.getByText('Development')).not.toBeNull()
    expect(screen.getByText((_, node) => node?.textContent === '1 wrong · 50%')).not.toBeNull()
    expect(screen.queryByText('Security')).toBeNull()
    expect(screen.queryByText('Deployment')).toBeNull()
    expect(screen.queryByText('Troubleshooting')).toBeNull()
    expect(screen.queryByText(/\/22/)).toBeNull()
  })

  it('renders a localized low-data weak areas state instead of fake weak areas', () => {
    usePrefsStore.setState({ locale: 'zh', currentCert: 'DVA-C02' })
    statsMocks.weakAreas = { data: [], isLoading: false }

    render(<StatsPage />)

    expect(screen.getByText('薄弱领域')).not.toBeNull()
    expect(screen.getByText('已答题数据不足，继续练习后会按真实错题显示薄弱领域。')).not.toBeNull()
  })
})

function makeSubmittedAttempt(
  id: string,
  score: number,
  passed: boolean,
  submittedAt: number | string = Date.now(),
): SubmittedMockExamAttempt {
  return {
    id,
    cert: 'DVA-C02',
    submittedAt: typeof submittedAt === 'number' ? submittedAt : new Date(submittedAt).getTime(),
    questions: [],
    summary: {
      score,
      passed,
      correctCount: 1,
      totalCount: 1,
      unansweredCount: 0,
      accuracy: 1,
      timeUsedSeconds: 60,
      autoSubmitted: false,
      domains: [],
    },
  }
}
