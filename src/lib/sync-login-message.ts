const SYNC_LOGIN_MESSAGE_KEY = 'ace-aws/sync-login-message/v1'

export function storeSyncExpiredLoginMessage(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SYNC_LOGIN_MESSAGE_KEY, 'expired')
}

export function consumeSyncExpiredLoginMessage(): boolean {
  if (typeof window === 'undefined') return false
  const hasMessage = window.sessionStorage.getItem(SYNC_LOGIN_MESSAGE_KEY) === 'expired'
  window.sessionStorage.removeItem(SYNC_LOGIN_MESSAGE_KEY)
  return hasMessage
}
