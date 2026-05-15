import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectCertClient } from '../src/app/(immersive)/select-cert/select-cert-client'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

beforeEach(() => {
  routerMocks.replace.mockClear()
  routerMocks.push.mockClear()
  routerMocks.back.mockClear()
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

  it('selects and confirms the ready cert', () => {
    render(<SelectCertClient requestedMode="onboarding" />)

    const dva = screen.getByRole('button', { name: /Developer/ })
    const cta = screen.getByRole('button', { name: 'Start practicing' }) as HTMLButtonElement

    fireEvent.click(dva)

    expect(dva.getAttribute('aria-pressed')).toBe('true')
    expect(cta.disabled).toBe(false)

    fireEvent.click(cta)

    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
    expect(routerMocks.replace).toHaveBeenCalledWith('/')
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
    expect(screen.getByText(/DVA-C02 is the only ready bank/)).not.toBeNull()
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
})
