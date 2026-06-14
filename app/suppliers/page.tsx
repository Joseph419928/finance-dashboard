'use client'
import { useEffect, useState, useCallback } from 'react'
import { fmtCurrency } from '@/lib/formatters'
import MoneyInput from '@/components/MoneyInput'

interface Row { cid: string; name: string; amountCents: number; note: string }
let _c = 0
const cid = () => `s${++_c}`

export default function SuppliersPage() {
  const now = new Date()
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(1)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  void now
  const load = useCallback(async () => {
    setLoading(true); setMsg('')
    const res = await fetch(`/api/supplier?year=${year}&month=${month}`)
    const data = await res.json()
    setRows((data.suppliers || []).map((s: { name: string; amountCents: number; note: string }) =>
      ({ cid: cid(), name: s.name, amountCents: s.amountCents, note: s.note })))
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const total = rows.reduce((a, r) => a + r.amountCents, 0)

  const add = () => setRows(r => [...r, { cid: cid(), name: '', amountCents: 0, note: '' }])
  const del = (id: string) => setRows(r => r.filter(x => x.cid !== id))
  const upd = (id: string, patch: Partial<Row>) => setRows(r => r.map(x => x.cid === id ? { ...x, ...patch } : x))

  async function save() {
    setMsg('儲存中...')
    const res = await fetch(`/api/supplier?year=${year}&month=${month}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suppliers: rows.map(r => ({ name: r.name, amountCents: r.amountCents, note: r.note })) }),
    })
    if (res.ok) { setMsg('已儲存'); load() } else setMsg('儲存失敗')
  }

  async function carry() {
    if (!confirm('將以上一期的貨主名單帶入本月（金額歸 0）？此動作會覆蓋目前清單。')) return
    const res = await fetch('/api/supplier/carry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const data = await res.json()
    if (data.from) { setMsg(`已帶入 ${data.from} 名單`); load() }
    else setMsg(data.message || '查無上一期')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">月結貨主</h1>
          <p className="text-sm text-slate-500 mt-1">自行輸入各貨主月結金額，系統自動加總</p>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">年</label>
          <input className="input-sm w-24" type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} />
        </div>
        <div>
          <label className="label">月</label>
          <input className="input-sm w-20" type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value) || month)} />
        </div>
        <button onClick={carry} className="btn-secondary">↻ 帶入上一期名單</button>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-400">本月合計</div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{fmtCurrency(total)}</div>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="text-center py-10 text-slate-400">載入中...</div> : (
          <>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-2 text-[11px] font-semibold text-slate-400 uppercase">
              <div className="col-span-4">貨主名稱</div>
              <div className="col-span-3 text-right">金額 (元)</div>
              <div className="col-span-4">備註</div>
            </div>
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.cid} className="grid grid-cols-12 gap-2 items-center">
                  <input className="input-sm col-span-12 md:col-span-4" placeholder="貨主名稱" value={r.name} onChange={e => upd(r.cid, { name: e.target.value })} />
                  <MoneyInput className="input-sm col-span-8 md:col-span-3"
                    cents={r.amountCents} onChange={c => upd(r.cid, { amountCents: c })} />
                  <input className="input-sm col-span-10 md:col-span-4" placeholder="備註" value={r.note} onChange={e => upd(r.cid, { note: e.target.value })} />
                  <button onClick={() => del(r.cid)} className="btn-danger col-span-2 md:col-span-1">✕</button>
                </div>
              ))}
              {rows.length === 0 && <div className="text-center py-6 text-slate-400 text-sm">本月尚無資料，可新增或帶入上一期</div>}
            </div>
            <button onClick={add} className="btn-ghost mt-3 text-emerald-600">＋ 新增貨主</button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} className="btn-primary px-8">儲存</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
    </div>
  )
}
