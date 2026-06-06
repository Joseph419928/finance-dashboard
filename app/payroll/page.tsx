'use client'
import { useCallback, useEffect, useState } from 'react'
import { fmtCurrency, fmtPct } from '@/lib/formatters'
import { toCents, toUnits } from '@/lib/money'
import { minToTime, timeToMin, shiftMinutes, parttimePayCents, totalMinutes } from '@/lib/payroll'

interface Emp { id: number; name: string; type: string; defaultSalaryCents: number; defaultHourlyCents: number; active: boolean }
interface ShiftR { cid: string; date: string; startMin: number; endMin: number; breakMin: number; note: string }
interface FT { cid: string; employeeId: number; name: string; salaryCents: number; note: string; baseSalary: number; raiseCount: number }
interface PT { cid: string; employeeId: number; name: string; hourlyCents: number; note: string; shifts: ShiftR[]; open: boolean }
let _c = 0; const cid = () => `p${++_c}`

export default function PayrollPage() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(1)
  const [ft, setFt] = useState<FT[]>([])
  const [pt, setPt] = useState<PT[]>([])
  const [emps, setEmps] = useState<Emp[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setMsg('')
    const res = await fetch(`/api/payroll?year=${year}&month=${month}`)
    const d = await res.json()
    setEmps(d.allEmployees || [])
    setFt((d.fulltime || []).map((e: { employeeId: number; name: string; salaryCents: number; note: string; raise: { baseSalary: number; count: number } }) =>
      ({ cid: cid(), employeeId: e.employeeId, name: e.name, salaryCents: e.salaryCents, note: e.note, baseSalary: e.raise.baseSalary, raiseCount: e.raise.count })))
    setPt((d.parttime || []).map((e: { employeeId: number; name: string; hourlyCents: number; note: string; shifts: ShiftR[] }) =>
      ({ cid: cid(), employeeId: e.employeeId, name: e.name, hourlyCents: e.hourlyCents, note: e.note, open: false,
         shifts: (e.shifts || []).map(s => ({ cid: cid(), date: s.date, startMin: s.startMin, endMin: s.endMin, breakMin: s.breakMin, note: s.note })) })))
    setLoading(false)
  }, [year, month])
  useEffect(() => { load() }, [load])

  const ftTotal = ft.reduce((a, e) => a + e.salaryCents, 0)
  const ptTotal = pt.reduce((a, e) => a + parttimePayCents(e.hourlyCents, e.shifts), 0)

  const usedIds = new Set([...ft.map(e => e.employeeId), ...pt.map(e => e.employeeId)])
  const availFT = emps.filter(e => e.type === 'FULLTIME' && !usedIds.has(e.id))
  const availPT = emps.filter(e => e.type === 'PARTTIME' && !usedIds.has(e.id))

  function addFT(id: number) {
    const e = emps.find(x => x.id === id); if (!e) return
    setFt(s => [...s, { cid: cid(), employeeId: e.id, name: e.name, salaryCents: e.defaultSalaryCents, note: '', baseSalary: e.defaultSalaryCents, raiseCount: 0 }])
  }
  function addPT(id: number) {
    const e = emps.find(x => x.id === id); if (!e) return
    setPt(s => [...s, { cid: cid(), employeeId: e.id, name: e.name, hourlyCents: e.defaultHourlyCents, note: '', shifts: [], open: true }])
  }

  async function save() {
    setMsg('儲存中...')
    const res = await fetch(`/api/payroll?year=${year}&month=${month}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulltime: ft.map(e => ({ employeeId: e.employeeId, salaryCents: e.salaryCents, note: e.note })),
        parttime: pt.map(e => ({ employeeId: e.employeeId, hourlyCents: e.hourlyCents, note: e.note,
          shifts: e.shifts.map(s => ({ date: s.date, startMin: s.startMin, endMin: s.endMin, breakMin: s.breakMin, note: s.note })) })),
      }),
    })
    if (res.ok) { setMsg('已儲存'); load() } else setMsg('儲存失敗')
  }

  async function carry() {
    if (!confirm('帶入上一期薪資資料（正職月薪、兼職時薪）？兼職每日工時不複製。將覆蓋本月。')) return
    const res = await fetch('/api/payroll/carry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month }) })
    const d = await res.json()
    setMsg(d.from ? `已帶入 ${d.from}（${d.copied} 筆）` : (d.message || '查無上一期')); load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">薪資管理</h1>
          <p className="text-sm text-slate-500 mt-1">正職月薪與年度漲幅、PT兼職工時計薪。新增期別可帶入上一期。</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="btn-secondary">＋ 新增員工</button>
      </div>

      {showAdd && <AddEmployee onDone={() => { setShowAdd(false); load() }} />}

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">年</label><input className="input-sm w-24" type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} /></div>
        <div><label className="label">月</label><input className="input-sm w-20" type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value) || month)} /></div>
        <button onClick={carry} className="btn-secondary">↻ 帶入上一期</button>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-400">本月薪資合計（正職 + 兼職）</div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{fmtCurrency(ftTotal + ptTotal)}</div>
        </div>
      </div>

      {loading ? <div className="card text-center py-10 text-slate-400">載入中...</div> : (
        <>
          {/* 正職 */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700">正職 <span className="text-xs text-slate-400">合計 {fmtCurrency(ftTotal)}</span></h2>
              <AddPicker label="加入正職" options={availFT} onPick={addFT} />
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[11px] font-semibold text-slate-400 uppercase">
              <div className="col-span-3">姓名</div><div className="col-span-3 text-right">月薪 (元)</div>
              <div className="col-span-3">年度漲幅</div><div className="col-span-3">備註</div>
            </div>
            <div className="space-y-2 mt-2">
              {ft.map(e => {
                const pct = e.baseSalary > 0 ? (e.salaryCents - e.baseSalary) / e.baseSalary : 0
                return (
                  <div key={e.cid} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 md:col-span-3 font-medium text-slate-800">{e.name}</div>
                    <input className="input-sm col-span-6 md:col-span-3 text-right tabular-nums" type="number" step="1"
                      value={toUnits(e.salaryCents)} onChange={ev => setFt(s => s.map(x => x.cid === e.cid ? { ...x, salaryCents: toCents(ev.target.value) } : x))} />
                    <div className="col-span-6 md:col-span-3 text-sm">
                      {pct > 0.0001 ? <span className="badge bg-emerald-50 text-emerald-700">▲ {fmtPct(pct)} · {e.raiseCount} 次</span>
                        : pct < -0.0001 ? <span className="badge bg-rose-50 text-rose-700">▼ {fmtPct(pct)}</span>
                        : <span className="text-slate-400">—</span>}
                    </div>
                    <div className="col-span-5 md:col-span-2"><input className="input-sm" placeholder="備註" value={e.note} onChange={ev => setFt(s => s.map(x => x.cid === e.cid ? { ...x, note: ev.target.value } : x))} /></div>
                    <button onClick={() => setFt(s => s.filter(x => x.cid !== e.cid))} className="btn-danger col-span-1">✕</button>
                  </div>
                )
              })}
              {ft.length === 0 && <div className="text-center py-4 text-slate-400 text-sm">尚無正職資料</div>}
            </div>
          </div>

          {/* 兼職 */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700">PT 兼職 <span className="text-xs text-slate-400">合計 {fmtCurrency(ptTotal)}</span></h2>
              <AddPicker label="加入兼職" options={availPT} onPick={addPT} />
            </div>
            <div className="space-y-3">
              {pt.map(e => {
                const mins = totalMinutes(e.shifts)
                const pay = parttimePayCents(e.hourlyCents, e.shifts)
                return (
                  <div key={e.cid} className="ring-1 ring-slate-200 rounded-xl p-3">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 md:col-span-3 font-medium text-slate-800">{e.name}</div>
                      <div className="col-span-7 md:col-span-3 flex items-center gap-1">
                        <span className="text-xs text-slate-400">時薪</span>
                        <input className="input-sm text-right tabular-nums" type="number" step="1" value={toUnits(e.hourlyCents)}
                          onChange={ev => setPt(s => s.map(x => x.cid === e.cid ? { ...x, hourlyCents: toCents(ev.target.value) } : x))} />
                      </div>
                      <div className="col-span-6 md:col-span-3 text-sm text-slate-500 tabular-nums">{(mins / 60).toFixed(1)} 小時</div>
                      <div className="col-span-5 md:col-span-2 text-right font-bold text-emerald-700 tabular-nums">{fmtCurrency(pay)}</div>
                      <button onClick={() => setPt(s => s.filter(x => x.cid !== e.cid))} className="btn-danger col-span-1">✕</button>
                    </div>
                    <button onClick={() => setPt(s => s.map(x => x.cid === e.cid ? { ...x, open: !x.open } : x))} className="btn-ghost mt-1 text-xs">
                      {e.open ? '▾ 收合工時' : `▸ 展開工時（${e.shifts.length} 天）`}
                    </button>
                    {e.open && (
                      <div className="mt-2 space-y-1.5">
                        <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold text-slate-400 uppercase">
                          <div className="col-span-3">日期</div><div className="col-span-2">上班</div><div className="col-span-2">下班</div>
                          <div className="col-span-2">休息(分)</div><div className="col-span-2">時數</div>
                        </div>
                        {e.shifts.map(s => {
                          const h = (shiftMinutes(s) / 60).toFixed(2)
                          const setShift = (patch: Partial<ShiftR>) => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: x.shifts.map(z => z.cid === s.cid ? { ...z, ...patch } : z) } : x))
                          return (
                            <div key={s.cid} className="grid grid-cols-12 gap-2 items-center">
                              <input className="input-sm col-span-4 md:col-span-3" type="date" value={s.date} onChange={ev => setShift({ date: ev.target.value })} />
                              <input className="input-sm col-span-3 md:col-span-2" type="time" value={minToTime(s.startMin)} onChange={ev => setShift({ startMin: timeToMin(ev.target.value) })} />
                              <input className="input-sm col-span-3 md:col-span-2" type="time" value={minToTime(s.endMin)} onChange={ev => setShift({ endMin: timeToMin(ev.target.value) })} />
                              <input className="input-sm col-span-2 md:col-span-2 text-right tabular-nums" type="number" value={s.breakMin} onChange={ev => setShift({ breakMin: parseInt(ev.target.value) || 0 })} />
                              <div className="col-span-1 md:col-span-2 text-sm text-slate-500 tabular-nums">{h}h</div>
                              <button onClick={() => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: x.shifts.filter(z => z.cid !== s.cid) } : x))} className="btn-danger col-span-1">✕</button>
                            </div>
                          )
                        })}
                        <button onClick={() => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: [...x.shifts, { cid: cid(), date: '', startMin: 0, endMin: 0, breakMin: 0, note: '' }] } : x))}
                          className="btn-ghost text-emerald-600 text-xs">＋ 新增一天工時</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {pt.length === 0 && <div className="text-center py-4 text-slate-400 text-sm">尚無兼職資料</div>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} className="btn-primary px-8">儲存</button>
            {msg && <span className="text-sm text-emerald-600">{msg}</span>}
          </div>
        </>
      )}
    </div>
  )
}

function AddPicker({ label, options, onPick }: { label: string; options: Emp[]; onPick: (id: number) => void }) {
  const [val, setVal] = useState('')
  if (options.length === 0) return <span className="text-xs text-slate-400">（無可加入員工）</span>
  return (
    <select className="input-sm w-44" value={val} onChange={e => { const id = parseInt(e.target.value); if (id) onPick(id); setVal('') }}>
      <option value="">{label}…</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

function AddEmployee({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('FULLTIME')
  const [amount, setAmount] = useState(0)
  const [err, setErr] = useState('')
  async function create() {
    if (!name.trim()) { setErr('請輸入姓名'); return }
    const body = type === 'FULLTIME'
      ? { name, type, defaultSalaryCents: toCents(amount) }
      : { name, type, defaultHourlyCents: toCents(amount) }
    const res = await fetch('/api/employee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) onDone()
    else setErr((await res.json()).error || '新增失敗')
  }
  return (
    <div className="card mb-4 bg-emerald-50/40 ring-emerald-200">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label">姓名</label><input className="input-sm w-40" value={name} onChange={e => setName(e.target.value)} placeholder="員工姓名" /></div>
        <div><label className="label">類型</label>
          <select className="input-sm w-28" value={type} onChange={e => setType(e.target.value)}>
            <option value="FULLTIME">正職</option><option value="PARTTIME">PT兼職</option>
          </select>
        </div>
        <div><label className="label">{type === 'FULLTIME' ? '預設月薪(元)' : '預設時薪(元)'}</label>
          <input className="input-sm w-32 text-right" type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} /></div>
        <button onClick={create} className="btn-primary">建立</button>
        {err && <span className="text-sm text-rose-600">{err}</span>}
      </div>
      <p className="text-xs text-slate-400 mt-2">PT 兼職姓名僅需建立一次，之後即可在各月份直接選用。</p>
    </div>
  )
}
