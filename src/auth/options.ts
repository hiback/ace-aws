import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import { db } from '@/db'
import { accounts, sessions, users, verificationTokens } from '@/db/schema'

const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build'
const githubClientId = process.env.AUTH_GITHUB_ID || (isProductionBuild ? 'build' : undefined)
const githubClientSecret =
  process.env.AUTH_GITHUB_SECRET || (isProductionBuild ? 'build' : undefined)
const authSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (isProductionBuild ? 'build' : undefined)
const authUrl =
  process.env.AUTH_URL ||
  process.env.NEXTAUTH_URL ||
  (isProductionBuild ? 'http://localhost:3000' : undefined)

if (authUrl) {
  process.env.NEXTAUTH_URL = authUrl
}

if (authSecret) {
  process.env.NEXTAUTH_SECRET = authSecret
}

if (!githubClientId || !githubClientSecret) {
  throw new Error('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required')
}

if (!authSecret) {
  throw new Error('AUTH_SECRET is required')
}

if (!authUrl) {
  throw new Error('AUTH_URL is required')
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  secret: authSecret,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    GitHubProvider({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
}
