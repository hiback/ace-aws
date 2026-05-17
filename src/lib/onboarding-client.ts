import type { OnboardingAction } from '@/lib/onboarding'

export async function completeOnboardingStep(action: OnboardingAction) {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })

  if (!response.ok) {
    throw new Error('Failed to complete onboarding step')
  }
}

export async function resetOnboarding() {
  const response = await fetch('/api/onboarding', { method: 'DELETE' })

  if (!response.ok) {
    throw new Error('Failed to reset onboarding')
  }
}
