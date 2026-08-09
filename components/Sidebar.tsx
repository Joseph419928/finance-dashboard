'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard', label: '儀表板', icon: '📊' },
  { href: '/monthly', label: '每月損益', icon: '📋' },
  { href: '/suppliers', label: '月結貨主', icon: '📦' },
  { href: '/payroll', label: '薪資管理', icon: '👥' },
  { href: '/payroll/workbench', label: '薪資工作台', icon: '✅' },
  { href: '/report/2025', label: '年度損益表', icon: '📑' },
  { href: '/settings/presets', label: '名稱設定', icon: '🏷️' },
]

interface Props {
  collapsed: boolean
  mobileOpen: boolean
  onNavigate: () => void
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, mobileOpen, onNavigate, onToggleCollapse }: Props) {
  const path = usePathname()

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  if (path === '/login') return null

  // 收合樣式僅在桌面版才適用；手機版抽屜一律完整顯示文字（不受桌面收合偏好影響）。
  const showLabels = !collapsed || mobileOpen

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-slate-900 text-white flex flex-col shrink-0
        transition-transform duration-200 md:static md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'md:w-16' : 'md:w-60'} w-60`}
    >
      <div className="px-4 py-5 border-b border-slate-700/60 flex items-center justify-between">
        {showLabels && (
          <div>
            <div className="text-lg font-bold text-emerald-400">富育財務系統</div>
            <div className="text-xs text-slate-400 mt-0.5">損益控管 · 薪資 · 貨主</div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? '展開工作列' : '收合工作列'}
          className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={!showLabels ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                active ? 'bg-emerald-600 text-white font-medium shadow-sm'
                       : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              {showLabels && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-700/60 space-y-3">
        <button onClick={handleLogout}
          title={!showLabels ? '登出' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition">
          <span className="text-base">🚪</span>{showLabels && <span>登出</span>}
        </button>
        {showLabels && <div className="px-3 text-xs text-slate-500">v2.0 · FY Finance</div>}
      </div>
    </aside>
  )
}
