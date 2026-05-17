import { LoginClient } from './login-client'

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams

  return <LoginClient hasAuthError={typeof error === 'string'} />
}
