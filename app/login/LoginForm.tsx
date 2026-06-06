'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '登入失敗')
      }
      // Use a hard navigation so the new auth cookie is picked up by middleware.
      const target = next.startsWith('/') ? next : '/dashboard'
      window.location.href = target
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>}
      <input
        type="password"
        className="input-field"
        placeholder="密碼"
        value={password}
        autoFocus
        onChange={e => setPassword(e.target.value)}
      />
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? '登入中...' : '登入'}
      </button>
    </form>
  )
}
