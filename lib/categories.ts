// 損益分類設定（單一資料來源）。每個分類底下可有多筆可編輯細項 (LineItem)。
//
// 依台灣商業會計處理準則第 31 條之損益表分層，為每個分類標註：
//   - statementGroup：在損益表中的層級歸群（REVENUE/COGS/OPEX/營業外/盈餘分配/融資）
//   - standardName  ：標準會計科目名稱（對外報表用；label 為口語別名，供輸入介面）
//   - costBehavior  ：固定／變動成本（供損益兩平點 BEP 計算，F10）
//   - inPL          ：是否計入損益表本體（股東提撥、融資本金償還為 false）

export type Category =
  | 'REVENUE'
  | 'PROCUREMENT'
  | 'PAYROLL'
  | 'FIXED'
  | 'OPERATING'
  | 'CENTRAL'
  | 'DEPRECIATION'
  | 'NON_OPERATING'
  | 'NON_OPERATING_INCOME'
  | 'FINANCING_PRINCIPAL'
  | 'SHAREHOLDER'

/** 損益表分層群組。FINANCING / APPROPRIATION 不屬損益表本體。 */
export type StatementGroup =
  | 'REVENUE'
  | 'COGS'
  | 'OPEX'
  | 'NON_OP_INCOME'
  | 'NON_OP_EXPENSE'
  | 'APPROPRIATION'
  | 'FINANCING'

/** 成本習性（BEP 用）。none = 不參與固定/變動拆分（營收、盈餘分配、融資本金）。 */
export type CostBehavior = 'fixed' | 'variable' | 'none'

/** MonthlyPL 上的分類總額快取欄位名稱。 */
export type TotalField =
  | 'revenueActual'
  | 'procurementTotal'
  | 'payrollTotal'
  | 'fixedTotal'
  | 'operatingTotal'
  | 'centralTotal'
  | 'depreciationTotal'
  | 'nonOperatingTotal'
  | 'nonOperatingIncomeTotal'
  | 'financingPrincipalTotal'
  | 'shareholderTotal'

export interface CategoryDef {
  key: Category
  /** 口語別名（輸入介面顯示） */
  label: string
  /** 標準會計科目（對外/正式報表顯示） */
  standardName: string
  kind: 'income' | 'cogs' | 'expense' | 'appropriation' | 'financing'
  statementGroup: StatementGroup
  costBehavior: CostBehavior
  /** 是否計入損益表本體 */
  inPL: boolean
  /** 對應 MonthlyPL 的快取總額欄位 */
  totalField: TotalField
  hint?: string
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'REVENUE', label: '營業收入', standardName: '營業收入',
    kind: 'income', statementGroup: 'REVENUE', costBehavior: 'none', inPL: true,
    totalField: 'revenueActual', hint: '此處明細為「現金回收」，供現金流量參考；損益表營收以權責認列數（基本資訊區）為準',
  },
  {
    key: 'PROCUREMENT', label: '營業成本（採購）', standardName: '營業成本',
    kind: 'cogs', statementGroup: 'COGS', costBehavior: 'variable', inPL: true,
    totalField: 'procurementTotal', hint: '市場、南部、貨主、信用卡等進貨成本',
  },
  {
    key: 'PAYROLL', label: '人事薪資', standardName: '薪資費用',
    kind: 'expense', statementGroup: 'OPEX', costBehavior: 'fixed', inPL: true,
    totalField: 'payrollTotal', hint: '薪資、勞健保、職工福利（可由薪資管理帶入）',
  },
  {
    key: 'FIXED', label: '每月固定支出', standardName: '租金費用',
    kind: 'expense', statementGroup: 'OPEX', costBehavior: 'fixed', inPL: true,
    totalField: 'fixedTotal', hint: '租金等；貸款本金請改記「融資-本金償還」，利息改記「營業外費用」，車輛/設備改提折舊',
  },
  {
    key: 'OPERATING', label: '營業費用', standardName: '營業費用',
    kind: 'expense', statementGroup: 'OPEX', costBehavior: 'variable', inPL: true,
    totalField: 'operatingTotal', hint: '油資、過路費、水電、運費、停車等',
  },
  {
    key: 'CENTRAL', label: '中區支出', standardName: '中區支出（成本中心）',
    kind: 'expense', statementGroup: 'OPEX', costBehavior: 'fixed', inPL: true,
    totalField: 'centralTotal', hint: '成本中心-中區（建議改用 costCenter 維度，依性質歸入薪資/租金/營業費用）',
  },
  {
    key: 'DEPRECIATION', label: '折舊費用', standardName: '折舊費用',
    kind: 'expense', statementGroup: 'OPEX', costBehavior: 'fixed', inPL: true,
    totalField: 'depreciationTotal', hint: '車輛/設備資本化後按月提列之折舊',
  },
  {
    key: 'NON_OPERATING', label: '營業外費用', standardName: '營業外費用',
    kind: 'expense', statementGroup: 'NON_OP_EXPENSE', costBehavior: 'fixed', inPL: true,
    totalField: 'nonOperatingTotal', hint: '利息費用、處分資產損失、兌換損失等與本業無關項目',
  },
  {
    key: 'NON_OPERATING_INCOME', label: '營業外收入', standardName: '營業外收入',
    kind: 'income', statementGroup: 'NON_OP_INCOME', costBehavior: 'none', inPL: true,
    totalField: 'nonOperatingIncomeTotal', hint: '利息收入、處分資產利益、兌換利益等',
  },
  {
    key: 'FINANCING_PRINCIPAL', label: '融資-本金償還', standardName: '借款本金償還（非損益）',
    kind: 'financing', statementGroup: 'FINANCING', costBehavior: 'none', inPL: false,
    totalField: 'financingPrincipalTotal', hint: '借款/車貸本金償還屬負債減少（融資活動），不列入損益',
  },
  {
    key: 'SHAREHOLDER', label: '股東提撥', standardName: '股東提撥／業主提取',
    kind: 'appropriation', statementGroup: 'APPROPRIATION', costBehavior: 'none', inPL: false,
    totalField: 'shareholderTotal', hint: '盈餘分配／業主提取，屬股東權益交易，不列入損益表',
  },
]

export const CATEGORY_KEYS = CATEGORIES.map(c => c.key)

export function categoryDef(key: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.key === key)
}

export function isCategory(key: string): key is Category {
  return CATEGORY_KEYS.includes(key as Category)
}

/** 取得某損益群組之分類鍵。 */
export function categoriesOfGroup(group: StatementGroup): Category[] {
  return CATEGORIES.filter(c => c.statementGroup === group).map(c => c.key)
}

export const REVENUE_CATEGORIES = categoriesOfGroup('REVENUE')
export const COGS_CATEGORIES = categoriesOfGroup('COGS')
export const OPEX_CATEGORIES = categoriesOfGroup('OPEX')
export const NON_OP_INCOME_CATEGORIES = categoriesOfGroup('NON_OP_INCOME')
export const NON_OP_EXPENSE_CATEGORIES = categoriesOfGroup('NON_OP_EXPENSE')

/** 計入損益表本體的分類（依表列順序）。 */
export const PL_CATEGORIES: Category[] = CATEGORIES.filter(c => c.inPL).map(c => c.key)

/**
 * 費用類分類（COGS + 營業費用 + 營業外費用）。
 * 注意：不含營業外收入（為收入）、股東提撥與融資本金（非損益）。
 * 保留供相容；損益計算請優先使用 lib/types.ts 的分層函式。
 */
export const EXPENSE_CATEGORIES: Category[] =
  CATEGORIES.filter(c => c.kind === 'cogs' || c.kind === 'expense').map(c => c.key)
