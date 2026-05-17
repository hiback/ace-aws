import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectCertClient } from '../src/app/(immersive)/select-cert/select-cert-client'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}))

const onboardingMocks = vi.hoisted(() => ({
  completeOnboardingStep: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('@/lib/onboarding-client', () => onboardingMocks)

beforeEach(() => {
  routerMocks.replace.mockClear()
  routerMocks.push.mockClear()
  routerMocks.back.mockClear()
  onboardingMocks.completeOnboardingStep.mockReset()
  onboardingMocks.completeOnboardingStep.mockResolvedValue(undefined)
  usePrefsStore.setState({ locale: 'en', currentCert: null })
})

afterEach(cleanup)

describe('SelectCertClient', () => {
  it('starts onboarding with no selected cert and a disabled CTA', () => {
    render(<SelectCertClient requestedMode="onboarding" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    expect(dva.getAttribute('aria-pressed')).toBe('false')
    expect(cta.disabled).toBe(true)
  })

  it('completes cert selection before auto-routing when onboarding already has a cert', async () => {
    usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })

    const { rerender } = render(<SelectCertClient requestedMode="onboarding" />)
    rerender(<SelectCertClient requestedMode="onboarding" />)

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
      expect(routerMocks.replace).toHaveBeenCalledWith('/')
    })
    expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledTimes(1)
    expect(onboardingMocks.completeOnboardingStep.mock.invocationCallOrder[0]).toBeLessThan(
      routerMocks.replace.mock.invocationCallOrder[0],
    )
  })

  it('does not auto-route when completing existing cert selection fails', async () => {
    onboardingMocks.completeOnboardingStep.mockRejectedValueOnce(new Error('failed'))
    usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })

    render(<SelectCertClient requestedMode="onboarding" />)

    expect(await screen.findByText('Could not save your selection. Try again.')).not.toBeNull()
    expect(routerMocks.replace).not.toHaveBeenCalledWith('/')
  })

  it('selects and confirms the ready cert', async () => {
    render(<SelectCertClient requestedMode="onboarding" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    fireEvent.click(dva)

    expect(dva.getAttribute('aria-pressed')).toBe('true')
    expect(cta.disabled).toBe(false)

    fireEvent.click(cta)

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
      expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
      expect(routerMocks.replace).toHaveBeenCalledWith('/')
    })
  })

  it('selects and confirms CLF', async () => {
    render(<SelectCertClient requestedMode="onboarding" />)

    const clf = screen.getByRole('button', { name: /Cloud Practitioner/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    fireEvent.click(clf)
    fireEvent.click(cta)

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
      expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
      expect(routerMocks.replace).toHaveBeenCalledWith('/')
    })
  })

  it('cancels the selected cert when clicked again', () => {
    render(<SelectCertClient requestedMode="onboarding" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    fireEvent.click(dva)
    fireEvent.click(dva)

    expect(dva.getAttribute('aria-pressed')).toBe('false')
    expect(cta.disabled).toBe(true)
  })

  it('uses browse copy when opened from the cert switcher', () => {
    usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })

    render(<SelectCertClient requestedMode="switch" />)

    expect(screen.getByText('All certifications')).not.toBeNull()
    expect(screen.getByText(/CLF-C02 and DVA-C02 banks are ready/)).not.toBeNull()
    expect(screen.getByText('Continue current certification')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Developer/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('keeps the current cert selected in switch mode when clicked', () => {
    usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })

    render(<SelectCertClient requestedMode="switch" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', {
      name: 'Continue current certification',
    }) as HTMLButtonElement

    fireEvent.click(dva)

    expect(dva.getAttribute('aria-pressed')).toBe('true')
    expect(cta.disabled).toBe(false)
  })

  it('switches from DVA to CLF in switch mode', async () => {
    usePrefsStore.setState({ locale: 'en', currentCert: 'DVA-C02' })

    render(<SelectCertClient requestedMode="switch" />)

    const clf = screen.getByRole('button', { name: /Cloud Practitioner/ })
    const cta = screen.getByRole('button', {
      name: 'Continue current certification',
    }) as HTMLButtonElement

    fireEvent.click(clf)
    fireEvent.click(cta)

    await waitFor(() => {
      expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
      expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
      expect(routerMocks.replace).toHaveBeenCalledWith('/')
    })
  })

  it('does not save or route when cert selection completion fails', async () => {
    onboardingMocks.completeOnboardingStep.mockRejectedValueOnce(new Error('failed'))

    render(<SelectCertClient requestedMode="onboarding" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    fireEvent.click(dva)
    fireEvent.click(cta)

    expect(await screen.findByText('Could not save your selection. Try again.')).not.toBeNull()
    expect(usePrefsStore.getState().currentCert).toBeNull()
    expect(routerMocks.replace).not.toHaveBeenCalledWith('/')
  })
})
