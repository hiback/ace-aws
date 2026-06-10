type MockExamScoreChartProps = {
  scores: number[]
  passScore: number
  label: string
  gaugeLabel: string
  passLineLabel: string
  passLineDeltaLabel: string
  passLineDeltaUnit: string
}

export function MockExamScoreChart({
  scores,
  passScore,
  label,
  gaugeLabel,
  passLineLabel,
  passLineDeltaLabel,
  passLineDeltaUnit,
}: MockExamScoreChartProps) {
  if (scores.length === 1) {
    return (
      <ScoreGauge
        score={scores[0]}
        passScore={passScore}
        label={gaugeLabel}
        passLineLabel={passLineLabel}
        passLineDeltaLabel={passLineDeltaLabel}
        passLineDeltaUnit={passLineDeltaUnit}
      />
    )
  }

  return <ScoreTrend scores={scores} passScore={passScore} label={label} />
}

function ScoreGauge({
  score,
  passScore,
  label,
  passLineLabel,
  passLineDeltaLabel,
  passLineDeltaUnit,
}: {
  score: number
  passScore: number
  label: string
  passLineLabel: string
  passLineDeltaLabel: string
  passLineDeltaUnit: string
}) {
  const scorePercent = clampPercent(score / 1000)
  const passPercent = clampPercent(passScore / 1000)
  const passed = score >= passScore

  return (
    <div role="img" aria-label={label}>
      <div className="relative h-2.5 rounded-[5px] bg-bg-alt">
        <div
          className={['h-full rounded-[5px]', passed ? 'bg-success' : 'bg-danger'].join(' ')}
          style={{ width: `${scorePercent}%` }}
        />
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-px bg-ink-soft"
          style={{ left: `${passPercent}%` }}
        />
      </div>
      <div className="relative mt-[5px] h-[13px] font-mono text-[9.5px] text-ink-mute">
        <span className="absolute left-0">0</span>
        <span
          className="absolute -translate-x-1/2 text-ink-soft"
          style={{ left: `${passPercent}%` }}
        >
          {passLineLabel} {passScore}
        </span>
        <span className="absolute right-0">1000</span>
      </div>
      <p className="mt-[9px] text-[11.5px] text-ink-mute">
        {passLineDeltaLabel}{' '}
        <strong className={passed ? 'text-success-deep' : 'text-danger-deep'}>
          {score - passScore >= 0 ? '+' : ''}
          {score - passScore} {passLineDeltaUnit}
        </strong>
      </p>
    </div>
  )
}

function ScoreTrend({
  scores,
  passScore,
  label,
}: {
  scores: number[]
  passScore: number
  label: string
}) {
  const width = 260
  const height = 48
  const pad = 5
  const min = Math.min(...scores, passScore) - 30
  const max = Math.max(...scores, passScore) + 30
  const range = Math.max(max - min, 1)
  const xStep = scores.length > 1 ? (width - 2 * pad) / (scores.length - 1) : 0
  const points = scores.map((score, index) => ({
    x: scores.length > 1 ? pad + index * xStep : width / 2,
    y: height - pad - ((score - min) / range) * (height - 2 * pad),
    score,
  }))
  const passY = height - pad - ((passScore - min) / range) * (height - 2 * pad)
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
  return (
    <svg
      data-testid="mock-exam-score-trend"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={label}
      className="block"
    >
      <line
        x1={pad}
        y1={passY}
        x2={width - pad}
        y2={passY}
        className="stroke-success"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <text
        x={width - pad}
        y={passY - 3}
        textAnchor="end"
        className="fill-success font-mono font-bold"
        fontSize="9"
      >
        {passScore}
      </text>
      {path ? (
        <path
          d={path}
          fill="none"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${point.score}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 3.5 : 2.2}
          className={point.score >= passScore ? 'fill-success' : 'fill-danger'}
          stroke="var(--color-surface)"
          strokeWidth={index === points.length - 1 ? 1.8 : 1}
        />
      ))}
    </svg>
  )
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value * 100))
}
