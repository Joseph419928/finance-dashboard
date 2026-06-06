// 金額一律以「分」(整數) 在資料庫與程式內部儲存/運算，避免浮點誤差。
// 只有在「顯示給人看」或「人類輸入」時，才在邊界換算成「元」。
//
// 規則：程式碼中的金額數字 = 分 (cents)；除以 100 只為了顯示。

export const CENTS_PER_UNIT = 100

/** 人類輸入的「元」(可含小數) → 整數「分」。非數字視為 0。 */
export function toCents(amount: number | string): number {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount))
  if (!Number.isFinite(n)) return 0
  // 先四捨五入到分，再轉整數，避免 12.34 * 100 = 1233.9999… 的浮點問題。
  return Math.round(n * CENTS_PER_UNIT)
}

/** 整數「分」→「元」(number)，僅供顯示 / 輸入框使用。 */
export function toUnits(cents: number): number {
  return (cents ?? 0) / CENTS_PER_UNIT
}
