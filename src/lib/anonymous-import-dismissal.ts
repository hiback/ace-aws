export const ANONYMOUS_IMPORT_DISMISSAL_KEY = 'ace-aws/anonymous-import-dismissal/v1'

function readAnonymousImportDismissals(): Record<string, true> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(ANONYMOUS_IMPORT_DISMISSAL_KEY)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value).filter(([, dismissed]) => dismissed === true),
    ) as Record<string, true>
  } catch {
    return {}
  }
}

export function hasDismissedAnonymousImport(userId: string): boolean {
  return readAnonymousImportDismissals()[userId] === true
}

export function dismissAnonymousImport(userId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    ANONYMOUS_IMPORT_DISMISSAL_KEY,
    JSON.stringify({ ...readAnonymousImportDismissals(), [userId]: true }),
  )
}

export function clearAnonymousImportDismissal(userId: string): void {
  if (typeof window === 'undefined') return
  const dismissals = readAnonymousImportDismissals()
  delete dismissals[userId]
  window.localStorage.setItem(ANONYMOUS_IMPORT_DISMISSAL_KEY, JSON.stringify(dismissals))
}
