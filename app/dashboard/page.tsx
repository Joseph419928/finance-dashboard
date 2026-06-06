import { prisma } from '@/lib/db'
import DashboardClient from '@/components/DashboardClient'
import { calcTotalExpenses, calcNetProfit, type MonthlyPL } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const records = await prisma.monthlyPL.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  }) as unknown as MonthlyPL[]

  const sum = (f: (r: MonthlyPL) => number) => records.reduce((a, r) => a + f(r), 0)

  const totalRevenue = sum(r => r.revenueActual)
  const totalExpenses = sum(r => calcTotalExpenses(r))
  const totalNetProfit = totalRevenue - totalExpenses

  const margins = records.filter(r => r.revenueActual > 0).map(r => calcNetProfit(r) / r.revenueActual)
  const avgMargin = margins.length > 0 ? margins.reduce((a, m) => a + m, 0) / margins.length : 0

  const sorted = [...records].sort((a, b) => calcNetProfit(b) - calcNetProfit(a))

  const monthlyTrend = records.map(r => ({
    label: `${r.year}/${String(r.month).padStart(2, '0')}`,
    revenue: r.revenueActual, budget: r.revenueBudget,
    expenses: calcTotalExpenses(r), netProfit: calcNetProfit(r),
    status: r.status, year: r.year, month: r.month,
  }))

  const expenseBreakdown = {
    採購款: sum(r => r.procurementTotal),
    人事薪資: sum(r => r.payrollTotal),
    固定支出: sum(r => r.fixedTotal),
    營業費用: sum(r => r.operatingTotal),
    中區支出: sum(r => r.centralTotal),
    營業外費用: sum(r => r.nonOperatingTotal),
    股東提撥: sum(r => r.shareholderTotal),
  }

  return (
    <DashboardClient
      totalRevenue={totalRevenue}
      totalExpenses={totalExpenses}
      totalNetProfit={totalNetProfit}
      avgMargin={avgMargin}
      monthlyTrend={monthlyTrend}
      expenseBreakdown={expenseBreakdown}
      bestMonth={sorted[0] ? { year: sorted[0].year, month: sorted[0].month, profit: calcNetProfit(sorted[0]) } : null}
      worstMonth={sorted.length > 0 ? { year: sorted[sorted.length - 1].year, month: sorted[sorted.length - 1].month, profit: calcNetProfit(sorted[sorted.length - 1]) } : null}
      recordCount={records.length}
    />
  )
}
