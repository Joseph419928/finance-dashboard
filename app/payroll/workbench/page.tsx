'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtCurrency } from '@/lib/formatters'

interface Period { id: number; year: number; month: number; status: string; approver: string; approvedAt: string | null; note: string }
interface RosterRow { id: number; name: string; amountCents: number; company: string }
interface LogRow { id: number; year: number; month: number; action: string; employeeName: string; detail: string; actor: string; createdAt: string }

const STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', SUBMITTED: '待審批', APPROVED: '已核准' }
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
}
const ACTION_LABEL: Record<string, string> = {
  CREATE_PERIOD: '新增期別', IMPORT_ROSTER: '匯入名單', DELETE_ROSTER: '刪除名單',
  DELETE_SHIFT: '刪除班表', SUBMIT: '送審', APPROVE: '核准', REOPEN: '退回草稿',
}
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDT = (s: string | null) => (s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '—')

export default function WorkbenchPage() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [sel, setSel] = useState<{ year: number; month: number } | null>(null)
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [rosterTotal, setRosterTotal] = useState(0)
  const [payrollTotal, setPayrollTotal] = useState(0)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [approver, setApprover] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const loadPeriods = useCallback(async () => {
    const res = await fetch('/api/payroll/period')
    const d = await res.json()
    const ps: Period[] = d.periods || []
    setPeriods(ps)
    // 預設顯示最新一期；若無期別則放空。
    setSel(prev => prev ?? (d.latest ? { year: d.latest.year, month: d.latest.month } : null))
    setLoading(false)
  }, [])

  const loadDetail = useCallback(async (year: number, month: number) => {
    const [rRes, pRes, lRes] = await Promise.all([
      fetch(`/api/payroll/roster?year=${year}&month=${month}`),
      fetch(`/api/payroll?year=${year}&month=${month}`),
      fetch(`/api/payroll/log?year=${year}&month=${month}`),
    ])
    const r = await rRes.json(); const p = await pRes.json(); const l = await lRes.json()
    setRoster(r.rows || []); setRosterTotal(r.totalCents || 0)
    setPayrollTotal(p.totals?.grandTotal || 0)
    setLogs(l.logs || [])
  }, [])

  useEffect(() => { loadPeriods() }, [loadPeriods])
  useEffect(() => { if (sel) loadDetail(sel.year, sel.month) }, [sel, loadDetail])

  const current = sel ? periods.find(p => p.year === sel.year && p.month === sel.month) : undefined
  const status = current?.status || 'DRAFT'

  async function act(action: 'submit' | 'approve' | 'reopen') {
    if (!sel) return
    if (action === 'approve' && !approver.trim()) { setMsg('請先填寫核准人'); return }
    setMsg('處理中...')
    const res = await fetch('/api/payroll/period/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: sel.year, month: sel.month, action, actor: approver.trim() }),
    })
    const d = await res.json()
    if (res.ok) { setMsg('已更新'); await loadPeriods(); await loadDetail(sel.year, sel.month) }
    else setMsg(d.error || '操作失敗')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">薪資工作台</h1>
          <p className="text-sm text-slate-500 mt-1">審批各期薪資。預設顯示最新一期；無期別時為空白。</p>
        </div>
        <Link href="/payroll" className="btn-secondary">← 薪資管理</Link>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-slate-400">載入中...</div>
      ) : periods.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          尚無薪資期別。請先至 <Link href="/payroll" className="text-emerald-600 underline">薪資管理</Link> 以「＋ 新增新月份」建立一期。
        </div>
      ) : (
        <>
          <div className="card mb-4 flex flex-wrap items-center gap-3">
            <label className="label">選擇期別</label>
            <select className="input-sm w-40" value={sel ? `${sel.year}-${sel.month}` : ''}
              onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setSel({ year: y, month: m }) }}>
              {periods.map(p => (
                <option key={p.id} value={`${p.year}-${p.month}`}>{p.year}/{pad(p.month)}（{STATUS_LABEL[p.status] || p.status}）</option>
              ))}
            </select>
            {current && <span className={`badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status] || status}</span>}
          </div>

          {sel && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="card">
                  <div className="text-xs text-slate-400">撥款名單合計（{roster.length} 人）</div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{fmtCurrency(rosterTotal)}</div>
                </div>
                <div className="card">
                  <div className="text-xs text-slate-400">薪資明細合計（正職＋兼職）</div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{fmtCurrency(payrollTotal)}</div>
                </div>
                <div className="card">
                  <div className="text-xs text-slate-400">核准資訊</div>
                  <div className="text-sm text-slate-700 mt-1">{current?.approver || '—'}</div>
                  <div className="text-xs text-slate-400">{fmtDT(current?.approvedAt || null)}</div>
                </div>
              </div>

              {/* 審批動作 */}
              <div className="card mb-4">
                <h2 className="font-semibold text-slate-700 mb-3">審批</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <div><label className="label">核准人</label><input className="input-sm w-40" value={approver} onChange={e => setApprover(e.target.value)} placeholder="姓名" /></div>
                  <button onClick={() => act('submit')} disabled={status !== 'DRAFT'} className="btn-secondary disabled:opacity-40">送審</button>
                  <button onClick={() => act('approve')} disabled={status !== 'SUBMITTED'} className="btn-primary disabled:opacity-40">核准</button>
                  <button onClick={() => act('reopen')} disabled={status === 'DRAFT'} className="btn-ghost text-rose-600 disabled:opacity-40">退回草稿</button>
                  {msg && <span className="text-sm text-emerald-600">{msg}</span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">流程：草稿 → 送審 → 已核准。核准後會鎖定審批狀態並記錄核准人與時間；退回可重新編輯。</p>
              </div>

              {/* 撥款名單摘要 */}
              <div className="card mb-4">
                <h2 className="font-semibold text-slate-700 mb-3">撥款名單（{sel.year}/{pad(sel.month)}）</h2>
                {roster.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">此期尚無撥款名單。可至薪資管理 → 薪資資料來源匯入。</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-100">
                          <th className="py-2 pr-2">姓名</th><th className="py-2 pr-2">公司</th><th className="py-2 text-right">入帳金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map(r => (
                          <tr key={r.id} className="border-b border-slate-50">
                            <td className="py-1.5 pr-2 font-medium text-slate-800">{r.name}</td>
                            <td className="py-1.5 pr-2 text-slate-500">{r.company || '—'}</td>
                            <td className="py-1.5 text-right tabular-nums">{fmtCurrency(r.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 font-semibold">
                          <td className="py-2" colSpan={2}>合計</td>
                          <td className="py-2 text-right tabular-nums text-emerald-700">{fmtCurrency(rosterTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* 操作紀錄 LOG */}
              <div className="card">
                <h2 className="font-semibold text-slate-700 mb-3">操作紀錄（LOG）</h2>
                {logs.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">尚無紀錄</div>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map(l => (
                      <div key={l.id} className="flex items-center gap-3 text-sm border-b border-slate-50 pb-1.5">
                        <span className="badge bg-slate-100 text-slate-600 shrink-0">{ACTION_LABEL[l.action] || l.action}</span>
                        <span className="text-slate-700 flex-1">{l.detail}{l.employeeName ? `（${l.employeeName}）` : ''}</span>
                        <span className="text-xs text-slate-400 shrink-0 tabular-nums">{fmtDT(l.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
