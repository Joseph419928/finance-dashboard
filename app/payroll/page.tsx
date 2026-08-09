'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { fmtCurrency, fmtPct } from '@/lib/formatters'
import { minToTime, timeToMin, shiftMinutes, parttimePayCents, totalMinutes } from '@/lib/payroll'
import MoneyInput from '@/components/MoneyInput'
import ShiftCalendar from '@/components/ShiftCalendar'

interface Emp { id: number; name: string; type: string; defaultSalaryCents: number; defaultHourlyCents: number; active: boolean }
interface ShiftR { cid: string; date: string; startMin: number; endMin: number; breakMin: number; note: string }
interface FT { cid: string; employeeId: number; name: string; salaryCents: number; note: string; baseSalary: number; raiseCount: number }
interface PT { cid: string; employeeId: number; name: string; hourlyCents: number; note: string; shifts: ShiftR[]; open: boolean }
interface RosterRow { id: number; name: string; amountCents: number; idNumber: string; bankAccount: string; email: string; company: string }
let _c = 0; const cid = () => `p${++_c}`

// 新增班次的預設時間：09:00–18:00、休息 60 分。
const DEF_START = 9 * 60, DEF_END = 18 * 60, DEF_BREAK = 60
function stepMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default function PayrollPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState<'keyin' | 'source'>('keyin')
  const [ft, setFt] = useState<FT[]>([])
  const [pt, setPt] = useState<PT[]>([])
  const [emps, setEmps] = useState<Emp[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showNewMonth, setShowNewMonth] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showMonthlyLink, setShowMonthlyLink] = useState(false)

  // 撥款名單（薪資資料來源）
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [rosterTotal, setRosterTotal] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const appendRef = useRef<HTMLInputElement>(null)

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

  const loadRoster = useCallback(async () => {
    const res = await fetch(`/api/payroll/roster?year=${year}&month=${month}`)
    const d = await res.json()
    setRoster(d.rows || [])
    setRosterTotal(d.totalCents || 0)
  }, [year, month])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRoster() }, [loadRoster])

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

  function goMonth(delta: number) {
    const n = stepMonth(year, month, delta)
    setYear(n.year); setMonth(n.month)
  }

  async function save(): Promise<boolean> {
    setMsg('儲存中...')
    setShowMonthlyLink(false)
    try {
      const res = await fetch(`/api/payroll?year=${year}&month=${month}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulltime: ft.map(e => ({ employeeId: e.employeeId, salaryCents: e.salaryCents, note: e.note })),
          parttime: pt.map(e => ({ employeeId: e.employeeId, hourlyCents: e.hourlyCents, note: e.note,
            shifts: e.shifts.map(s => ({ date: s.date, startMin: s.startMin, endMin: s.endMin, breakMin: s.breakMin, note: s.note })) })),
        }),
      })
      if (!res.ok) throw new Error('儲存失敗')
      setMsg('已儲存（刪除的班表已記錄於 LOG）')
      return true
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '儲存失敗')
      return false
    }
  }

  async function importToPL() {
    const target = `${year}/${String(month).padStart(2, '0')}`
    const count = ft.length + pt.length
    if (!confirm(`將 ${target} 的薪資明細（共 ${count} 筆、合計 ${fmtCurrency(ftTotal + ptTotal)}）匯入 ${target} 損益表的「人事薪資」？\n\n• 會先儲存本頁目前的編輯內容\n• 損益表中先前由薪資匯入的列會被取代\n• 手動輸入的列不受影響`)) return
    setImporting(true)
    setShowMonthlyLink(false)
    try {
      if (!(await save())) return
      const res = await fetch('/api/pl/import/payroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '匯入失敗')
      if (data.imported === 0) {
        setMsg(data.message || '沒有可匯入的薪資資料')
      } else {
        const warning = data.manualCount > 0
          ? `；另有 ${data.manualCount} 筆手動輸入的人事薪資，請確認是否重複。`
          : ''
        setMsg(`已匯入 ${data.imported} 筆至 ${target} 損益表（合計 ${fmtCurrency(data.totalCents)}）${warning}`)
        setShowMonthlyLink(true)
      }
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  async function carry() {
    if (!confirm('帶入上一期薪資資料（正職月薪、兼職時薪）？兼職每日工時不複製。將覆蓋本月。')) return
    const res = await fetch('/api/payroll/carry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month }) })
    const d = await res.json()
    setMsg(d.from ? `已帶入 ${d.from}（${d.copied} 筆）` : (d.message || '查無上一期')); load()
  }

  async function doImportRoster(file: File, mode: 'replace' | 'append') {
    setImportMsg('匯入中...')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    const res = await fetch(`/api/payroll/import?year=${year}&month=${month}`, { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok) { setImportMsg(`已匯入 ${d.imported} 筆，合計 ${fmtCurrency(d.totalCents)}`); loadRoster() }
    else setImportMsg(d.error || '匯入失敗')
    if (fileRef.current) fileRef.current.value = ''
    if (appendRef.current) appendRef.current.value = ''
  }

  async function deleteRosterRow(id: number, name: string) {
    if (!confirm(`刪除撥款名單「${name}」？此動作會記錄於 LOG。`)) return
    await fetch(`/api/payroll/roster?id=${id}`, { method: 'DELETE' })
    loadRoster()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">薪資管理</h1>
          <p className="text-sm text-slate-500 mt-1">匯入撥款名單、每月 KEY IN 薪資與班表；設定完成後至薪資工作台審批。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payroll/workbench" className="btn-secondary">薪資工作台 →</Link>
          <button onClick={() => setShowAdd(v => !v)} className="btn-secondary">＋ 新增員工</button>
        </div>
      </div>

      {showAdd && <AddEmployee onDone={() => { setShowAdd(false); load() }} />}

      {/* 期別列：年月 + 上一月/下一月 + 新增新月份 */}
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">年</label><input className="input-sm w-24" type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} /></div>
        <div><label className="label">月</label><input className="input-sm w-20" type="number" min={1} max={12} value={month} onChange={e => setMonth(Math.min(12, Math.max(1, parseInt(e.target.value) || month)))} /></div>
        <div className="flex flex-col gap-1">
          <span className="label">切換月份</span>
          <div className="flex gap-1">
            <button onClick={() => goMonth(-1)} className="btn-secondary px-2" title="上一月">▲ 上一月</button>
            <button onClick={() => goMonth(1)} className="btn-secondary px-2" title="下一月">▼ 下一月</button>
          </div>
        </div>
        <button onClick={() => setShowNewMonth(true)} className="btn-primary">＋ 新增新月份</button>
        <button onClick={importToPL} disabled={importing} className="btn-secondary">
          {importing ? '匯入中…' : `⇩ 匯入至 ${year}/${month} 損益表`}
        </button>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-400">本月薪資合計（正職 + 兼職）</div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{fmtCurrency(ftTotal + ptTotal)}</div>
        </div>
      </div>

      {showNewMonth && <NewMonth year={year} month={month} onClose={() => setShowNewMonth(false)}
        onDone={(y, m) => { setShowNewMonth(false); setYear(y); setMonth(m); setMsg(`已建立 ${y}/${String(m).padStart(2, '0')} 期別`) }} />}

      {/* 分頁 */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {([['keyin', '每月 KEY IN'], ['source', '薪資資料來源']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === k ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'source' && (
        <div className="card mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-slate-700">撥款名單（{year}/{String(month).padStart(2, '0')}）</h2>
              <p className="text-xs text-slate-400 mt-0.5">格式：姓名 · 入帳金額 · 身分證號 · 入帳帳號 · 受款人E-Mail · 公司（支援 .xlsx / .csv）</p>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) doImportRoster(f, 'replace') }} />
              <input ref={appendRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) doImportRoster(f, 'append') }} />
              <button onClick={() => fileRef.current?.click()} className="btn-primary">⇪ 匯入（覆蓋本月）</button>
              <button onClick={() => appendRef.current?.click()} className="btn-secondary">＋ 附加</button>
            </div>
          </div>
          {importMsg && <div className="text-sm text-emerald-600 mb-2">{importMsg}</div>}
          {roster.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">尚無撥款名單，請匯入 Excel / CSV 檔案。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                    <th className="py-2 pr-2">姓名</th><th className="py-2 pr-2">公司</th>
                    <th className="py-2 pr-2 text-right">入帳金額</th><th className="py-2 pr-2">帳號</th>
                    <th className="py-2 pr-2">身分證號</th><th className="py-2 pr-2">E-Mail</th><th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(r => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{r.name}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{r.company || '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-800">{fmtCurrency(r.amountCents)}</td>
                      <td className="py-1.5 pr-2 text-slate-500 tabular-nums">{r.bankAccount || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-500 tabular-nums">{r.idNumber || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-500 truncate max-w-[160px]">{r.email || '—'}</td>
                      <td className="py-1.5"><button onClick={() => deleteRosterRow(r.id, r.name)} className="btn-danger" title="刪除（記錄於 LOG）">✕</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-2" colSpan={2}>合計 {roster.length} 人</td>
                    <td className="py-2 text-right tabular-nums text-emerald-700">{fmtCurrency(rosterTotal)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'keyin' && (loading ? <div className="card text-center py-10 text-slate-400">載入中...</div> : (
        <>
          <div className="card mb-4 flex flex-wrap items-center gap-3">
            <button onClick={carry} className="btn-secondary">↻ 帶入上一期</button>
            <span className="text-xs text-slate-400">正職月薪與年度漲幅、PT 兼職以行事曆計薪。</span>
          </div>

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
                    <MoneyInput className="input-sm col-span-6 md:col-span-3"
                      cents={e.salaryCents} onChange={c => setFt(s => s.map(x => x.cid === e.cid ? { ...x, salaryCents: c } : x))} />
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

          {/* 兼職 + 行事曆 */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700">PT 兼職 <span className="text-xs text-slate-400">合計 {fmtCurrency(ptTotal)}</span></h2>
              <AddPicker label="加入兼職" options={availPT} onPick={addPT} />
            </div>
            <div className="space-y-3">
              {pt.map(e => {
                const mins = totalMinutes(e.shifts)
                const pay = parttimePayCents(e.hourlyCents, e.shifts)
                const addDay = (date: string) => setPt(st => st.map(x => x.cid === e.cid
                  ? { ...x, open: true, shifts: [...x.shifts, { cid: cid(), date, startMin: DEF_START, endMin: DEF_END, breakMin: DEF_BREAK, note: '' }] }
                  : x))
                return (
                  <div key={e.cid} className="ring-1 ring-slate-200 rounded-xl p-3">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 md:col-span-3 font-medium text-slate-800">{e.name}</div>
                      <div className="col-span-7 md:col-span-3 flex items-center gap-1">
                        <span className="text-xs text-slate-400">時薪</span>
                        <MoneyInput className="input-sm"
                          cents={e.hourlyCents} onChange={c => setPt(s => s.map(x => x.cid === e.cid ? { ...x, hourlyCents: c } : x))} />
                      </div>
                      <div className="col-span-6 md:col-span-3 text-sm text-slate-500 tabular-nums">{(mins / 60).toFixed(1)} 小時</div>
                      <div className="col-span-5 md:col-span-2 text-right font-bold text-emerald-700 tabular-nums">{fmtCurrency(pay)}</div>
                      <button onClick={() => setPt(s => s.filter(x => x.cid !== e.cid))} className="btn-danger col-span-1">✕</button>
                    </div>
                    <button onClick={() => setPt(s => s.map(x => x.cid === e.cid ? { ...x, open: !x.open } : x))} className="btn-ghost mt-1 text-xs">
                      {e.open ? '▾ 收合班表' : `▸ 展開班表（${e.shifts.length} 天）`}
                    </button>
                    {e.open && (
                      <div className="mt-3 space-y-3">
                        <ShiftCalendar year={year} month={month} shifts={e.shifts} onAddDay={addDay} />
                        <p className="text-[11px] text-slate-400">點行事曆日期即新增一筆班次（預設 09:00–18:00、休息 60 分），可於下方調整或刪除。刪除後儲存即記錄於 LOG。</p>
                        <div className="space-y-1.5">
                          <div className="hidden md:grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold text-slate-400 uppercase">
                            <div className="col-span-3">日期</div><div className="col-span-2">上班</div><div className="col-span-2">下班</div>
                            <div className="col-span-2">休息(分)</div><div className="col-span-2">時數</div>
                          </div>
                          {[...e.shifts].sort((a, b) => a.date.localeCompare(b.date)).map(s => {
                            const h = (shiftMinutes(s) / 60).toFixed(2)
                            const setShift = (patch: Partial<ShiftR>) => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: x.shifts.map(z => z.cid === s.cid ? { ...z, ...patch } : z) } : x))
                            return (
                              <div key={s.cid} className="grid grid-cols-12 gap-2 items-center">
                                <input className="input-sm col-span-4 md:col-span-3" type="date" value={s.date} onChange={ev => setShift({ date: ev.target.value })} />
                                <input className="input-sm col-span-3 md:col-span-2" type="time" value={minToTime(s.startMin)} onChange={ev => setShift({ startMin: timeToMin(ev.target.value) })} />
                                <input className="input-sm col-span-3 md:col-span-2" type="time" value={minToTime(s.endMin)} onChange={ev => setShift({ endMin: timeToMin(ev.target.value) })} />
                                <input className="input-sm col-span-2 md:col-span-2 text-right tabular-nums" type="number" value={s.breakMin} onChange={ev => setShift({ breakMin: parseInt(ev.target.value) || 0 })} />
                                <div className="col-span-1 md:col-span-2 text-sm text-slate-500 tabular-nums">{h}h</div>
                                <button onClick={() => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: x.shifts.filter(z => z.cid !== s.cid) } : x))} className="btn-danger col-span-1" title="刪除班次（儲存後記錄於 LOG）">✕</button>
                              </div>
                            )
                          })}
                          {e.shifts.length === 0 && <div className="text-center py-3 text-slate-400 text-xs">點上方行事曆日期即可新增班次</div>}
                          <button onClick={() => setPt(st => st.map(x => x.cid === e.cid ? { ...x, shifts: [...x.shifts, { cid: cid(), date: '', startMin: 0, endMin: 0, breakMin: 0, note: '' }] } : x))}
                            className="btn-ghost text-emerald-600 text-xs">＋ 手動新增一天</button>
                        </div>
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
            {showMonthlyLink && <Link className="text-sm text-emerald-700 underline" href={`/monthly/${year}/${month}`}>開啟損益表</Link>}
          </div>
        </>
      ))}
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

function NewMonth({ year, month, onClose, onDone }: { year: number; month: number; onClose: () => void; onDone: (y: number, m: number) => void }) {
  const next = stepMonth(year, month, 1)
  const [y, setY] = useState(next.year)
  const [m, setM] = useState(next.month)
  const [carry, setCarry] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true); setErr('')
    const res = await fetch('/api/payroll/period', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: y, month: m, carry }) })
    const d = await res.json()
    setBusy(false)
    if (res.ok) onDone(y, m)
    else setErr(d.error || '建立失敗')
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 mb-3">新增新月份</h3>
        <div className="flex gap-3 mb-3">
          <div className="flex-1"><label className="label">年</label><input className="input-sm w-full" type="number" value={y} onChange={e => setY(parseInt(e.target.value) || y)} /></div>
          <div className="flex-1"><label className="label">月</label><input className="input-sm w-full" type="number" min={1} max={12} value={m} onChange={e => setM(Math.min(12, Math.max(1, parseInt(e.target.value) || m)))} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-4">
          <input type="checkbox" checked={carry} onChange={e => setCarry(e.target.checked)} />
          帶入上一期員工（正職月薪 / 兼職時薪）
        </label>
        {err && <div className="text-sm text-rose-600 mb-2">{err}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button onClick={create} disabled={busy} className="btn-primary">{busy ? '建立中...' : '建立期別'}</button>
        </div>
      </div>
    </div>
  )
}

function AddEmployee({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('FULLTIME')
  const [amountCents, setAmountCents] = useState(0)
  const [err, setErr] = useState('')
  async function create() {
    if (!name.trim()) { setErr('請輸入姓名'); return }
    const body = type === 'FULLTIME'
      ? { name, type, defaultSalaryCents: amountCents }
      : { name, type, defaultHourlyCents: amountCents }
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
          <MoneyInput className="input-sm w-32" cents={amountCents} onChange={setAmountCents} /></div>
        <button onClick={create} className="btn-primary">建立</button>
        {err && <span className="text-sm text-rose-600">{err}</span>}
      </div>
      <p className="text-xs text-slate-400 mt-2">PT 兼職姓名僅需建立一次，之後即可在各月份直接選用。</p>
    </div>
  )
}
