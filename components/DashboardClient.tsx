'use client'
import { fmtCurrency, fmtPct } from '@/lib/formatters'
import { getStatusColor } from '@/lib/types'
import Link from 'next/link'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend)

interface MonthRow {
  label: string; revenue: number; budget: number; cogs: number; opex: number
  grossProfit: number; operatingIncome: number; netProfit: number; expenses: number
  grossMargin: number; operatingMargin: number; netMargin: number
  status: string; year: number; month: number
}

interface Growth { revenue: number | null; netProfit: number | null }

interface Props {
  totalRevenue: number; totalExpenses: number; totalNetProfit: number
  totalGrossProfit: number; totalOperatingIncome: number
  avgMargin: number; aggGrossMargin: number; aggOperatingMargin: number; aggNetMargin: number
  bep: number | null
  cashflow: { operating: number; investing: number; financing: number }
  yoy: Growth | null; mom: Growth | null
  shareholderReturn: { total: number; shareOfNet: number | null }
  latestLabel: string | null
  monthlyTrend: MonthRow[]; expenseBreakdown: Record<string, number>
  bestMonth: { year: number; month: number; profit: number } | null
  worstMonth: { year: number; month: number; profit: number } | null
  recordCount: number
}

const PIE_COLORS = ['#ef4444','#3b82f6','#f59e0b','#8b5cf6','#10b981','#06b6d4','#f97316']

function fmtGrowth(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

export default function DashboardClient(props: Props) {
  const {
    totalRevenue, totalExpenses, totalNetProfit, totalGrossProfit, totalOperatingIncome,
    avgMargin, aggGrossMargin, aggOperatingMargin, aggNetMargin, bep, cashflow,
    yoy, mom, shareholderReturn, latestLabel, monthlyTrend, expenseBreakdown,
    bestMonth, worstMonth, recordCount,
  } = props

  const labels = monthlyTrend.map(r => r.label)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revenueChartData: any = {
    labels,
    datasets: [
      { type: 'bar', label: '營業收入', data: monthlyTrend.map(r => r.revenue), backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, order: 2 },
      { type: 'bar', label: '預算營收', data: monthlyTrend.map(r => r.budget), backgroundColor: 'rgba(148,163,184,0.4)', borderRadius: 6, order: 3 },
      { type: 'line', label: '本期淨利', data: monthlyTrend.map(r => r.netProfit), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointBackgroundColor: '#ef4444', tension: 0.4, fill: false, yAxisID: 'y1', order: 1 },
    ],
  }

  // 三率趨勢
  const marginChartData = {
    labels,
    datasets: [
      { label: '毛利率', data: monthlyTrend.map(r => +(r.grossMargin * 100).toFixed(1)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: false },
      { label: '營業利益率', data: monthlyTrend.map(r => +(r.operatingMargin * 100).toFixed(1)), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, fill: false },
      { label: '淨利率', data: monthlyTrend.map(r => +(r.netMargin * 100).toFixed(1)), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: false },
    ],
  }

  const expenseLabels = Object.keys(expenseBreakdown)
  const expenseValues = Object.values(expenseBreakdown)
  const expenseChartData = {
    labels: expenseLabels,
    datasets: [{ data: expenseValues, backgroundColor: PIE_COLORS, borderWidth: 0 }],
  }

  // 現金流量三分類
  const cashflowChartData = {
    labels: ['營業活動', '投資活動', '融資活動'],
    datasets: [{
      label: '現金流量',
      data: [cashflow.operating, cashflow.investing, cashflow.financing],
      backgroundColor: [
        cashflow.operating >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)',
        cashflow.investing >= 0 ? 'rgba(59,130,246,0.7)' : 'rgba(239,68,68,0.7)',
        cashflow.financing >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)',
      ],
      borderRadius: 6,
    }],
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">損益控管儀表板</h1>
          <p className="text-sm text-slate-500 mt-1">共 {recordCount} 個月份資料</p>
        </div>
        <Link href="/monthly/new" className="btn-primary">+ 新增月份</Link>
      </div>

      {/* 三率 + 核心 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="累計營業收入" value={fmtCurrency(totalRevenue)} sub="權責認列" color="green" icon="💰" />
        <KPICard title="營業毛利率" value={fmtPct(aggGrossMargin)} sub={`毛利 ${fmtCurrency(totalGrossProfit)}`} color={aggGrossMargin >= 0.2 ? 'green' : aggGrossMargin >= 0 ? 'amber' : 'red'} icon="📊" />
        <KPICard title="營業利益率" value={fmtPct(aggOperatingMargin)} sub={`營業淨利 ${fmtCurrency(totalOperatingIncome)}`} color={aggOperatingMargin >= 0.1 ? 'green' : aggOperatingMargin >= 0 ? 'amber' : 'red'} icon="🏭" />
        <KPICard title="淨利率" value={fmtPct(aggNetMargin)} sub={`本期淨利 ${fmtCurrency(totalNetProfit)}`} color={totalNetProfit >= 0 ? 'green' : 'red'} icon={totalNetProfit >= 0 ? '📈' : '📉'} />
      </div>

      {/* 損益兩平點 + 成長率 + 股東報酬 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="損益兩平點(營收)" value={bep !== null ? fmtCurrency(bep) : '—'} sub={bep !== null && totalRevenue >= bep ? '✅ 已越過損益兩平' : '⚠️ 尚未達損益兩平'} color={bep !== null && totalRevenue >= bep ? 'green' : 'amber'} icon="⚖️" />
        <KPICard title={`營收成長 ${latestLabel ?? ''}`} value={fmtGrowth(yoy?.revenue ?? null)} sub={`YoY · MoM ${fmtGrowth(mom?.revenue ?? null)}`} color={(yoy?.revenue ?? 0) >= 0 ? 'green' : 'red'} icon="🚀" />
        <KPICard title={`淨利成長 ${latestLabel ?? ''}`} value={fmtGrowth(yoy?.netProfit ?? null)} sub={`YoY · MoM ${fmtGrowth(mom?.netProfit ?? null)}`} color={(yoy?.netProfit ?? 0) >= 0 ? 'green' : 'red'} icon="🎯" />
        <KPICard title="累計股東提撥" value={fmtCurrency(shareholderReturn.total)} sub={shareholderReturn.shareOfNet !== null ? `占淨利 ${fmtPct(shareholderReturn.shareOfNet)}` : '占淨利 —'} color="blue" icon="👤" />
      </div>

      {(bestMonth || worstMonth) && (
        <div className="grid grid-cols-2 gap-4">
          {bestMonth && (
            <div className="card border-l-4 border-green-500 bg-green-50 py-4">
              <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">最佳月份（本期淨利）</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{bestMonth.year}/{String(bestMonth.month).padStart(2,'0')}</div>
              <div className="text-sm text-green-600 font-medium">{fmtCurrency(bestMonth.profit)}</div>
            </div>
          )}
          {worstMonth && (
            <div className="card border-l-4 border-red-400 bg-red-50 py-4">
              <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">最差月份（本期淨利）</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{worstMonth.year}/{String(worstMonth.month).padStart(2,'0')}</div>
              <div className={`text-sm font-medium ${worstMonth.profit < 0 ? 'text-red-600' : 'text-amber-600'}`}>{fmtCurrency(worstMonth.profit)}</div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="text-base font-semibold text-slate-700 mb-4">月營收 vs 預算 vs 本期淨利</h2>
        {monthlyTrend.length > 0 ? (
          <div className="h-72">
            <Bar data={revenueChartData} options={{
              responsive: true, maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true, ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } },
                y1: { beginAtZero: false, position: 'right' as const, grid: { drawOnChartArea: false }, ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } },
              },
              plugins: { legend: { position: 'top' as const } },
            }} />
          </div>
        ) : <EmptyState />}
      </div>

      {/* 三率趨勢 + 現金流量三分類 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-slate-700 mb-4">三率趨勢（毛利率 / 營業利益率 / 淨利率）</h2>
          {monthlyTrend.length > 0 ? (
            <div className="h-64">
              <Line data={marginChartData} options={{
                responsive: true, maintainAspectRatio: false,
                scales: { y: { ticks: { callback: (v: unknown) => `${Number(v).toFixed(0)}%` } } },
                plugins: { legend: { position: 'top' as const } },
              }} />
            </div>
          ) : <EmptyState />}
        </div>
        <div className="card">
          <h2 className="text-base font-semibold text-slate-700 mb-1">現金流量三分類</h2>
          <p className="text-xs text-slate-400 mb-3">營業活動 = 本期淨利＋折舊；融資活動 = −(本金償還＋股東提撥)；投資活動待資本支出追蹤導入。</p>
          {monthlyTrend.length > 0 ? (
            <div className="h-56">
              <Bar data={cashflowChartData} options={{
                responsive: true, maintainAspectRatio: false,
                scales: { y: { ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { raw: unknown }) => ` ${fmtCurrency(Number(ctx.raw))}` } } },
              }} />
            </div>
          ) : <EmptyState />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-slate-700 mb-4">費用結構分布（依性質，不含股東提撥）</h2>
          {expenseValues.some(v => v > 0) ? (
            <div className="h-64">
              <Doughnut data={expenseChartData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right' as const, labels: { boxWidth: 12, font: { size: 11 } } },
                  tooltip: { callbacks: { label: (ctx: { label: string; raw: unknown }) => ` ${ctx.label}: ${fmtCurrency(Number(ctx.raw))}` } },
                },
              }} />
            </div>
          ) : <EmptyState />}
        </div>
        <div className="card">
          <h2 className="text-base font-semibold text-slate-700 mb-4">月本期淨利趨勢</h2>
          {monthlyTrend.length > 0 ? (
            <div className="h-64">
              <Line data={{
                labels,
                datasets: [{
                  label: '本期淨利',
                  data: monthlyTrend.map(r => r.netProfit),
                  borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
                  fill: true, tension: 0.4,
                  pointBackgroundColor: monthlyTrend.map(r => r.netProfit >= 0 ? '#22c55e' : '#ef4444'),
                  pointRadius: 5,
                }],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                scales: { y: { ticks: { callback: (v: unknown) => fmtCurrency(Number(v), true) } } },
                plugins: { legend: { display: false } },
              }} />
            </div>
          ) : <EmptyState />}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">月份損益明細</h2>
        </div>
        {monthlyTrend.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-2 py-3 text-xs font-semibold text-gray-500 uppercase">月份</th>
                  <th className="table-header">營業收入</th>
                  <th className="table-header">營業毛利</th>
                  <th className="table-header">毛利率</th>
                  <th className="table-header">營業淨利</th>
                  <th className="table-header">本期淨利</th>
                  <th className="table-header">淨利率</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-center">狀態</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...monthlyTrend].reverse().map((r) => (
                  <tr key={r.label} className="hover:bg-slate-50 transition">
                    <td className="px-2 py-3 font-medium text-slate-800">{r.label}</td>
                    <td className="table-cell text-slate-700">{fmtCurrency(r.revenue)}</td>
                    <td className="table-cell text-slate-700">{fmtCurrency(r.grossProfit)}</td>
                    <td className={`table-cell ${r.grossMargin >= 0.2 ? 'text-green-600' : r.grossMargin >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{fmtPct(r.grossMargin)}</td>
                    <td className="table-cell text-slate-700">{fmtCurrency(r.operatingIncome)}</td>
                    <td className={`table-cell font-semibold ${r.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtCurrency(r.netProfit)}</td>
                    <td className={`table-cell ${r.netMargin >= 0.1 ? 'text-green-600' : r.netMargin >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{fmtPct(r.netMargin)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.status && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(r.status)}`}>{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/monthly/${r.year}/${r.month}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">編輯</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-2 py-3 font-bold text-slate-800 text-sm">合計</td>
                  <td className="table-cell font-bold text-slate-800">{fmtCurrency(totalRevenue)}</td>
                  <td className="table-cell font-bold text-slate-800">{fmtCurrency(totalGrossProfit)}</td>
                  <td className="table-cell font-bold text-slate-600">{fmtPct(aggGrossMargin)}</td>
                  <td className="table-cell font-bold text-slate-800">{fmtCurrency(totalOperatingIncome)}</td>
                  <td className={`table-cell font-bold text-base ${totalNetProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtCurrency(totalNetProfit)}</td>
                  <td className={`table-cell font-bold ${aggNetMargin >= 0.1 ? 'text-green-600' : aggNetMargin >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{fmtPct(aggNetMargin)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-400 mt-3">累計總成本費用：{fmtCurrency(totalExpenses)}（含營業成本、營業費用、營業外淨額、所得稅）；平均月淨利率 {fmtPct(avgMargin)}。</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500 mb-3">尚未有財務資料</p>
            <Link href="/monthly/new" className="btn-primary">新增第一筆月份資料</Link>
          </div>
        )}
      </div>
    </div>
  )
}

function KPICard({ title, value, sub, color, icon }: {
  title: string; value: string; sub: string; color: string; icon: string
}) {
  const colorMap: Record<string, string> = {
    green: 'border-green-500 bg-green-50',
    red: 'border-red-400 bg-red-50',
    amber: 'border-amber-400 bg-amber-50',
    blue: 'border-blue-400 bg-blue-50',
  }
  return (
    <div className={`card border-l-4 ${colorMap[color] ?? colorMap.blue} py-4`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
          <div className="text-xl font-bold text-slate-800 mt-1 leading-tight">{value}</div>
          <div className="text-xs text-slate-500 mt-1">{sub}</div>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
      無資料可顯示
    </div>
  )
}
