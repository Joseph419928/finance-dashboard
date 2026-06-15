// MonthlyPL 容器欄位的白名單與驗證。金額皆以「分」(整數) 表示。
// 分類總額為快取，由 LineItem / 薪資模組重算（見 recomputeTotals），不由 client 直接寫入。

export const DIRECT_NUMERIC_FIELDS = [
  'revenueBudget', 'revenueFaceVal', 'bankBalance',
  'revenueAccrual', 'arBalance', 'apBalance', // 權責雙軌（F1）
  'incomeTaxCents', // 所得稅費用（F3）
] as const

const ALLOWED_STATUS = ['', '超出預算', '符合預算', '低於預算']

export type PLData = Record<string, number | string>

export function sanitizePLData(body: unknown): PLData {
  const src = (body ?? {}) as Record<string, unknown>
  const out: PLData = {}
  for (const field of DIRECT_NUMERIC_FIELDS) {
    if (src[field] === undefined) continue
    const num = typeof src[field] === 'number' ? (src[field] as number) : parseFloat(String(src[field]))
    out[field] = Number.isFinite(num) ? Math.round(num) : 0
  }
  if (src.notes !== undefined) out.notes = String(src.notes)
  if (src.status !== undefined) {
    const status = String(src.status)
    out.status = ALLOWED_STATUS.includes(status) ? status : ''
  }
  return out
}

import { isCategory } from './categories'

export interface CleanLineItem {
  category: string
  label: string
  amountCents: number
  note: string
  costCenter: string
  sortOrder: number
}

/** 清洗 + 驗證細項陣列：只留合法分類，金額轉整數分。 */
export function sanitizeLineItems(input: unknown): CleanLineItem[] {
  if (!Array.isArray(input)) return []
  const out: CleanLineItem[] = []
  input.forEach((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const category = String(r.category ?? '')
    if (!isCategory(category)) return
    const label = String(r.label ?? '').trim()
    const amtRaw = typeof r.amountCents === 'number' ? r.amountCents : parseFloat(String(r.amountCents))
    const amountCents = Number.isFinite(amtRaw) ? Math.round(amtRaw) : 0
    // 略過完全空白的列（無名稱且金額為 0）
    if (!label && amountCents === 0) return
    out.push({
      category, label: label || '(未命名)', amountCents,
      note: String(r.note ?? ''), costCenter: String(r.costCenter ?? ''), sortOrder: i,
    })
  })
  return out
}

export function parseYearMonth(yearRaw: unknown, monthRaw: unknown): { year: number; month: number } | null {
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}
