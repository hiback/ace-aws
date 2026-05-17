import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginClient } from '../src/app/(auth)/login/login-client'
import { usePrefsStore } from '../src/stores/prefs-store'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
  signIn: vi.fn(),
}))

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

const onboardingMocks = vi.hoisted(() => ({
  completeOnboardingStep: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
  signIn: authMocks.signIn,
}))

vi.mock('@/lib/onboarding-client', () => ({
  completeOnboardingStep: onboardingMocks.completeOnboardingStep,
}))

beforeEach(() => {
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  authMocks.signIn.mockClear()
  routerMocks.replace.mockClear()
  onboardingMocks.completeOnboardingStep.mockReset()
  onboardingMocks.completeOnboardingStep.mockResolvedValue(undefined)
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: null })
})

afterEach(cleanup)

describe('LoginClient', () => {
  it('renders the login entry actions', () => {
    render(<LoginClient hasAuthError={false} />)

    expect(screen.getByAltText('ace-aws')).not.toBeNull()
    expect(screen.getByText('ace-aws')).not.toBeNull()
    expect(screen.getByText('AWS certification practice')).not.toBeNull()
    expect(screen.getByText('Welcome back')).not.toBeNull()
    expect(screen.getByText('Sync progress across all devices after signing in')).not.toBeNull()
    expect(screen.getByLabelText('Switch language')).not.toBeNull()
    expect(screen.getByText('Sign in with GitHub')).not.toBeNull()
    expect(screen.getByText('or')).not.toBeNull()
    expect(screen.getByText('Continue as guest')).not.toBeNull()
    expect(screen.getByText('Guest mode: progress is stored on this device only')).not.toBeNull()
  })

  it('starts GitHub sign-in with the login callback URL', () => {
    render(<LoginClient hasAuthError={false} />)

    fireEvent.click(screen.getByText('Sign in with GitHub'))

    expect(authMocks.signIn).toHaveBeenCalledWith('github', { callbackUrl: '/login' })
  })

  it('continues as guest after completing the auth gate', async () => {
    render(<LoginClient hasAuthError={false} />)

    fireEvent.click(screen.getByText('Continue as guest'))

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-auth-gate')
    })
    expect(routerMocks.replace).toHaveBeenCalledWith('/select-cert')
  })

  it('automatically completes the auth gate when already authenticated', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = {
      user: { id: 'user-1', name: 'Alice', email: 'alice@example.com', image: null },
      expires: '2099-01-01T00:00:00.000Z',
    }

    render(<LoginClient hasAuthError={false} />)

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-auth-gate')
    })
    expect(routerMocks.replace).toHaveBeenCalledWith('/select-cert')
  })

  it('renders the OAuth error message', () => {
    render(<LoginClient hasAuthError={true} />)

    expect(
      screen.getByText('GitHub sign-in was not completed. Try again or continue as guest.'),
    ).not.toBeNull()
  })

  it('toggles the login language', () => {
    render(<LoginClient hasAuthError={false} />)

    fireEvent.click(screen.getByLabelText('Switch language'))

    expect(usePrefsStore.getState().locale).toBe('zh')
    expect(screen.getByText('欢迎回来')).not.toBeNull()
  })

  it('shows a save error and stays on login when guest onboarding fails', async () => {
    onboardingMocks.completeOnboardingStep.mockRejectedValueOnce(new Error('failed'))
    render(<LoginClient hasAuthError={false} />)

    fireEvent.click(screen.getByText('Continue as guest'))

    expect(await screen.findByText('Could not save this choice. Please try again.')).not.toBeNull()
    expect(routerMocks.replace).not.toHaveBeenCalled()
  })
})
