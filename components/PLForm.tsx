'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtCurrency } from '@/lib/formatters'
import { toCents, toUnits } from '@/lib/money'
import { CATEGORIES, EXPENSE_CATEGORIES, type Category } from '@/lib/categories'
import type { MonthlyPL, LineItem } from '@/lib/types'

interface Props {
  record: MonthlyPL & { lineItems: LineItem[] }
}

interface Row { cid: string; category: Category; label: string; amountCents: number; note: string }
let _cid = 0
const newCid = () => `r${++_cid}`

const STATUSES = ['', '超出預算', '符合預算', '低於預算']

export default function PLForm({ record }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(
    (record.lineItems || []).map(li => ({
      cid: newCid(), category: li.category, label: li.label, amountCents: li.amountCents, note: li.note,
    }))
  )
  const [revenueBudget, setRevenueBudget] = useState(record.revenueBudget)
  const [revenueFaceVal, setRevenueFaceVal] = useState(record.revenueFaceVal)
  const [bankBalance, setBankBalance] = useState(record.bankBalance)
  const [status, setStatus] = useState(record.status)
  const [notes, setNotes] = useState(record.notes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState('')

  const sumCat = (c: Category) => rows.filter(r => r.category === c).reduce((a, r) => a + r.amountCents, 0)
  const revenueActual = sumCat('REVENUE')
  const totalExpenses = EXPENSE_CATEGORIES.reduce((a, c) => a + sumCat(c), 0)
  const netProfit = revenueActual - totalExpenses
  const shareholderTotal = sumCat('SHAREHOLDER')
  const disposable = netProfit - shareholderTotal
  const achieve = revenueBudget > 0 ? revenueActual / revenueBudget : 0

  function addRow(category: Category) {
    setRows(rs => [...rs, { cid: newCid(), category, label: '', amountCents: 0, note: '' }])
  }
  function removeRow(cid: string) { setRows(rs => rs.filter(r => r.cid !== cid)) }
  function update(cid: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => (r.cid === cid ? { ...r, ...patch } : r)))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/pl/${record.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenueBudget, revenueFaceVal, bankBalance, status, notes,
          lineItems: rows.map((r, i) => ({
            category: r.category, label: r.label, amountCents: r.amountCents, note: r.note, sortOrder: i,
          })),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSavedAt(new Date().toLocaleTimeString('zh-TW'))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm('確定要刪除此月份及其所有細項？')) return
    const res = await fetch(`/api/pl/${record.id}`, { method: 'DELETE' })
    if (res.ok) { router.push('/monthly'); router.refresh() }
  }

  return (
    <div className="space-y-5">
      {error && <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {/* Live summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Chip label="實際營收" value={fmtCurrency(revenueActual)} tone="emerald" />
        <Chip label="總支出" value={fmtCurrency(totalExpenses)} tone="rose" />
        <Chip label="淨損益" value={fmtCurrency(netProfit)} tone={netProfit >= 0 ? 'emerald' : 'rose'} bold />
        <Chip label="可動用留抵" value={fmtCurrency(disposable)} tone={disposable >= 0 ? 'emerald' : 'rose'} />
        <Chip label="達成率" value={`${(achieve * 100).toFixed(1)}%`} tone={achieve >= 1 ? 'emerald' : achieve >= 0.8 ? 'amber' : 'rose'} />
      </div>

      {/* Container fields */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">基本資訊</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Money label="預算營收" cents={revenueBudget} onChange={setRevenueBudget} />
          <Money label="帳面營業額(Forecast)" cents={revenueFaceVal} onChange={setRevenueFaceVal} />
          <Money label="月底銀行餘額" cents={bankBalance} onChange={setBankBalance} />
          <div>
            <label className="label">預算狀態</label>
            <select className="input-field" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s || '-- 選擇 --'}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Category sections with editable line items */}
      {CATEGORIES.map(cat => {
        const items = rows.filter(r => r.category === cat.key)
        const subtotal = items.reduce((a, r) => a + r.amountCents, 0)
        return (
          <div key={cat.key} className="card">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">{cat.label}</h3>
                {cat.hint && <p className="text-xs text-slate-400 mt-0.5">{cat.hint}</p>}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">小計</div>
                <div className={`text-base font-bold tabular-nums ${cat.kind === 'income' ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {fmtCurrency(subtotal)}
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[11px] font-semibold text-slate-400 uppercase">
                  <div className="col-span-4">項目名稱</div>
                  <div className="col-span-3 text-right">金額 (元)</div>
                  <div className="col-span-5">細項備註（發生原因）</div>
                </div>
                {items.map(r => (
                  <div key={r.cid} className="grid grid-cols-12 gap-2 items-center">
                    <input className="input-sm col-span-12 md:col-span-4" placeholder="項目名稱"
                      value={r.label} onChange={e => update(r.cid, { label: e.target.value })} />
                    <input className="input-sm col-span-8 md:col-span-3 text-right tabular-nums" type="number" step="0.01"
                      value={toUnits(r.amountCents)} onChange={e => update(r.cid, { amountCents: toCents(e.target.value) })} />
                    <input className="input-sm col-span-10 md:col-span-4" placeholder="例如：修繕費、本期回收X月貨款"
                      value={r.note} onChange={e => update(r.cid, { note: e.target.value })} />
                    <button onClick={() => removeRow(r.cid)} className="btn-danger col-span-2 md:col-span-1" title="刪除">✕</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => addRow(cat.key)} className="btn-ghost mt-3 text-emerald-600 hover:text-emerald-700">
              ＋ 新增一筆{cat.label}
            </button>
          </div>
        )
      })}

      {/* Notes */}
      <div className="card">
        <label className="label">備註</label>
        <textarea className="input-field min-h-20" value={notes}
          onChange={e => setNotes(e.target.value)} placeholder="本期特殊說明..." />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 sticky bottom-0 bg-slate-100/80 backdrop-blur py-3 -mx-2 px-2 rounded-xl">
        <button onClick={save} disabled={saving} className="btn-primary px-8">
          {saving ? '儲存中...' : '儲存'}
        </button>
        <button onClick={() => router.push('/monthly')} className="btn-secondary">返回列表</button>
        {savedAt && <span className="text-xs text-emerald-600">已於 {savedAt} 儲存</span>}
        <button onClick={remove} className="btn-danger ml-auto">刪除此月份</button>
      </div>
    </div>
  )
}

function Money({ label, cents, onChange }: { label: string; cents: number; onChange: (c: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-field text-right tabular-nums" type="number" step="0.01"
        value={toUnits(cents)} onChange={e => onChange(toCents(e.target.value))} />
    </div>
  )
}

function Chip({ label, value, tone, bold }: { label: string; value: string; tone: string; bold?: boolean }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 ring-emerald-200 text-emerald-700',
    rose: 'bg-rose-50 ring-rose-200 text-rose-700',
    amber: 'bg-amber-50 ring-amber-200 text-amber-700',
  }
  return (
    <div className={`rounded-xl ring-1 px-4 py-3 ${map[tone] ?? map.emerald}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className={`mt-0.5 tabular-nums ${bold ? 'text-lg font-bold' : 'text-base font-semibold'}`}>{value}</div>
    </div>
  )
}
