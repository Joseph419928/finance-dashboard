import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, sessionToken, safeEqual } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD
  if (!password) {
    // Auth disabled — nothing to log in to.
    return NextResponse.json({ ok: true })
  }

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }

  const supplied = typeof body.password === 'string' ? body.password : ''
  if (!safeEqual(supplied, password)) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return res
}
