// 金額單位皆為「分」(整數)。損益分層計算之單一資料來源。
import { CATEGORIES, type Category, type StatementGroup } from './categories'
import type { LineSource } from './lineSource'

export interface LineItem {
  id: number
  monthlyPLId: number
  category: Category
  label: string
  amountCents: number
  note: string
  /** 成本中心（地區/據點），第二維度分析用，不影響損益層級。F8 */
  costCenter: string
  sortOrder: number
  source: LineSource
}

export interface MonthlyPL {
  id: number
  year: number
  month: number
  revenueBudget: number
  revenueFaceVal: number
  bankBalance: number
  notes: string
  status: string

  // 營收（權責 vs 現金雙軌，F1）
  revenueActual: number // REVENUE 明細加總 = 現金回收（輔助）
  revenueAccrual: number // 權責認列營業收入（損益表本體營收）
  arBalance: number // 期末應收帳款（輔助）
  apBalance: number // 期末應付帳款（輔助）

  // 分類總額快取（= 對應 LineItem 加總）
  procurementTotal: number
  payrollTotal: number
  fixedTotal: number
  operatingTotal: number
  centralTotal: number
  depreciationTotal: number
  nonOperatingTotal: number
  nonOperatingIncomeTotal: number
  financingPrincipalTotal: number
  shareholderTotal: number

  // 所得稅費用（F3）
  incomeTaxCents: number

  createdAt: string
  updatedAt: string
  lineItems?: LineItem[]
}

type NumRecord = Record<string, number>

function fieldVal(pl: Partial<MonthlyPL>, field: string): number {
  return (pl as NumRecord)[field] ?? 0
}

/** 某損益群組總額（= 該群組各分類 totalField 加總）。 */
function sumGroup(pl: Partial<MonthlyPL>, group: StatementGroup): number {
  return CATEGORIES.filter(c => c.statementGroup === group)
    .reduce((s, c) => s + fieldVal(pl, c.totalField), 0)
}

// ── 損益表分層（商業會計處理準則第 31 條）────────────────────────────────

/** 損益表營收：以權責認列數為準；為 0 時回退現金回收數以相容舊資料（F1）。 */
export function calcRevenue(pl: Partial<MonthlyPL>): number {
  const accrual = pl.revenueAccrual ?? 0
  return accrual !== 0 ? accrual : (pl.revenueActual ?? 0)
}

/** 現金回收數（REVENUE 明細加總，輔助/現金流量參考）。 */
export function calcRevenueCash(pl: Partial<MonthlyPL>): number {
  return pl.revenueActual ?? 0
}

/** 營業成本（COGS 群組加總，F2）。 */
export function calcCOGS(pl: Partial<MonthlyPL>): number {
  return sumGroup(pl, 'COGS')
}

/** 營業毛利 = 營收 − 營業成本（必要小計，F2）。 */
export function calcGrossProfit(pl: Partial<MonthlyPL>): number {
  return calcRevenue(pl) - calcCOGS(pl)
}

/** 營業費用（OPEX 群組加總，F2）。 */
export function calcOpex(pl: Partial<MonthlyPL>): number {
  return sumGroup(pl, 'OPEX')
}

/** 營業淨利(損) = 營業毛利 − 營業費用（必要小計，F3）。 */
export function calcOperatingIncome(pl: Partial<MonthlyPL>): number {
  return calcGrossProfit(pl) - calcOpex(pl)
}

/** 營業外收入（NON_OP_INCOME 群組加總）。 */
export function calcNonOpIncome(pl: Partial<MonthlyPL>): number {
  return sumGroup(pl, 'NON_OP_INCOME')
}

/** 營業外費用（NON_OP_EXPENSE 群組加總）。 */
export function calcNonOpExpense(pl: Partial<MonthlyPL>): number {
  return sumGroup(pl, 'NON_OP_EXPENSE')
}

/** 營業外淨額 = 營業外收入 − 營業外費用（F3、F5）。 */
export function calcNonOperatingNet(pl: Partial<MonthlyPL>): number {
  return calcNonOpIncome(pl) - calcNonOpExpense(pl)
}

/** 稅前淨利(損) = 營業淨利 + 營業外淨額（必要小計，F3）。 */
export function calcPretaxIncome(pl: Partial<MonthlyPL>): number {
  return calcOperatingIncome(pl) + calcNonOperatingNet(pl)
}

/** 所得稅費用（F3）。 */
export function calcIncomeTax(pl: Partial<MonthlyPL>): number {
  return pl.incomeTaxCents ?? 0
}

/** 本期淨利(損) = 稅前淨利 − 所得稅費用（必要小計，F3）。 */
export function calcNetIncome(pl: Partial<MonthlyPL>): number {
  return calcPretaxIncome(pl) - calcIncomeTax(pl)
}

/** 相容別名：舊呼叫端的「淨損益」即本期淨利。不再扣股東提撥（F4）。 */
export function calcNetProfit(pl: Partial<MonthlyPL>): number {
  return calcNetIncome(pl)
}

/**
 * 總成本費用（= 營收 − 本期淨利）。供儀表板/列表沿用「營收 − 總支出 = 淨利」之識別式，
 * 涵蓋營業成本 + 營業費用 + 營業外淨額 + 所得稅，且不會重複加總。
 */
export function calcTotalExpenses(pl: Partial<MonthlyPL>): number {
  return calcRevenue(pl) - calcNetIncome(pl)
}

/**
 * 本期淨利後之可動用現金 = 本期淨利 − 股東提撥（F4）。
 * 屬損益表「下方」之盈餘分配，非損益表本體。
 */
export function calcDisposable(pl: Partial<MonthlyPL>): number {
  return calcNetIncome(pl) - (pl.shareholderTotal ?? 0)
}

// ── 三率（F10）────────────────────────────────────────────────────────

export function grossMargin(pl: Partial<MonthlyPL>): number {
  const rev = calcRevenue(pl)
  return rev > 0 ? calcGrossProfit(pl) / rev : 0
}
export function operatingMargin(pl: Partial<MonthlyPL>): number {
  const rev = calcRevenue(pl)
  return rev > 0 ? calcOperatingIncome(pl) / rev : 0
}
export function netMargin(pl: Partial<MonthlyPL>): number {
  const rev = calcRevenue(pl)
  return rev > 0 ? calcNetIncome(pl) / rev : 0
}

// ── 成本習性與損益兩平點（F10）────────────────────────────────────────

/** 固定成本合計（costBehavior = fixed 之損益分類）。 */
export function calcFixedCost(pl: Partial<MonthlyPL>): number {
  return CATEGORIES.filter(c => c.inPL && c.costBehavior === 'fixed')
    .reduce((s, c) => s + fieldVal(pl, c.totalField), 0)
}

/** 變動成本合計（costBehavior = variable 之損益分類）。 */
export function calcVariableCost(pl: Partial<MonthlyPL>): number {
  return CATEGORIES.filter(c => c.inPL && c.costBehavior === 'variable')
    .reduce((s, c) => s + fieldVal(pl, c.totalField), 0)
}

/**
 * 損益兩平點營收 BEP = 固定成本 /（1 − 變動成本率）。
 * 變動成本率 = 變動成本 / 營收。無營收或邊際貢獻率 ≤ 0 時回傳 null（無法計算）。
 */
export function calcBEP(pl: Partial<MonthlyPL>): number | null {
  const rev = calcRevenue(pl)
  if (rev <= 0) return null
  const varRate = calcVariableCost(pl) / rev
  const contributionRate = 1 - varRate
  if (contributionRate <= 0) return null
  return Math.round(calcFixedCost(pl) / contributionRate)
}

// ── 期間比較（F11）────────────────────────────────────────────────────

export interface CompareLayer {
  current: number
  baseline: number
  diff: number
  /** 以 baseline 為分母之變化率；baseline 為 0 時為 null（不可除以零）。 */
  pct: number | null
}

export interface PeriodComparison {
  revenue: CompareLayer
  // 營業成本（含採購明細分類）
  cogs: CompareLayer
  procurement: CompareLayer
  grossProfit: CompareLayer
  // 營業費用（逐一分類，全數可比較）
  payroll: CompareLayer
  fixed: CompareLayer
  operating: CompareLayer
  central: CompareLayer
  depreciation: CompareLayer
  opex: CompareLayer
  operatingIncome: CompareLayer
  // 營業外（收入/費用分項）
  nonOpIncome: CompareLayer
  nonOpExpense: CompareLayer
  nonOperatingNet: CompareLayer
  pretaxIncome: CompareLayer
  incomeTax: CompareLayer
  netIncome: CompareLayer
}

function layer(current: number, baseline: number): CompareLayer {
  const diff = current - baseline
  const pct = baseline !== 0 ? diff / baseline : null
  return { current, baseline, diff, pct }
}

/** 以分類快取欄位逐一比較（採購、薪資、營業費用…等明細項）。 */
function layerField(
  current: Partial<MonthlyPL>,
  baseline: Partial<MonthlyPL>,
  field: string,
): CompareLayer {
  return layer(fieldVal(current, field), fieldVal(baseline, field))
}

/** 各損益層級與各費用分類之本期 vs 比較期 { current, baseline, diff, pct }。 */
export function comparePeriods(
  current: Partial<MonthlyPL>,
  baseline: Partial<MonthlyPL>,
): PeriodComparison {
  return {
    revenue: layer(calcRevenue(current), calcRevenue(baseline)),
    cogs: layer(calcCOGS(current), calcCOGS(baseline)),
    procurement: layerField(current, baseline, 'procurementTotal'),
    grossProfit: layer(calcGrossProfit(current), calcGrossProfit(baseline)),
    payroll: layerField(current, baseline, 'payrollTotal'),
    fixed: layerField(current, baseline, 'fixedTotal'),
    operating: layerField(current, baseline, 'operatingTotal'),
    central: layerField(current, baseline, 'centralTotal'),
    depreciation: layerField(current, baseline, 'depreciationTotal'),
    opex: layer(calcOpex(current), calcOpex(baseline)),
    operatingIncome: layer(calcOperatingIncome(current), calcOperatingIncome(baseline)),
    nonOpIncome: layer(calcNonOpIncome(current), calcNonOpIncome(baseline)),
    nonOpExpense: layer(calcNonOpExpense(current), calcNonOpExpense(baseline)),
    nonOperatingNet: layer(calcNonOperatingNet(current), calcNonOperatingNet(baseline)),
    pretaxIncome: layer(calcPretaxIncome(current), calcPretaxIncome(baseline)),
    incomeTax: layer(calcIncomeTax(current), calcIncomeTax(baseline)),
    netIncome: layer(calcNetIncome(current), calcNetIncome(baseline)),
  }
}

/** 單期損益摘要（F11 圖表與期間比較的資料來源）。 */
export interface PeriodSummary {
  year: number
  month: number
  label: string
  revenue: number
  revenueBudget: number
  cogs: number
  grossProfit: number
  opex: number
  operatingIncome: number
  nonOperatingNet: number
  pretaxIncome: number
  incomeTax: number
  netIncome: number
  grossMargin: number
  operatingMargin: number
  netMargin: number
  /** 依性質之費用結構（不含股東提撥）。 */
  expenseBreakdown: Record<string, number>
}

export function summarizePeriod(pl: Partial<MonthlyPL>): PeriodSummary {
  return {
    year: pl.year ?? 0,
    month: pl.month ?? 0,
    label: monthLabel(pl.year ?? 0, pl.month ?? 0),
    revenue: calcRevenue(pl),
    revenueBudget: pl.revenueBudget ?? 0,
    cogs: calcCOGS(pl),
    grossProfit: calcGrossProfit(pl),
    opex: calcOpex(pl),
    operatingIncome: calcOperatingIncome(pl),
    nonOperatingNet: calcNonOperatingNet(pl),
    pretaxIncome: calcPretaxIncome(pl),
    incomeTax: calcIncomeTax(pl),
    netIncome: calcNetIncome(pl),
    grossMargin: grossMargin(pl),
    operatingMargin: operatingMargin(pl),
    netMargin: netMargin(pl),
    expenseBreakdown: {
      營業成本: calcCOGS(pl),
      薪資費用: pl.payrollTotal ?? 0,
      租金費用: pl.fixedTotal ?? 0,
      折舊費用: pl.depreciationTotal ?? 0,
      營業費用: pl.operatingTotal ?? 0,
      中區支出: pl.centralTotal ?? 0,
      營業外費用: pl.nonOperatingTotal ?? 0,
    },
  }
}

// ── 其他 ──────────────────────────────────────────────────────────────

export function getStatusColor(status: string): string {
  switch (status) {
    case '超出預算': return 'text-rose-600 bg-rose-50'
    case '符合預算': return 'text-emerald-600 bg-emerald-50'
    case '低於預算': return 'text-amber-600 bg-amber-50'
    default: return 'text-slate-500 bg-slate-100'
  }
}

export function monthLabel(year: number, month: number): string {
  return `${year}/${String(month).padStart(2, '0')}`
}
