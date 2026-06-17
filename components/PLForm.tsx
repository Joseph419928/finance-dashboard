'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtCurrency, fmtPct2, ratioOfRevenue } from '@/lib/formatters'
import MoneyInput from '@/components/MoneyInput'
import { categoryDef, type Category } from '@/lib/categories'
import {
  calcRevenue, calcGrossProfit, calcOpex, calcOperatingIncome,
  calcNonOperatingNet, calcPretaxIncome, calcNetIncome, calcDisposable,
  grossMargin, operatingMargin, netMargin, type MonthlyPL, type LineItem,
} from '@/lib/types'

interface Props {
  record: MonthlyPL & { lineItems: LineItem[] }
}

interface Row { cid: string; category: Category; label: string; amountCents: number; note: string; costCenter: string }
let _cid = 0
const newCid = () => `r${++_cid}`

const STATUSES = ['', '超出預算', '符合預算', '低於預算']

export default function PLForm({ record }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(
    (record.lineItems || []).map(li => ({
      cid: newCid(), category: li.category, label: li.label, amountCents: li.amountCents,
      note: li.note, costCenter: li.costCenter || '',
    }))
  )
  const [revenueBudget, setRevenueBudget] = useState(record.revenueBudget)
  const [revenueFaceVal, setRevenueFaceVal] = useState(record.revenueFaceVal)
  const [revenueAccrual, setRevenueAccrual] = useState(record.revenueAccrual)
  const [incomeTaxCents, setIncomeTaxCents] = useState(record.incomeTaxCents)
  const [bankBalance, setBankBalance] = useState(record.bankBalance)
  const [arBalance, setArBalance] = useState(record.arBalance)
  const [apBalance, setApBalance] = useState(record.apBalance)
  const [status, setStatus] = useState(record.status)
  const [notes, setNotes] = useState(record.notes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState('')

  const sumCat = (c: Category) => rows.filter(r => r.category === c).reduce((a, r) => a + r.amountCents, 0)

  // 以目前表單狀態組出 Partial<MonthlyPL>，沿用 lib/types.ts 的分層函式，避免重複實作。
  const pl: Partial<MonthlyPL> = {
    revenueAccrual, revenueActual: sumCat('REVENUE'), incomeTaxCents,
    procurementTotal: sumCat('PROCUREMENT'),
    payrollTotal: sumCat('PAYROLL'),
    fixedTotal: sumCat('FIXED'),
    operatingTotal: sumCat('OPERATING'),
    centralTotal: sumCat('CENTRAL'),
    depreciationTotal: sumCat('DEPRECIATION'),
    nonOperatingTotal: sumCat('NON_OPERATING'),
    nonOperatingIncomeTotal: sumCat('NON_OPERATING_INCOME'),
    financingPrincipalTotal: sumCat('FINANCING_PRINCIPAL'),
    shareholderTotal: sumCat('SHAREHOLDER'),
  }

  const revenue = calcRevenue(pl)
  const grossProfit = calcGrossProfit(pl)
  const operatingIncome = calcOperatingIncome(pl)
  const pretaxIncome = calcPretaxIncome(pl)
  const netIncome = calcNetIncome(pl)
  const disposable = calcDisposable(pl)
  const revenueCash = sumCat('REVENUE')
  const achieve = revenueBudget > 0 ? revenue / revenueBudget : 0

  function addRow(category: Category) {
    setRows(rs => [...rs, { cid: newCid(), category, label: '', amountCents: 0, note: '', costCenter: '' }])
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
          revenueBudget, revenueFaceVal, revenueAccrual, incomeTaxCents,
          bankBalance, arBalance, apBalance, status, notes,
          lineItems: rows.map((r, i) => ({
            category: r.category, label: r.label, amountCents: r.amountCents,
            note: r.note, costCenter: r.costCenter, sortOrder: i,
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

  const section = (cat: Category) => (
    <CategorySection
      key={cat}
      category={cat}
      rows={rows.filter(r => r.category === cat)}
      revenue={revenue}
      onAdd={() => addRow(cat)}
      onRemove={removeRow}
      onUpdate={update}
    />
  )

  return (
    <div className="space-y-5">
      {error && <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {/* Live summary — 五層損益 + 達成率 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Chip label="營業收入(權責)" value={fmtCurrency(revenue)} tone="emerald" />
        <Chip label={`營業毛利 ${fmtPct2(grossMargin(pl))}`} value={fmtCurrency(grossProfit)} tone={grossProfit >= 0 ? 'emerald' : 'rose'} />
        <Chip label={`營業淨利 ${fmtPct2(operatingMargin(pl))}`} value={fmtCurrency(operatingIncome)} tone={operatingIncome >= 0 ? 'emerald' : 'rose'} />
        <Chip label="稅前淨利" value={fmtCurrency(pretaxIncome)} tone={pretaxIncome >= 0 ? 'emerald' : 'rose'} />
        <Chip label={`本期淨利 ${fmtPct2(netMargin(pl))}`} value={fmtCurrency(netIncome)} tone={netIncome >= 0 ? 'emerald' : 'rose'} bold />
        <Chip label="達成率" value={revenueBudget > 0 ? `${(achieve * 100).toFixed(1)}%` : '—'} tone={achieve >= 1 ? 'emerald' : achieve >= 0.8 ? 'amber' : 'rose'} />
      </div>

      {/* Container fields */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">基本資訊</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Money label="預算營收" cents={revenueBudget} onChange={setRevenueBudget} />
          <Money label="帳面營業額(Forecast)" cents={revenueFaceVal} onChange={setRevenueFaceVal} />
          <Money label="權責認列營收" cents={revenueAccrual} onChange={setRevenueAccrual} hint="損益表本體營收" />
          <Money label="所得稅費用" cents={incomeTaxCents} onChange={setIncomeTaxCents} hint="可手動輸入或依稅率估列" />
          <div>
            <label className="label">預算狀態</label>
            <select className="input-field" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s || '-- 選擇 --'}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          權責認列營收若留 0，損益表會回退以「現金回收」（下方營業收入明細加總，目前 {fmtCurrency(revenueCash)}）計算，並沿用舊資料。
        </p>
      </div>

      {/* ── 損益表本體（逐層小計）── */}
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-1">損益表（權責基礎）</div>

      {section('REVENUE')}
      {section('PROCUREMENT')}
      <SubtotalRow label="營業毛利" value={grossProfit} rate={grossMargin(pl)} />

      {section('PAYROLL')}
      {section('FIXED')}
      {section('OPERATING')}
      {section('CENTRAL')}
      {section('DEPRECIATION')}
      <SubtotalRow label="營業淨利(損)" value={operatingIncome} rate={operatingMargin(pl)} />

      {section('NON_OPERATING_INCOME')}
      {section('NON_OPERATING')}
      <SubtotalRow label="營業外淨額" value={calcNonOperatingNet(pl)} />
      <SubtotalRow label="稅前淨利(損)" value={pretaxIncome} />

      {/* 所得稅費用列 */}
      <div className="card flex items-center justify-between py-3">
        <span className="text-sm font-semibold text-slate-700">減：所得稅費用</span>
        <span className="text-base font-bold tabular-nums text-slate-800">{fmtCurrency(incomeTaxCents)}</span>
      </div>
      <SubtotalRow label="本期淨利(損)" value={netIncome} rate={netMargin(pl)} strong />

      {/* ── 盈餘分配（F4：獨立於損益表）── */}
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3">盈餘分配（不屬損益表）</div>
      {section('SHAREHOLDER')}
      <div className="card flex items-center justify-between py-3">
        <div>
          <span className="text-sm font-semibold text-slate-700">本期淨利後可動用現金</span>
          <p className="text-xs text-slate-400">= 本期淨利 − 股東提撥</p>
        </div>
        <span className={`text-base font-bold tabular-nums ${disposable >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtCurrency(disposable)}</span>
      </div>

      {/* ── 融資（F6：本金償還，非損益）── */}
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3">融資活動（非損益）</div>
      {section('FINANCING_PRINCIPAL')}

      {/* ── 現金 / 資產（F9：移出損益）── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">現金 / 資產（資產負債項，不計入損益）</h3>
        <p className="text-xs text-slate-400 mb-3">銀行餘額與應收/應付屬資產負債表項目，僅供現金與營運資金參考。</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Money label="月底銀行餘額" cents={bankBalance} onChange={setBankBalance} />
          <Money label="期末應收帳款" cents={arBalance} onChange={setArBalance} />
          <Money label="期末應付帳款" cents={apBalance} onChange={setApBalance} />
          <div>
            <label className="label">現金回收（營收明細加總）</label>
            <div className="input-field bg-slate-50 text-right tabular-nums text-slate-600">{fmtCurrency(revenueCash)}</div>
          </div>
        </div>
      </div>

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

function CategorySection({ category, rows, revenue, onAdd, onRemove, onUpdate }: {
  category: Category
  rows: Row[]
  revenue: number
  onAdd: () => void
  onRemove: (cid: string) => void
  onUpdate: (cid: string, patch: Partial<Row>) => void
}) {
  const cat = categoryDef(category)!
  const subtotal = rows.reduce((a, r) => a + r.amountCents, 0)
  const isIncome = cat.kind === 'income'
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            {cat.label}
            {cat.standardName !== cat.label && <span className="ml-2 text-xs font-normal text-slate-400">（{cat.standardName}）</span>}
          </h3>
          {cat.hint && <p className="text-xs text-slate-400 mt-0.5">{cat.hint}</p>}
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">小計 · 佔總營收</div>
          <div className={`text-base font-bold tabular-nums ${isIncome ? 'text-emerald-700' : 'text-slate-800'}`}>
            {fmtCurrency(subtotal)}
            <span className="ml-2 text-xs font-normal text-slate-400">{ratioOfRevenue(subtotal, revenue)}</span>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[11px] font-semibold text-slate-400 uppercase">
            <div className="col-span-3">項目名稱</div>
            <div className="col-span-2 text-right">金額 (元)</div>
            <div className="col-span-2">成本中心</div>
            <div className="col-span-4">細項備註（發生原因）</div>
          </div>
          {rows.map(r => (
            <div key={r.cid} className="grid grid-cols-12 gap-2 items-center">
              <input className="input-sm col-span-12 md:col-span-3" placeholder="項目名稱"
                value={r.label} onChange={e => onUpdate(r.cid, { label: e.target.value })} />
              <MoneyInput className="input-sm col-span-6 md:col-span-2"
                cents={r.amountCents} onChange={c => onUpdate(r.cid, { amountCents: c })} />
              <input className="input-sm col-span-6 md:col-span-2" placeholder="如：中區/總部"
                value={r.costCenter} onChange={e => onUpdate(r.cid, { costCenter: e.target.value })} />
              <input className="input-sm col-span-10 md:col-span-4" placeholder="例如：修繕費、本期回收X月貨款"
                value={r.note} onChange={e => onUpdate(r.cid, { note: e.target.value })} />
              <button onClick={() => onRemove(r.cid)} className="btn-danger col-span-2 md:col-span-1" title="刪除">✕</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={onAdd} className="btn-ghost mt-3 text-emerald-600 hover:text-emerald-700">
        ＋ 新增一筆{cat.label}
      </button>
    </div>
  )
}

function SubtotalRow({ label, value, rate, strong }: { label: string; value: number; rate?: number; strong?: boolean }) {
  const pos = value >= 0
  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ring-1 ${strong ? 'bg-slate-800 text-white ring-slate-700' : 'bg-slate-100 ring-slate-200'}`}>
      <span className={`font-bold ${strong ? 'text-white' : 'text-slate-700'} text-sm`}>
        ＝ {label}
        {rate !== undefined && <span className={`ml-2 text-xs font-normal ${strong ? 'text-slate-300' : 'text-slate-400'}`}>{fmtPct2(rate)}</span>}
      </span>
      <span className={`text-lg font-bold tabular-nums ${strong ? (pos ? 'text-emerald-300' : 'text-rose-300') : (pos ? 'text-emerald-700' : 'text-rose-600')}`}>
        {fmtCurrency(value)}
      </span>
    </div>
  )
}

function Money({ label, cents, onChange, hint }: { label: string; cents: number; onChange: (c: number) => void; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <MoneyInput className="input-field" cents={cents} onChange={onChange} />
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
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
