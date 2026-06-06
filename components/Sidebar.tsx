'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard', label: '儀表板', icon: '📊' },
  { href: '/monthly', label: '每月損益', icon: '📋' },
  { href: '/suppliers', label: '月結貨主', icon: '📦' },
  { href: '/payroll', label: '薪資管理', icon: '👥' },
  { href: '/report/2025', label: '2025 損益表', icon: '📑' },
]

export default function Sidebar() {
  const path = usePathname()

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  if (path === '/login') return null

  return (
    <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
      <div className="px-6 py-5 border-b border-slate-700/60">
        <div className="text-lg font-bold text-emerald-400">富育財務系統</div>
        <div className="text-xs text-slate-400 mt-0.5">損益控管 · 薪資 · 貨主</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                active ? 'bg-emerald-600 text-white font-medium shadow-sm'
                       : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-700/60 space-y-3">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition">
          <span className="text-base">🚪</span><span>登出</span>
        </button>
        <div className="px-3 text-xs text-slate-500">v2.0 · FY Finance</div>
      </div>
    </aside>
  )
}
