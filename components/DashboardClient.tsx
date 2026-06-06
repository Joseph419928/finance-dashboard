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
  label: string; revenue: number; budget: number; expenses: number; netProfit: number
  status: string; year: number; month: number
}

interface Props {
  totalRevenue: number; totalExpenses: number; totalNetProfit: number; avgMargin: number
  monthlyTrend: MonthRow[]; expenseBreakdown: Record<string, number>
  bestMonth: { year: number; month: number; profit: number } | null
  worstMonth: { year: number; month: number; profit: number } | null
  recordCount: number
}

const PIE_COLORS = ['#3b82f6','#f59e0b','#ef4444','#10b981','#8b5cf6','#f97316','#06b6d4']

export default function DashboardClient({
  totalRevenue, totalExpenses, totalNetProfit, avgMargin,
  monthlyTrend, expenseBreakdown, bestMonth, worstMonth, recordCount
}: Props) {
  const labels = monthlyTrend.map(r => r.label)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revenueChartData: any = {
    labels,
    datasets: [
      { type: 'bar', label: '實際營收', data: monthlyTrend.map(r => r.revenue), backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 6, order: 2 },
      { type: 'bar', label: '預算營收', data: monthlyTrend.map(r => r.budget), backgroundColor: 'rgba(148,163,184,0.4)', borderRadius: 6, order: 3 },
      { type: 'line', label: '本期損益', data: monthlyTrend.map(r => r.netProfit), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', pointBackgroundColor: '#ef4444', tension: 0.4, fill: false, yAxisID: 'y1', order: 1 },
    ],
  }

  const expenseLabels = Object.keys(expenseBreakdown)
  const expenseValues = Object.values(expenseBreakdown)

  const expenseChartData = {
    labels: expenseLabels,
    datasets: [{ data: expenseValues, backgroundColor: PIE_COLORS, borderWidth: 0 }],
  }

  const profitPct = totalRevenue > 0 ? totalNetProfit / totalRevenue : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">損益控管儀表板</h1>
          <p className="text-sm text-slate-500 mt-1">共 {recordCount} 個月份資料</p>
        </div>
        <Link href="/monthly/new" className="btn-primary">+ 新增月份</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="累計營業收入" value={fmtCurrency(totalRevenue)} sub="所有月份加總" color="green" icon="💰" />
        <KPICard title="累計總支出" value={fmtCurrency(totalExpenses)} sub="含採購、薪資、固定、其他" color="red" icon="📤" />
        <KPICard title="累計淨損益" value={fmtCurrency(totalNetProfit)} sub={`利潤率 ${fmtPct(profitPct)}`} color={totalNetProfit >= 0 ? 'green' : 'red'} icon={totalNetProfit >= 0 ? '📈' : '📉'} />
        <KPICard title="平均月淨利率" value={fmtPct(avgMargin)} sub={`最佳：${bestMonth ? `${bestMonth.year}/${String(bestMonth.month).padStart(2,'0')}` : '-'}`} color={avgMargin >= 0.05 ? 'green' : avgMargin >= 0 ? 'amber' : 'red'} icon="🎯" />
      </div>

      {(bestMonth || worstMonth) && (
        <div className="grid grid-cols-2 gap-4">
          {bestMonth && (
            <div className="card border-l-4 border-green-500 bg-green-50 py-4">
              <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">最佳月份</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{bestMonth.year}/{String(bestMonth.month).padStart(2,'0')}</div>
              <div className="text-sm text-green-600 font-medium">{fmtCurrency(bestMonth.profit)}</div>
            </div>
          )}
          {worstMonth && (
            <div className="card border-l-4 border-red-400 bg-red-50 py-4">
              <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">最差月份</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{worstMonth.year}/{String(worstMonth.month).padStart(2,'0')}</div>
              <div className={`text-sm font-medium ${worstMonth.profit < 0 ? 'text-red-600' : 'text-amber-600'}`}>{fmtCurrency(worstMonth.profit)}</div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="text-base font-semibold text-slate-700 mb-4">月營收 vs 預算 vs 損益</h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-slate-700 mb-4">費用結構分布</h2>
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
          <h2 className="text-base font-semibold text-slate-700 mb-4">月損益趨勢</h2>
          {monthlyTrend.length > 0 ? (
            <div className="h-64">
              <Line data={{
                labels,
                datasets: [{
                  label: '月淨損益',
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
                  <th className="table-header">實際營收</th>
                  <th className="table-header">預算</th>
                  <th className="table-header">達成率</th>
                  <th className="table-header">總支出</th>
                  <th className="table-header">淨損益</th>
                  <th className="table-header">淨利率</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-center">狀態</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyTrend.map((r) => {
                  const achieve = r.budget > 0 ? r.revenue / r.budget : 0
                  const margin = r.revenue > 0 ? r.netProfit / r.revenue : 0
                  return (
                    <tr key={r.label} className="hover:bg-slate-50 transition">
                      <td className="px-2 py-3 font-medium text-slate-800">{r.label}</td>
                      <td className="table-cell text-slate-700">{fmtCurrency(r.revenue)}</td>
                      <td className="table-cell text-slate-500">{fmtCurrency(r.budget)}</td>
                      <td className={`table-cell font-medium ${achieve >= 1 ? 'text-green-600' : achieve >= 0.85 ? 'text-amber-600' : 'text-red-500'}`}>
                        {fmtPct(achieve)}
                      </td>
                      <td className="table-cell text-slate-700">{fmtCurrency(r.expenses)}</td>
                      <td className={`table-cell font-semibold ${r.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtCurrency(r.netProfit)}
                      </td>
                      <td className={`table-cell ${margin >= 0.1 ? 'text-green-600' : margin >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                        {fmtPct(margin)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.status && (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(r.status)}`}>
                            {r.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/monthly/${r.year}/${r.month}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          編輯
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-2 py-3 font-bold text-slate-800 text-sm">合計</td>
                  <td className="table-cell font-bold text-slate-800">{fmtCurrency(totalRevenue)}</td>
                  <td colSpan={2}></td>
                  <td className="table-cell font-bold text-slate-800">{fmtCurrency(totalExpenses)}</td>
                  <td className={`table-cell font-bold text-base ${totalNetProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmtCurrency(totalNetProfit)}
                  </td>
                  <td className={`table-cell font-bold ${profitPct >= 0.1 ? 'text-green-600' : profitPct >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                    {fmtPct(profitPct)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
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
