import { type NextRequest, NextResponse } from 'next/server'
import { hasCompletedAuthGate, hasSelectedCert } from '@/lib/onboarding-cookies'

function isExcludedPath(pathname: string) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\/[^/]+\.[^/]+$/.test(pathname)
  )
}

function redirect(request: NextRequest, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isExcludedPath(pathname)) {
    return NextResponse.next()
  }

  const hasAuthGate = hasCompletedAuthGate(request)
  const hasCert = hasSelectedCert(request)

  if (pathname === '/login') {
    if (!hasAuthGate) {
      return NextResponse.next()
    }

    return redirect(request, hasCert ? '/' : '/select-cert')
  }

  if (!hasAuthGate) {
    return redirect(request, '/login')
  }

  if (!hasCert) {
    if (pathname === '/select-cert') {
      return NextResponse.next()
    }

    return redirect(request, '/select-cert')
  }

  if (pathname === '/select-cert') {
    if (request.nextUrl.searchParams.get('mode') === 'switch') {
      return NextResponse.next()
    }

    return redirect(request, '/')
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
