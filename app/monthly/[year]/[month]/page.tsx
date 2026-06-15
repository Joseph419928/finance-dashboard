import { prisma } from '@/lib/db'
import PLForm from '@/components/PLForm'
import MonthlySummaryCharts from '@/components/MonthlySummaryCharts'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { calcNetIncome, summarizePeriod, getStatusColor, type MonthlyPL, type LineItem } from '@/lib/types'
import { fmtCurrency } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

interface Props {
  params: { year: string; month: string }
  searchParams: { cmp?: string }
}

export default async function EditMonthPage({ params, searchParams }: Props) {
  const year = parseInt(params.year)
  const month = parseInt(params.month)
  if (isNaN(year) || isNaN(month)) notFound()

  const record = await prisma.monthlyPL.findUnique({
    where: { year_month: { year, month } },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!record) notFound()

  const plRecord = record as unknown as MonthlyPL
  const netIncome = calcNetIncome(plRecord)
  const summary = summarizePeriod(plRecord)

  // 可供「自選某期」比較的期間清單
  const all = await prisma.monthlyPL.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })
  const periods = all.map(p => ({ year: p.year, month: p.month, label: `${p.year}/${String(p.month).padStart(2, '0')}` }))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/monthly" className="text-slate-400 hover:text-slate-600 text-sm">← 返回列表</Link>
      </div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">
          {year}/{String(month).padStart(2, '0')} 損益編輯
        </h1>
        <div className="flex items-center gap-3">
          {record.status && (
            <span className={`badge ${getStatusColor(record.status)}`}>{record.status}</span>
          )}
          <span className={`text-sm font-semibold tabular-nums ${netIncome >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            本期淨利：{fmtCurrency(netIncome)}
          </span>
        </div>
      </div>

      {/* F11：每月結算圖表 + 期間比較 */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-700 mb-3">本月結算圖表</h2>
        <MonthlySummaryCharts current={summary} periods={periods} initialCmp={searchParams.cmp ?? ''} />
      </section>

      <PLForm record={record as unknown as MonthlyPL & { lineItems: LineItem[] }} />
    </div>
  )
}
