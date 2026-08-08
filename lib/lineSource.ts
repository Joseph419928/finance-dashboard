// LineItem 來源標記（單一資料來源）。決定匯入／帶入時的取代範圍與 UI 標籤。
export const LINE_SOURCES = {
  MANUAL: { label: '手動', badge: '' },
  SUPPLIER: { label: '貨主匯入', badge: '貨主' },
  PAYROLL: { label: '薪資匯入', badge: '薪資' },
  CARRY_FIXED: { label: '上期帶入', badge: '上期' },
} as const

export type LineSource = keyof typeof LINE_SOURCES

export function isLineSource(v: string): v is LineSource {
  return Object.prototype.hasOwnProperty.call(LINE_SOURCES, v)
}

/** 清洗未知值為 MANUAL，相容舊資料與外部輸入。 */
export function toLineSource(v: unknown): LineSource {
  const source = String(v ?? '')
  return isLineSource(source) ? source : 'MANUAL'
}
