'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  source: string
}

export default function ExplanationMarkdown({ source }: Props) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-bold prose-h2:text-card prose-p:text-body prose-p:text-ink-soft prose-p:leading-[1.65] prose-strong:text-ink prose-code:text-accent-deep prose-code:bg-accent-softer prose-code:px-1 prose-code:rounded">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
