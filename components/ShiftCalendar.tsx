'use client'
// PT 兼職班表行事曆：顯示某年月的月曆，每日格顯示當日工時；點擊日期可快速新增一筆班次。
// 月份切換由上層的期別「上一月 / 下一月」控制，行事曆即時反映所選月份。
import { shiftMinutes, type ShiftLike } from '@/lib/payroll'

interface DayShift extends ShiftLike { date: string }

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const pad = (n: number) => String(n).padStart(2, '0')

export default function ShiftCalendar({
  year, month, shifts, onAddDay,
}: {
  year: number
  month: number
  shifts: DayShift[]
  onAddDay: (date: string) => void
}) {
  const first = new Date(year, month - 1, 1)
  const startWeekday = first.getDay() // 0=日
  const daysInMonth = new Date(year, month, 0).getDate()

  // 各日工時（分）加總。
  const minsByDay: Record<string, number> = {}
  for (const s of shifts) {
    if (!s.date) continue
    minsByDay[s.date] = (minsByDay[s.date] || 0) + shiftMinutes(s)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 text-[11px] font-semibold text-slate-500">
        {WEEK.map((w, i) => (
          <div key={w} className={`px-1 py-1.5 text-center ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-sky-500' : ''}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="min-h-[52px] border-t border-l border-slate-100 bg-slate-50/40" />
          const dateStr = `${year}-${pad(month)}-${pad(d)}`
          const mins = minsByDay[dateStr] || 0
          const isToday = dateStr === todayStr
          return (
            <button
              key={i}
              onClick={() => onAddDay(dateStr)}
              title={`新增 ${dateStr} 班次`}
              className={`min-h-[52px] border-t border-l border-slate-100 p-1 text-left transition hover:bg-emerald-50 ${
                mins > 0 ? 'bg-emerald-50/60' : ''
              }`}
            >
              <div className={`text-[11px] leading-none ${isToday ? 'font-bold text-emerald-700' : 'text-slate-500'}`}>{d}</div>
              {mins > 0 && (
                <div className="mt-1 text-[11px] font-semibold text-emerald-700 tabular-nums">{(mins / 60).toFixed(1)}h</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
