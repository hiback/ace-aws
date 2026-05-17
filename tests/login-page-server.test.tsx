import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from '../src/app/(auth)/login/page'

const loginClientMocks = vi.hoisted(() => ({
  props: [] as { hasAuthError: boolean }[],
}))

vi.mock('../src/app/(auth)/login/login-client', () => ({
  LoginClient: (props: { hasAuthError: boolean }) => {
    loginClientMocks.props.push(props)
    return <div>has auth error: {String(props.hasAuthError)}</div>
  },
}))

describe('LoginPage', () => {
  it('passes true when searchParams.error is a string', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: 'OAuthCallback' }) })

    render(ui)

    expect(loginClientMocks.props.at(-1)).toEqual({ hasAuthError: true })
    expect(screen.getByText('has auth error: true')).not.toBeNull()
  })

  it('passes false when searchParams.error is not a string', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: ['OAuthCallback'] }) })

    render(ui)

    expect(loginClientMocks.props.at(-1)).toEqual({ hasAuthError: false })
    expect(screen.getByText('has auth error: false')).not.toBeNull()
  })
})
