'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/primitives/button'
import { EmptyState } from '@/components/primitives/empty-state'
import { useT } from '@/hooks/use-t'
import { normalizePracticeSource } from '@/lib/practice-flow'

const COMPLETION_COPY = {
  '/': {
    title: 'practiceCompleteTitle',
    description: 'practiceCompleteDescription',
    primaryLabel: 'backToHome',
    primaryHref: '/',
    secondaryLabel: null,
    secondaryHref: null,
  },
  '/list/wrong': {
    title: 'wrongReviewCompleteTitle',
    description: 'wrongReviewCompleteDescription',
    primaryLabel: 'backToWrongList',
    primaryHref: '/list/wrong',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
  '/list/bookmarks': {
    title: 'bookmarksReviewCompleteTitle',
    description: 'bookmarksReviewCompleteDescription',
    primaryLabel: 'backToBookmarks',
    primaryHref: '/list/bookmarks',
    secondaryLabel: 'backToHome',
    secondaryHref: '/',
  },
} as const

export default function PracticeCompletePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()
  const source = normalizePracticeSource(searchParams.get('from'))
  const copy = COMPLETION_COPY[source]

  return (
    <main className="flex-1">
      <EmptyState
        icon={CheckCircle2}
        title={t(copy.title)}
        description={t(copy.description)}
        className="min-h-dvh"
        action={
          <div className="flex w-full min-w-56 flex-col gap-2">
            <Button onClick={() => router.push(copy.primaryHref)} fullWidth>
              {t(copy.primaryLabel)}
            </Button>
            {copy.secondaryHref && copy.secondaryLabel ? (
              <Button variant="outline" onClick={() => router.push(copy.secondaryHref)} fullWidth>
                {t(copy.secondaryLabel)}
              </Button>
            ) : null}
          </div>
        }
      />
    </main>
  )
}
