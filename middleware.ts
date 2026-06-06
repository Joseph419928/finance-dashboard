import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, sessionToken, safeEqual } from '@/lib/auth'

// Paths that must stay reachable without a session.
const PUBLIC_PATHS = ['/login', '/api/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()

  const password = process.env.APP_PASSWORD
  // If no password is configured we leave the app open (local dev / first run).
  // Production MUST set APP_PASSWORD — see DEPLOY.md.
  if (!password) return NextResponse.next()

  const expected = await sessionToken(password)
  const token = req.cookies.get(AUTH_COOKIE)?.value
  const authed = !!token && safeEqual(token, expected)
  if (authed) return NextResponse.next()

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
