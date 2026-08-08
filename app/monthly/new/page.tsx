'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewMonthPage() {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [carryFixed, setCarryFixed] = useState(true)

  async function create() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, carryFixed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '建立失敗')
      const query = data.carriedFixed > 0
        ? `?carried=${data.carriedFixed}&from=${encodeURIComponent(data.carriedFrom || '')}`
        : ''
      router.push(`/monthly/${year}/${month}${query}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立失敗'); setBusy(false)
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/monthly" className="text-slate-400 hover:text-slate-600 text-sm">← 返回列表</Link>
      </div>
      <div className="card space-y-4">
        <h1 className="text-xl font-bold text-slate-800">新增月份</h1>
        <p className="text-sm text-slate-500">建立後即可逐筆新增各分類細項。若該月已存在，會直接開啟編輯。</p>
        {error && <div className="bg-rose-50 text-rose-600 px-3 py-2 rounded-lg text-sm">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">年份</label>
            <input className="input-field" type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} />
          </div>
          <div>
            <label className="label">月份</label>
            <input className="input-field" type="number" min={1} max={12} value={month}
              onChange={e => setMonth(parseInt(e.target.value) || month)} />
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <input className="mt-0.5" type="checkbox" checked={carryFixed} onChange={e => setCarryFixed(e.target.checked)} />
          <span>
            <span className="font-medium">自動帶入上一期的每月固定支出</span>
            <span className="block text-xs text-slate-400 mt-1">會把上一期「每月固定支出」的項目與金額原樣複製到新月份，之後仍可自行修改。</span>
          </span>
        </label>
        <button onClick={create} disabled={busy} className="btn-primary w-full">
          {busy ? '建立中...' : '建立並開始編輯'}
        </button>
      </div>
    </div>
  )
}
