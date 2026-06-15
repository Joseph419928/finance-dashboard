import { prisma } from '@/lib/db'
import Link from 'next/link'
import { calcRevenue, calcTotalExpenses, calcNetIncome, getStatusColor, type MonthlyPL } from '@/lib/types'
import { fmtCurrency, fmtPct } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

export default async function MonthlyPage() {
  const records = await prisma.monthlyPL.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  }) as unknown as MonthlyPL[]

  const years = Array.from(new Set(records.map(r => r.year))).sort((a, b) => b - a)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">每月損益表</h1>
          <p className="text-sm text-slate-500 mt-1">點擊月份可展開編輯各分類細項</p>
        </div>
        <Link href="/monthly/new" className="btn-primary">＋ 新增月份</Link>
      </div>

      {records.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-500 text-lg mb-4">尚無月份資料</p>
          <Link href="/monthly/new" className="btn-primary">新增第一筆月份</Link>
        </div>
      ) : (
        years.map(year => {
          const rows = records.filter(r => r.year === year)
          return (
            <div key={year} className="mb-6">
              <h2 className="text-sm font-bold text-slate-500 mb-2 px-1">{year} 年度</h2>
              <div className="card-flush">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th text-left">月份</th>
                      <th className="th-r">營業收入</th>
                      <th className="th-r">預算</th>
                      <th className="th-r">達成率</th>
                      <th className="th-r">總支出</th>
                      <th className="th-r">淨損益</th>
                      <th className="th-r">淨利率</th>
                      <th className="th text-center">狀態</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(r => {
                      const revenue = calcRevenue(r)
                      const expenses = calcTotalExpenses(r)
                      const profit = calcNetIncome(r)
                      const achieve = r.revenueBudget > 0 ? revenue / r.revenueBudget : 0
                      const margin = revenue > 0 ? profit / revenue : 0
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition">
                          <td className="td font-semibold text-slate-800">{r.year}/{String(r.month).padStart(2, '0')}</td>
                          <td className="td-r text-slate-700">{fmtCurrency(revenue)}</td>
                          <td className="td-r text-slate-400">{fmtCurrency(r.revenueBudget)}</td>
                          <td className={`td-r font-medium ${achieve >= 1 ? 'text-emerald-600' : achieve >= 0.85 ? 'text-amber-600' : 'text-rose-500'}`}>
                            {r.revenueBudget > 0 ? fmtPct(achieve) : '—'}
                          </td>
                          <td className="td-r text-slate-700">{fmtCurrency(expenses)}</td>
                          <td className={`td-r font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtCurrency(profit)}</td>
                          <td className={`td-r ${margin >= 0.1 ? 'text-emerald-600' : margin >= 0 ? 'text-amber-600' : 'text-rose-500'}`}>
                            {revenue > 0 ? fmtPct(margin) : '—'}
                          </td>
                          <td className="td text-center">
                            {r.status && <span className={`badge ${getStatusColor(r.status)}`}>{r.status}</span>}
                          </td>
                          <td className="td text-right">
                            <Link href={`/monthly/${r.year}/${r.month}`} className="text-emerald-600 hover:text-emerald-800 font-medium">編輯 →</Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
