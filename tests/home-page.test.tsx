import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../src/app/(tabbed)/page'
import { usePrefsStore } from '../src/stores/prefs-store'

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  session: null as unknown,
}))

const accountPreferenceMocks = vi.hoisted(() => ({
  saveCurrentCert: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: authMocks.session, status: authMocks.status }),
}))

vi.mock('@/components/providers/account-preferences-provider', () => ({
  useAccountPreferences: () => accountPreferenceMocks,
}))

vi.mock('@/hooks/use-answer', () => ({
  findNextUnansweredQid: vi.fn(),
}))

vi.mock('@/hooks/use-progress-stats', () => ({
  useProgressStats: () => ({ data: { answered: 0, total: 557, correct: 0 } }),
  useWrongList: () => ({ data: [] }),
  useBookmarksList: () => ({ data: [] }),
}))

function openCertSwitcher() {
  fireEvent.click(screen.getByLabelText('Switch certification'))
}

beforeEach(() => {
  localStorage.clear()
  routerMocks.push.mockClear()
  routerMocks.replace.mockClear()
  authMocks.status = 'unauthenticated'
  authMocks.session = null
  accountPreferenceMocks.saveCurrentCert.mockReset()
  accountPreferenceMocks.saveCurrentCert.mockImplementation(
    async (cert: 'DVA-C02' | 'CLF-C02') => cert,
  )
  usePrefsStore.setState({ locale: 'en', theme: 'light', currentCert: 'DVA-C02' })
})

afterEach(cleanup)

describe('HomePage cert switcher', () => {
  it('switches cert locally for guests without saving account preferences', async () => {
    render(<HomePage />)
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    await waitFor(() => expect(usePrefsStore.getState().currentCert).toBe('CLF-C02'))
    expect(accountPreferenceMocks.saveCurrentCert).not.toHaveBeenCalled()
  })

  it('saves account preferences before switching local cert for signed-in users', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    render(<HomePage />)
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    await waitFor(() => {
      expect(accountPreferenceMocks.saveCurrentCert).toHaveBeenCalledWith('CLF-C02')
      expect(usePrefsStore.getState().currentCert).toBe('CLF-C02')
    })
  })

  it('keeps the old cert selected and shows an error when signed-in save fails', async () => {
    authMocks.status = 'authenticated'
    authMocks.session = { user: { id: 'user-1' }, expires: '2099-01-01T00:00:00.000Z' }
    accountPreferenceMocks.saveCurrentCert.mockRejectedValueOnce(new Error('failed'))
    render(<HomePage />)
    openCertSwitcher()

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not save your selection. Try again.',
    )
    expect(usePrefsStore.getState().currentCert).toBe('DVA-C02')
  })
})
