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

export function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function fmtNum(value: number): string {
  return new Intl.NumberFormat('zh-TW').format(Math.round(value))
}
