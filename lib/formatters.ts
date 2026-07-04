import { toUnits } from './money'

// 傳入值為「分」(整數)；此處換算成「元」後再格式化。
export function fmtCurrency(cents: number, compact = false): string {
  const value = toUnits(cents)
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`
  }
  // 元以下若有小數（角分）才顯示，否則維持整數顯示。
  const hasFraction = Math.round(value) !== value
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency', currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value)
}

/** 同一份表格內用，強制固定小數位數，讓整欄數字對齊、方便掃視比較。 */
export function fmtCurrencyFixed(cents: number, decimals: number): string {
  const value = toUnits(cents)
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency', currency: 'TWD',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value)
}

export function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** 百分比，表現至小數點後二位。 */
export function fmtPct2(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/** 某金額佔總營收之比例（小數點後二位）；營收為 0 時回傳 '—'。 */
export function ratioOfRevenue(cents: number, revenueCents: number): string {
  if (!revenueCents) return '—'
  return fmtPct2(cents / revenueCents)
}

export function fmtNum(value: number): string {
  return new Intl.NumberFormat('zh-TW').format(Math.round(value))
}
