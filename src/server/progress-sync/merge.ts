import type { SyncRecord } from './contract'

export type CanonicalQuestionProgress = SyncRecord

function timestamp(value: string | null) {
  return value === null ? null : Date.parse(value)
}

export function mergeQuestionProgress(
  server: CanonicalQuestionProgress | null,
  upload: SyncRecord,
): CanonicalQuestionProgress {
  if (!server) return upload

  const merged: CanonicalQuestionProgress = {
    ...server,
    correctCount: Math.max(server.correctCount, upload.correctCount),
    wrongCount: Math.max(server.wrongCount, upload.wrongCount),
  }

  const serverAnsweredAt = timestamp(server.lastAnsweredAt)
  const uploadAnsweredAt = timestamp(upload.lastAnsweredAt)
  if (
    uploadAnsweredAt !== null &&
    (serverAnsweredAt === null || uploadAnsweredAt > serverAnsweredAt)
  ) {
    merged.lastPicks = upload.lastPicks
    merged.lastCorrect = upload.lastCorrect
    merged.lastAnsweredAt = upload.lastAnsweredAt
  }

  const serverBookmarkUpdatedAt = timestamp(server.bookmarkUpdatedAt)
  const uploadBookmarkUpdatedAt = timestamp(upload.bookmarkUpdatedAt)
  if (
    uploadBookmarkUpdatedAt !== null &&
    (serverBookmarkUpdatedAt === null || uploadBookmarkUpdatedAt > serverBookmarkUpdatedAt)
  ) {
    merged.bookmarked = upload.bookmarked
    merged.bookmarkUpdatedAt = upload.bookmarkUpdatedAt
  }

  return merged
}
