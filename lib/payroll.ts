// 薪資模組共用邏輯（client/server 共用）。金額皆為「分」。

export const EMP_TYPES = { FULLTIME: '正職', PARTTIME: 'PT兼職' } as const
export type EmpType = keyof typeof EMP_TYPES

export interface ShiftLike { startMin: number; endMin: number; breakMin: number }

/** 單班有效工時（分鐘）= 下班 − 上班 − 休息，最少 0。 */
export function shiftMinutes(s: ShiftLike): number {
  return Math.max(0, (s.endMin || 0) - (s.startMin || 0) - (s.breakMin || 0))
}

export function totalMinutes(shifts: ShiftLike[]): number {
  return shifts.reduce((a, s) => a + shiftMinutes(s), 0)
}

export function totalHours(shifts: ShiftLike[]): number {
  return totalMinutes(shifts) / 60
}

/** 兼職本月薪資（分）= 總工時 × 時薪，四捨五入到分。 */
export function parttimePayCents(hourlyCents: number, shifts: ShiftLike[]): number {
  return Math.round((hourlyCents || 0) * totalMinutes(shifts) / 60)
}

export interface RaiseInfo {
  baseSalary: number
  current: number
  pct: number
  count: number
}

/**
 * 正職年度漲幅：以「該員今年度最早一筆薪資」為基準，比較到本月。
 * @param yearEntriesAsc 同一員工、同一年度、月份遞增的薪資紀錄
 */
export function raiseInfo(yearEntriesAsc: { salaryCents: number }[]): RaiseInfo {
  if (yearEntriesAsc.length === 0) return { baseSalary: 0, current: 0, pct: 0, count: 0 }
  const base = yearEntriesAsc[0].salaryCents
  const current = yearEntriesAsc[yearEntriesAsc.length - 1].salaryCents
  let count = 0
  for (let i = 1; i < yearEntriesAsc.length; i++) {
    if (yearEntriesAsc[i].salaryCents !== yearEntriesAsc[i - 1].salaryCents) count++
  }
  const pct = base > 0 ? (current - base) / base : 0
  return { baseSalary: base, current, pct, count }
}

/** 分鐘 → "HH:MM" */
export function minToTime(min: number): string {
  if (!Number.isFinite(min) || min < 0) return ''
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" → 分鐘 */
export function timeToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '')
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}
