export const ONBOARDING_AUTH_GATE_COOKIE = 'ace-aws-auth-gate'
export const ONBOARDING_AUTH_GATE_VALUE = 'completed'
export const ONBOARDING_CERT_SELECTED_COOKIE = 'ace-aws-cert-selected'
export const ONBOARDING_CERT_SELECTED_VALUE = 'true'
export const ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type OnboardingAction = 'complete-auth-gate' | 'complete-cert-selection'

export function isOnboardingAction(value: unknown): value is OnboardingAction {
  return value === 'complete-auth-gate' || value === 'complete-cert-selection'
}
