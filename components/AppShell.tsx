'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

const COLLAPSE_KEY = 'fy-finance:sidebar-collapsed'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // 讀取上次的收合偏好；在 useEffect 內做以避免 SSR/CSR 內容不一致。
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
  }, [])

  function toggleCollapse() {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  if (path === '/login') return <>{children}</>

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-slate-50">
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
        <span className="font-bold text-emerald-400">富育財務系統</span>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="開啟選單"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-800 text-xl"
        >
          ☰
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        onToggleCollapse={toggleCollapse}
      />

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
