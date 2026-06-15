import { prisma } from '@/lib/db'
import DashboardClient from '@/components/DashboardClient'
import {
  calcRevenue, calcCOGS, calcGrossProfit, calcOpex, calcOperatingIncome,
  calcNetIncome, calcTotalExpenses, calcFixedCost, calcVariableCost,
  grossMargin, operatingMargin, netMargin, type MonthlyPL,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/** YoY/MoM 成長率：baseline 為 0 時回傳 null（不可除以零）。 */
function growth(current: number, baseline: number): number | null {
  return baseline !== 0 ? (current - baseline) / baseline : null
}

export default async function DashboardPage() {
  const records = await prisma.monthlyPL.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  }) as unknown as MonthlyPL[]

  const sum = (f: (r: MonthlyPL) => number) => records.reduce((a, r) => a + f(r), 0)

  const totalRevenue = sum(calcRevenue)
  const totalCOGS = sum(calcCOGS)
  const totalGrossProfit = sum(calcGrossProfit)
  const totalOpex = sum(calcOpex)
  const totalOperatingIncome = sum(calcOperatingIncome)
  const totalNetProfit = sum(calcNetIncome)
  const totalExpenses = sum(calcTotalExpenses)

  // 三率（以加總基礎）
  const aggGrossMargin = totalRevenue > 0 ? totalGrossProfit / totalRevenue : 0
  const aggOperatingMargin = totalRevenue > 0 ? totalOperatingIncome / totalRevenue : 0
  const aggNetMargin = totalRevenue > 0 ? totalNetProfit / totalRevenue : 0

  // 平均月淨利率（各月平均）
  const margins = records.filter(r => calcRevenue(r) > 0).map(netMargin)
  const avgMargin = margins.length > 0 ? margins.reduce((a, m) => a + m, 0) / margins.length : 0

  // 損益兩平點（加總固定/變動成本）
  const totalFixedCost = sum(calcFixedCost)
  const totalVariableCost = sum(calcVariableCost)
  const varRate = totalRevenue > 0 ? totalVariableCost / totalRevenue : 0
  const bep = totalRevenue > 0 && 1 - varRate > 0 ? Math.round(totalFixedCost / (1 - varRate)) : null

  const sorted = [...records].sort((a, b) => calcNetIncome(b) - calcNetIncome(a))

  const monthlyTrend = records.map(r => ({
    label: `${r.year}/${String(r.month).padStart(2, '0')}`,
    revenue: calcRevenue(r), budget: r.revenueBudget,
    cogs: calcCOGS(r), opex: calcOpex(r),
    grossProfit: calcGrossProfit(r), operatingIncome: calcOperatingIncome(r),
    netProfit: calcNetIncome(r), expenses: calcTotalExpenses(r),
    grossMargin: grossMargin(r), operatingMargin: operatingMargin(r), netMargin: netMargin(r),
    status: r.status, year: r.year, month: r.month,
  }))

  // 費用結構（依性質；F4 移除股東提撥、F2 分出營業成本）
  const expenseBreakdown = {
    營業成本: totalCOGS,
    薪資費用: sum(r => r.payrollTotal),
    租金費用: sum(r => r.fixedTotal),
    折舊費用: sum(r => r.depreciationTotal),
    營業費用: sum(r => r.operatingTotal),
    中區支出: sum(r => r.centralTotal),
    營業外費用: sum(r => r.nonOperatingTotal),
  }

  // 現金流量三分類（簡化估列）
  const totalDepreciation = sum(r => r.depreciationTotal)
  const totalFinancingPrincipal = sum(r => r.financingPrincipalTotal)
  const totalShareholder = sum(r => r.shareholderTotal)
  const cashflow = {
    operating: totalNetProfit + totalDepreciation, // 本期淨利 + 折舊(非現金) 加回
    investing: 0, // 尚未追蹤資本支出（待 FixedAsset 導入）
    financing: -(totalFinancingPrincipal + totalShareholder), // 本金償還 + 股東提撥（流出）
  }

  // YoY / MoM（以最新月份為當期）
  const latest = records[records.length - 1] ?? null
  let yoy: { revenue: number | null; netProfit: number | null } | null = null
  let mom: { revenue: number | null; netProfit: number | null } | null = null
  if (latest) {
    const prevYear = records.find(r => r.year === latest.year - 1 && r.month === latest.month)
    const prevIdx = records.length - 2
    const prevMonth = prevIdx >= 0 ? records[prevIdx] : null
    if (prevYear) yoy = { revenue: growth(calcRevenue(latest), calcRevenue(prevYear)), netProfit: growth(calcNetIncome(latest), calcNetIncome(prevYear)) }
    if (prevMonth) mom = { revenue: growth(calcRevenue(latest), calcRevenue(prevMonth)), netProfit: growth(calcNetIncome(latest), calcNetIncome(prevMonth)) }
  }

  // 股東報酬
  const shareholderReturn = {
    total: totalShareholder,
    shareOfNet: totalNetProfit > 0 ? totalShareholder / totalNetProfit : null,
  }

  return (
    <DashboardClient
      totalRevenue={totalRevenue}
      totalExpenses={totalExpenses}
      totalNetProfit={totalNetProfit}
      totalGrossProfit={totalGrossProfit}
      totalOperatingIncome={totalOperatingIncome}
      avgMargin={avgMargin}
      aggGrossMargin={aggGrossMargin}
      aggOperatingMargin={aggOperatingMargin}
      aggNetMargin={aggNetMargin}
      bep={bep}
      cashflow={cashflow}
      yoy={yoy}
      mom={mom}
      shareholderReturn={shareholderReturn}
      latestLabel={latest ? `${latest.year}/${String(latest.month).padStart(2, '0')}` : null}
      monthlyTrend={monthlyTrend}
      expenseBreakdown={expenseBreakdown}
      bestMonth={sorted[0] ? { year: sorted[0].year, month: sorted[0].month, profit: calcNetIncome(sorted[0]) } : null}
      worstMonth={sorted.length > 0 ? { year: sorted[sorted.length - 1].year, month: sorted[sorted.length - 1].month, profit: calcNetIncome(sorted[sorted.length - 1]) } : null}
      recordCount={records.length}
    />
  )
}
