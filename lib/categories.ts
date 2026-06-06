// 損益分類設定（單一資料來源）。每個分類底下可有多筆可編輯細項 (LineItem)。

export type Category =
  | 'REVENUE'
  | 'PROCUREMENT'
  | 'PAYROLL'
  | 'FIXED'
  | 'OPERATING'
  | 'CENTRAL'
  | 'NON_OPERATING'
  | 'SHAREHOLDER'

export interface CategoryDef {
  key: Category
  label: string
  kind: 'income' | 'expense' | 'appropriation'
  /** 對應 MonthlyPL 的快取總額欄位 */
  totalField:
    | 'revenueActual'
    | 'procurementTotal'
    | 'payrollTotal'
    | 'fixedTotal'
    | 'operatingTotal'
    | 'centralTotal'
    | 'nonOperatingTotal'
    | 'shareholderTotal'
  hint?: string
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'REVENUE', label: '營業收入(現金)', kind: 'income', totalField: 'revenueActual', hint: '實際現金回收（借項）' },
  { key: 'PROCUREMENT', label: '採購款', kind: 'expense', totalField: 'procurementTotal', hint: '市場、南部、貨主、信用卡等' },
  { key: 'PAYROLL', label: '人事薪資', kind: 'expense', totalField: 'payrollTotal', hint: '薪資、勞健保、職工福利（可由薪資管理帶入）' },
  { key: 'FIXED', label: '每月固定支出', kind: 'expense', totalField: 'fixedTotal', hint: '貸款、租金、車貸等' },
  { key: 'OPERATING', label: '營業費用', kind: 'expense', totalField: 'operatingTotal', hint: '油資、過路費、水電、停車等' },
  { key: 'CENTRAL', label: '中區支出', kind: 'expense', totalField: 'centralTotal', hint: '凍庫、信用卡、薪資等' },
  { key: 'NON_OPERATING', label: '營業外費用', kind: 'expense', totalField: 'nonOperatingTotal', hint: '修繕、尾牙、警友會等特殊支出' },
  { key: 'SHAREHOLDER', label: '股東提撥', kind: 'appropriation', totalField: 'shareholderTotal', hint: '股東固定提撥' },
]

export const CATEGORY_KEYS = CATEGORIES.map(c => c.key)

export function categoryDef(key: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.key === key)
}

export function isCategory(key: string): key is Category {
  return CATEGORY_KEYS.includes(key as Category)
}

// 費用類分類（用於加總總支出，不含營業收入與股東提撥）
export const EXPENSE_CATEGORIES: Category[] =
  CATEGORIES.filter(c => c.kind === 'expense').map(c => c.key)
