'use client'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  source: string
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-section font-extrabold text-ink tracking-tight mt-1 mb-2.5 pb-1.5">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-card font-bold text-ink tracking-tight mt-4 mb-2 pb-1.5 border-b border-border">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[14.5px] font-bold text-ink tracking-tight mt-3 mb-1.5">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-option font-semibold text-ink mt-2.5 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-option text-ink-soft leading-[1.65] mb-2.5">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-[22px] mb-3 flex flex-col gap-1 text-option text-ink-soft leading-[1.6]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-[22px] mb-3 flex flex-col gap-1 text-option text-ink-soft leading-[1.6]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  strong: ({ children }) => <strong className="text-ink font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-accent bg-accent-softer text-ink-soft italic px-3 py-2 rounded-r-lg mb-3 [&>p]:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline decoration-accent-soft underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      // handled by `pre`
      return <code className={className}>{children}</code>
    }
    return (
      <code className="font-mono text-[0.88em] bg-bg-alt text-accent-deep border border-border rounded px-1.5 py-px">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="font-mono text-[11.5px] bg-bg-alt border border-border rounded-lg p-3 mb-3 overflow-auto leading-[1.55] text-ink whitespace-pre">
      {children}
    </pre>
  ),
}

export default function ExplanationMarkdown({ source }: Props) {
  return (
    <div className="text-option text-ink-soft leading-[1.65]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
