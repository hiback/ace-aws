import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountPreferencesProvider,
  useAccountPreferences,
} from '../src/components/providers/account-preferences-provider'
import { usePrefsStore } from '../src/stores/prefs-store'

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const clientMocks = vi.hoisted(() => ({
  fetchAccountPreferences: vi.fn(),
  saveAccountCurrentCert: vi.fn(),
}))

const onboardingMocks = vi.hoisted(() => ({
  completeOnboardingStep: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/lib/account-preferences-client', () => ({
  fetchAccountPreferences: clientMocks.fetchAccountPreferences,
  saveAccountCurrentCert: clientMocks.saveAccountCurrentCert,
}))

vi.mock('@/lib/onboarding-client', () => ({
  completeOnboardingStep: onboardingMocks.completeOnboardingStep,
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return <AccountPreferencesProvider>{children}</AccountPreferencesProvider>
}

function authenticate(userId: string) {
  authMocks.status = 'authenticated'
  authMocks.session = { user: { id: userId }, expires: '2099-01-01T00:00:00.000Z' }
}

beforeEach(() => {
  localStorage.clear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  clientMocks.fetchAccountPreferences.mockReset()
  clientMocks.saveAccountCurrentCert.mockReset()
  onboardingMocks.completeOnboardingStep.mockReset()
  onboardingMocks.completeOnboardingStep.mockResolvedValue(undefined)
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: null })
})

afterEach(cleanup)

describe('AccountPreferencesProvider', () => {
  it('uses cloud currentCert when present', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    clientMocks.fetchAccountPreferences.mockResolvedValueOnce({ currentCert: 'CLF-C02' })

    const { result } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.resolvedCert).toBe('CLF-C02')
    expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
    expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
    expect(clientMocks.saveAccountCurrentCert).not.toHaveBeenCalled()
  })

  it('uploads valid local currentCert when cloud is empty', async () => {
    authenticate('user-1')
    usePrefsStore.setState({ currentCert: 'DVA-C02' })
    clientMocks.fetchAccountPreferences.mockResolvedValueOnce({ currentCert: null })
    clientMocks.saveAccountCurrentCert.mockResolvedValueOnce({ currentCert: 'DVA-C02' })

    const { result } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.resolvedCert).toBe('DVA-C02')
    expect(clientMocks.saveAccountCurrentCert).toHaveBeenCalledWith('DVA-C02')
    expect(onboardingMocks.completeOnboardingStep).toHaveBeenCalledWith('complete-cert-selection')
  })

  it('leaves cert unselected when cloud and local are empty', async () => {
    authenticate('user-1')
    clientMocks.fetchAccountPreferences.mockResolvedValueOnce({ currentCert: null })

    const { result } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.resolvedCert).toBeNull()
    expect(usePrefsStore.getState().currentCert).toBeNull()
    expect(clientMocks.saveAccountCurrentCert).not.toHaveBeenCalled()
    expect(onboardingMocks.completeOnboardingStep).not.toHaveBeenCalled()
  })

  it('does not resolve the same user twice', async () => {
    authenticate('user-1')
    clientMocks.fetchAccountPreferences.mockResolvedValue({ currentCert: null })

    const { result, rerender } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    rerender()

    expect(clientMocks.fetchAccountPreferences).toHaveBeenCalledTimes(1)
  })

  it('resolves again when userId changes', async () => {
    authenticate('user-1')
    clientMocks.fetchAccountPreferences
      .mockResolvedValueOnce({ currentCert: null })
      .mockResolvedValueOnce({ currentCert: 'CLF-C02' })

    const { result, rerender } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    authenticate('user-2')
    rerender()

    await waitFor(() => expect(result.current.resolvedCert).toBe('CLF-C02'))
    expect(clientMocks.fetchAccountPreferences).toHaveBeenCalledTimes(2)
  })

  it('exposes an error when resolution fails', async () => {
    authenticate('user-1')
    clientMocks.fetchAccountPreferences.mockRejectedValueOnce(new Error('network'))

    const { result } = renderHook(() => useAccountPreferences(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.message).toBe('network')
  })
})
