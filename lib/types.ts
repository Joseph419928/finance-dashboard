// 金額單位皆為「分」(整數)。
import { EXPENSE_CATEGORIES, categoryDef, type Category } from './categories'

export interface LineItem {
  id: number
  monthlyPLId: number
  category: Category
  label: string
  amountCents: number
  note: string
  sortOrder: number
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
  revenueActual: number
  procurementTotal: number
  payrollTotal: number
  fixedTotal: number
  operatingTotal: number
  centralTotal: number
  nonOperatingTotal: number
  shareholderTotal: number
  createdAt: string
  updatedAt: string
  lineItems?: LineItem[]
}

/** 總支出（費用類分類加總，不含營業收入與股東提撥） */
export function calcTotalExpenses(pl: Partial<MonthlyPL>): number {
  return EXPENSE_CATEGORIES.reduce((sum, cat) => {
    const field = categoryDef(cat)!.totalField
    return sum + ((pl as Record<string, number>)[field] ?? 0)
  }, 0)
}

export function calcNetProfit(pl: Partial<MonthlyPL>): number {
  return (pl.revenueActual ?? 0) - calcTotalExpenses(pl)
}

/** 可動用留抵現金 = 淨損益 − 股東提撥 */
export function calcDisposable(pl: Partial<MonthlyPL>): number {
  return calcNetProfit(pl) - (pl.shareholderTotal ?? 0)
}

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
