'use client'
import { useEffect, useState } from 'react'
import { fmtCurrency, fmtPct } from '@/lib/formatters'
import type { PeriodSummary, PeriodComparison } from '@/lib/types'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

interface PeriodRef { year: number; month: number; label: string }

interface Props {
  current: PeriodSummary
  periods: PeriodRef[]
  initialCmp: string // '', 'yoy', or 'YYYY-MM'
}

interface CompareResult {
  current: PeriodSummary
  baseline: PeriodSummary | null
  comparison: PeriodComparison | null
}

const CMP_STORAGE_KEY = 'fy_monthly_cmp_mode'
const PIE_COLORS = ['#ef4444','#3b82f6','#f59e0b','#8b5cf6','#10b981','#06b6d4','#f97316']

export default function MonthlySummaryCharts({ current, periods, initialCmp }: Props) {
  const [cmpMode, setCmpMode] = useState(initialCmp)
  const [baseline, setBaseline] = useState<PeriodSummary | null>(null)
  const [comparison, setComparison] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  // 初次掛載：若無 URL 指定，沿用上次偏好（localStorage）。
  useEffect(() => {
    if (!initialCmp) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(CMP_STORAGE_KEY) : null
      if (saved) setCmpMode(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(CMP_STORAGE_KEY, cmpMode)
    // 同步 URL query（不重新導頁）
    const url = new URL(window.location.href)
    if (cmpMode) url.searchParams.set('cmp', cmpMode)
    else url.searchParams.delete('cmp')
    window.history.replaceState(null, '', url.toString())

    if (!cmpMode) { setBaseline(null); setComparison(null); setNotice(''); return }

    let cmpYear: number, cmpMonth: number
    if (cmpMode === 'yoy') {
      cmpYear = current.year - 1; cmpMonth = current.month
    } else {
      const [y, m] = cmpMode.split('-').map(Number)
      if (!y || !m) { setBaseline(null); setComparison(null); return }
      cmpYear = y; cmpMonth = m
    }

    setLoading(true); setNotice('')
    const q = `year=${current.year}&month=${current.month}&cmpYear=${cmpYear}&cmpMonth=${cmpMonth}`
    fetch(`/api/monthly/compare?${q}`)
      .then(r => r.json())
      .then((data: CompareResult) => {
        if (data.baseline && data.comparison) {
          setBaseline(data.baseline); setComparison(data.comparison); setNotice('')
        } else {
          setBaseline(null); setComparison(null)
          setNotice(`比較期 ${cmpYear}/${String(cmpMonth).padStart(2, '0')} 無資料，已顯示單期視圖。`)
        }
      })
      .catch(() => { setBaseline(null); setComparison(null); setNotice('讀取比較期失敗，已顯示單期視圖。') })
      .finally(() => setLoading(false))
  }, [cmpMode, current.year, current.month])

  // ── 損益瀑布圖 ──
  const wf = buildWaterfall(current)
  const waterfallData = {
    labels: wf.labels,
    datasets: [{ label: '損益結構', data: wf.ranges, backgroundColor: wf.colors, borderRadius: 4 }],
  }

  // ── 費用結構 ──
  const expLabels = Object.keys(current.expenseBreakdown)
  const expValues = Object.values(current.expenseBreakdown)
  const expenseData = { labels: expLabels, datasets: [{ data: expValues, backgroundColor: PIE_COLORS, borderWidth: 0 }] }

  // ── 期間比較分層長條 ──
  const cmpLayers: { key: keyof PeriodComparison; label: string }[] = [
    { key: 'revenue', label: '營業收入' },
    { key: 'grossProfit', label: '營業毛利' },
    { key: 'operatingIncome', label: '營業淨利' },
    { key: 'pretaxIncome', label: '稅前淨利' },
    { key: 'netIncome', label: '本期淨利' },
  ]
  const compareBarData = comparison ? {
    labels: cmpLayers.map(l => l.label),
    datasets: [
      { label: current.label, data: cmpLayers.map(l => comparison[l.key].current), backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 4 },
      { label: baseline?.label ?? '比較期', data: cmpLayers.map(l => comparison[l.key].baseline), backgroundColor: 'rgba(148,163,184,0.6)', borderRadius: 4 },
    ],
  } : null

  const budgetDiff = current.revenue - current.revenueBudget

  return (
    <div className="space-y-5">
      {/* 比較模式選擇器 */}
      <div className="card flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">期間比較</span>
        <select className="input-field max-w-[200px]" value={cmpMode} onChange={e => setCmpMode(e.target.value)}>
          <option value="">不比較（僅本期）</option>
          <option value="yoy">去年同期（{current.year - 1}/{String(current.month).padStart(2, '0')}）</option>
          <optgroup label="自選某期">
            {periods.filter(p => !(p.year === current.year && p.month === current.month)).map(p => (
              <option key={p.label} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </optgroup>
        </select>
        {loading && <span className="text-xs text-slate-400">讀取比較期…</span>}
        {notice && <span className="text-xs text-amber-600">{notice}</span>}
      </div>

      {/* 三率卡 + 預算對比 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RateCard label="毛利率" value={fmtPct(current.grossMargin)} amount={fmtCurrency(current.grossProfit)} tone={current.grossMargin >= 0 ? 'emerald' : 'rose'} />
        <RateCard label="營業利益率" value={fmtPct(current.operatingMargin)} amount={fmtCurrency(current.operatingIncome)} tone={current.operatingMargin >= 0 ? 'emerald' : 'rose'} />
        <RateCard label="淨利率" value={fmtPct(current.netMargin)} amount={fmtCurrency(current.netIncome)} tone={current.netMargin >= 0 ? 'emerald' : 'rose'} />
        <RateCard
          label="預算 vs 實際營收"
          value={`${budgetDiff >= 0 ? '+' : ''}${fmtCurrency(budgetDiff)}`}
          amount={`實際 ${fmtCurrency(current.revenue)} / 預算 ${fmtCurrency(current.revenueBudget)}`}
          tone={budgetDiff >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 瀑布圖 */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">損益瀑布圖（{current.label}）</h3>
          <div className="h-72">
            <Bar data={waterfallData} options={{
              responsive: true, maintainAspectRatio: false,
              scales: { y: { ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } } },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx: { raw: unknown }) => {
                  const range = ctx.raw as [number, number]
                  return ` ${fmtCurrency(Math.abs(range[1] - range[0]))}`
                } } },
              },
            }} />
          </div>
        </div>

        {/* 費用結構 */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">費用結構（依性質）</h3>
          {expValues.some(v => v > 0) ? (
            <div className="h-72">
              <Doughnut data={expenseData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right' as const, labels: { boxWidth: 12, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (ctx: { label: string; raw: unknown }) => ` ${ctx.label}: ${fmtCurrency(Number(ctx.raw))}` } },
                },
              }} />
            </div>
          ) : <div className="flex items-center justify-center h-72 text-slate-400 text-sm">本期無費用資料</div>}
        </div>
      </div>

      {/* 期間比較 */}
      {comparison && baseline && compareBarData && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            本期 vs 比較期（{current.label} vs {baseline.label}）
          </h3>
          <div className="h-64 mb-4">
            <Bar data={compareBarData} options={{
              responsive: true, maintainAspectRatio: false,
              scales: { y: { ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } } },
              plugins: { legend: { position: 'top' as const } },
            }} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase">
                  <th className="text-left px-2 py-2">損益層級</th>
                  <th className="text-right px-2 py-2">本期 {current.label}</th>
                  <th className="text-right px-2 py-2">比較期 {baseline.label}</th>
                  <th className="text-right px-2 py-2">差異額</th>
                  <th className="text-right px-2 py-2">差異率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cmpLayers.map(l => {
                  const c = comparison[l.key]
                  const up = c.diff >= 0
                  return (
                    <tr key={l.key} className="hover:bg-slate-50/60">
                      <td className="px-2 py-2 font-medium text-slate-700">{l.label}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtCurrency(c.current)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{fmtCurrency(c.baseline)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {up ? '+' : ''}{fmtCurrency(c.diff)}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {c.pct === null ? '—' : `${c.pct >= 0 ? '+' : ''}${(c.pct * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** 以浮動長條 [start,end] 建構損益瀑布圖。 */
function buildWaterfall(s: PeriodSummary): { labels: string[]; ranges: [number, number][]; colors: string[] } {
  const labels: string[] = []
  const ranges: [number, number][] = []
  const colors: string[] = []
  const IN = 'rgba(16,185,129,0.8)', OUT = 'rgba(239,68,68,0.8)', SUB = 'rgba(71,85,105,0.85)'

  let run = 0
  const flow = (label: string, delta: number) => {
    labels.push(label); ranges.push([run, run + delta]); colors.push(delta >= 0 ? IN : OUT); run += delta
  }
  const subtotal = (label: string) => { labels.push(label); ranges.push([0, run]); colors.push(SUB) }

  flow('營業收入', s.revenue)
  flow('營業成本', -s.cogs)
  subtotal('營業毛利')
  flow('營業費用', -s.opex)
  subtotal('營業淨利')
  flow('營業外淨額', s.nonOperatingNet)
  subtotal('稅前淨利')
  flow('所得稅', -s.incomeTax)
  subtotal('本期淨利')

  return { labels, ranges, colors }
}

function RateCard({ label, value, amount, tone }: { label: string; value: string; amount: string; tone: string }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 ring-emerald-200 text-emerald-700',
    rose: 'bg-rose-50 ring-rose-200 text-rose-700',
  }
  return (
    <div className={`rounded-xl ring-1 px-4 py-3 ${map[tone] ?? map.emerald}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] opacity-60 mt-0.5">{amount}</div>
    </div>
  )
}
