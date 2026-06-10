import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MockExamScoreChart } from '../src/components/mock-exam/score-chart'

describe('MockExamScoreChart', () => {
  it('renders compact trend charts without generated gradient ids', () => {
    render(
      <>
        <MockExamScoreChart
          scores={[810, 850]}
          passScore={720}
          label="Score trend A"
          gaugeLabel="Score gauge A"
          passLineLabel="Pass"
          passLineDeltaLabel="vs. pass line"
          passLineDeltaUnit="pts"
        />
        <MockExamScoreChart
          scores={[650, 760]}
          passScore={720}
          label="Score trend B"
          gaugeLabel="Score gauge B"
          passLineLabel="Pass"
          passLineDeltaLabel="vs. pass line"
          passLineDeltaUnit="pts"
        />
      </>,
    )

    const charts = screen.getAllByTestId('mock-exam-score-trend')

    expect(charts).toHaveLength(2)
    for (const chart of charts) {
      expect(chart.getAttribute('height')).toBe('48')
      expect(chart.querySelector('linearGradient')).toBeNull()
      expect(chart.querySelector('path[fill^="url("]')).toBeNull()
      expect(chart.querySelector('line[stroke-dasharray="3 3"]')).not.toBeNull()
    }
  })
})
