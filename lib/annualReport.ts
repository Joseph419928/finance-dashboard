// 年度損益表資料來源：優先使用 AnnualPLLine 快照（忠實重現匯入的 Excel，如 2025）；
// 若該年度沒有快照，改由 MonthlyPL + LineItem 自動彙總而成（唯讀計算，不寫入資料庫）。
import { prisma } from './db'
import { categoryDef, type Category } from './categories'
import {
  calcRevenue, calcGrossProfit, calcOpex, calcOperatingIncome,
  calcPretaxIncome, calcIncomeTax, calcNetIncome,
  grossMargin, type MonthlyPL,
} from './types'

export interface AnnualReportRow {
  subject: string
  months: number[] // 12 個月，皆為「分」(整數)
  total: number // 「分」
  isSubtotal: boolean
  isHeader: boolean // 純區段標題列（無資料，不可與資料列混淆）
  isPct: boolean
  indent: number
}

export interface AnnualReportResult {
  year: number
  source: 'snapshot' | 'aggregated'
  rows: AnnualReportRow[]
}

const ZERO_MONTHS = () => new Array<number>(12).fill(0)

/** 可選年度：AnnualPLLine 快照年度 ∪ MonthlyPL 有資料的年度，兩者聯集、由新到舊排序。 */
export async function getAvailableReportYears(): Promise<number[]> {
  const [snapshotYears, monthlyYears] = await Promise.all([
    prisma.annualPLLine.findMany({ distinct: ['year'], select: { year: true } }),
    prisma.monthlyPL.findMany({ distinct: ['year'], select: { year: true } }),
  ])
  const years = new Set<number>([
    ...snapshotYears.map(r => r.year),
    ...monthlyYears.map(r => r.year),
  ])
  return Array.from(years).sort((a, b) => b - a)
}

function fromSnapshot(lines: Awaited<ReturnType<typeof prisma.annualPLLine.findMany>>): AnnualReportRow[] {
  const n = (v: bigint) => Number(v)
  return lines.map(l => {
    const months = [l.m1, l.m2, l.m3, l.m4, l.m5, l.m6, l.m7, l.m8, l.m9, l.m10, l.m11, l.m12].map(n)
    const total = n(l.total)
    const isHeader = !l.isSubtotal && total === 0 && months.every(v => v === 0)
    return {
      subject: l.subject, months, total,
      isSubtotal: l.isSubtotal, isHeader, isPct: l.subject.includes('率'), indent: l.indent,
    }
  })
}

/** 依分類彙總該年度每月損益的細項 (LineItem)，同一分類/名稱之金額逐月加總。 */
function aggregateLeafRows(category: Category, monthRecords: (MonthlyPLRow | undefined)[]): AnnualReportRow[] {
  const order: string[] = []
  const sums = new Map<string, number[]>()
  monthRecords.forEach((rec, i) => {
    if (!rec) return
    for (const li of rec.lineItems) {
      if (li.category !== category) continue
      if (!sums.has(li.label)) { sums.set(li.label, ZERO_MONTHS()); order.push(li.label) }
      sums.get(li.label)![i] += li.amountCents
    }
  })
  return order.map(label => {
    const months = sums.get(label)!
    return {
      subject: label, months, total: months.reduce((a, b) => a + b, 0),
      isSubtotal: false, isHeader: false, isPct: false, indent: 1,
    }
  })
}

type MonthlyPLRow = MonthlyPL & { lineItems: { category: string; label: string; amountCents: number }[] }

function sumPL(records: (MonthlyPLRow | undefined)[]): Partial<MonthlyPL> {
  const fields: (keyof MonthlyPL)[] = [
    'revenueActual', 'revenueAccrual', 'procurementTotal', 'payrollTotal', 'fixedTotal',
    'operatingTotal', 'centralTotal', 'depreciationTotal', 'nonOperatingTotal',
    'nonOperatingIncomeTotal', 'incomeTaxCents',
  ]
  const out: Partial<MonthlyPL> = {}
  for (const f of fields) {
    out[f] = records.reduce((a, r) => a + (r ? Number((r as unknown as Record<string, number>)[f] ?? 0) : 0), 0) as never
  }
  return out
}

async function fromMonthlyAggregation(year: number): Promise<AnnualReportRow[]> {
  const raw = await prisma.monthlyPL.findMany({
    where: { year }, include: { lineItems: true }, orderBy: { month: 'asc' },
  }) as unknown as MonthlyPLRow[]
  if (raw.length === 0) return []
  const byMonth = new Map<number, MonthlyPLRow>()
  for (const r of raw) byMonth.set(r.month, r)
  const monthRecords = Array.from({ length: 12 }, (_, i) => byMonth.get(i + 1))

  const rows: AnnualReportRow[] = []
  const annualSum = sumPL(monthRecords)

  // 營業收入（損益表本體營收，權責認列為準；無明細分項）
  const revenueMonths = monthRecords.map(r => calcRevenue(r ?? {}))
  rows.push({
    subject: '營業收入', months: revenueMonths, total: calcRevenue(annualSum),
    isSubtotal: false, isHeader: false, isPct: false, indent: 0,
  })

  // 減：營業成本
  const cogsLeaves = aggregateLeafRows('PROCUREMENT', monthRecords)
  if (cogsLeaves.length > 0) {
    rows.push(headerRow(categoryDef('PROCUREMENT')!.standardName, 'Cost of Goods Sold'))
    rows.push(...cogsLeaves)
  }
  rows.push(subtotalRow('營業毛利 (Gross Profit)', monthRecords.map(r => calcGrossProfit(r ?? {})), calcGrossProfit(annualSum)))
  rows.push(subtotalRow('營業毛利率 (Gross Profit Margin)', monthRecords.map(r => grossMargin(r ?? {}) * 10000), grossMargin(annualSum) * 10000, true))

  // 減：營業費用（人事、固定支出、營業費用、中區支出、折舊）
  const opexCategories: Category[] = ['PAYROLL', 'FIXED', 'OPERATING', 'CENTRAL', 'DEPRECIATION']
  const opexLeaves = opexCategories.map(c => aggregateLeafRows(c, monthRecords)).flat()
  rows.push(headerRow('營業費用', 'Operating Expenses'))
  rows.push(...opexLeaves)
  rows.push(subtotalRow('營業費用合計', monthRecords.map(r => calcOpex(r ?? {})), calcOpex(annualSum)))
  rows.push(subtotalRow('營業淨利 (Operating Income)', monthRecords.map(r => calcOperatingIncome(r ?? {})), calcOperatingIncome(annualSum)))

  // 減：營業外支出／加：營業外收入
  const nonOpExpenseLeaves = aggregateLeafRows('NON_OPERATING', monthRecords)
  const nonOpIncomeLeaves = aggregateLeafRows('NON_OPERATING_INCOME', monthRecords)
  if (nonOpExpenseLeaves.length > 0) {
    rows.push(headerRow('營業外支出', 'Non-Operating'))
    rows.push(...nonOpExpenseLeaves)
  }
  if (nonOpIncomeLeaves.length > 0) {
    rows.push(headerRow('營業外收入', 'Non-Operating Income'))
    rows.push(...nonOpIncomeLeaves)
  }
  rows.push(subtotalRow('稅前淨利 (Pre-Tax Income)', monthRecords.map(r => calcPretaxIncome(r ?? {})), calcPretaxIncome(annualSum)))

  // 減：所得稅費用
  const taxMonths = monthRecords.map(r => calcIncomeTax(r ?? {}))
  if (taxMonths.some(v => v !== 0)) {
    rows.push({
      subject: '減：所得稅費用', months: taxMonths, total: calcIncomeTax(annualSum),
      isSubtotal: false, isHeader: false, isPct: false, indent: 0,
    })
  }
  rows.push(subtotalRow('稅後淨利 (Net Income)', monthRecords.map(r => calcNetIncome(r ?? {})), calcNetIncome(annualSum)))

  return rows
}

function headerRow(name: string, english: string): AnnualReportRow {
  return {
    subject: `減：${name} (${english})`, months: ZERO_MONTHS(), total: 0,
    isSubtotal: false, isHeader: true, isPct: false, indent: 0,
  }
}

function subtotalRow(subject: string, months: number[], total: number, isPct = false): AnnualReportRow {
  return { subject, months, total, isSubtotal: true, isHeader: false, isPct, indent: 0 }
}

export async function buildAnnualReport(year: number): Promise<AnnualReportResult> {
  const snapshot = await prisma.annualPLLine.findMany({
    where: { year }, orderBy: { sortOrder: 'asc' },
  })
  if (snapshot.length > 0) {
    return { year, source: 'snapshot', rows: fromSnapshot(snapshot) }
  }
  return { year, source: 'aggregated', rows: await fromMonthlyAggregation(year) }
}
