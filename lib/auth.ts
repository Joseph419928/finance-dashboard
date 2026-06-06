// Lightweight password auth shared by middleware (Edge) and API routes (Node).
// Uses Web Crypto (available in both runtimes) so it has zero dependencies.

export const AUTH_COOKIE = 'fy_auth'

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Derive a deterministic session token from the configured password.
 * The raw password is never stored in the cookie — only this hash.
 */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`fy-finance:v1:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

/** Constant-time-ish string compare to avoid trivial timing leaks. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
