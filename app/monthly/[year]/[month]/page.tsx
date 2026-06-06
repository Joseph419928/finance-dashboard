import { prisma } from '@/lib/db'
import PLForm from '@/components/PLForm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { calcNetProfit, getStatusColor, type MonthlyPL, type LineItem } from '@/lib/types'
import { fmtCurrency } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

interface Props { params: { year: string; month: string } }

export default async function EditMonthPage({ params }: Props) {
  const year = parseInt(params.year)
  const month = parseInt(params.month)
  if (isNaN(year) || isNaN(month)) notFound()

  const record = await prisma.monthlyPL.findUnique({
    where: { year_month: { year, month } },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!record) notFound()

  const netProfit = calcNetProfit(record as unknown as MonthlyPL)

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
          <span className={`text-sm font-semibold tabular-nums ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            損益：{fmtCurrency(netProfit)}
          </span>
        </div>
      </div>
      <PLForm record={record as unknown as MonthlyPL & { lineItems: LineItem[] }} />
    </div>
  )
}
