import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'
import { summarizePeriod, comparePeriods, type MonthlyPL } from '@/lib/types'

/**
 * 單期損益摘要 + （選配）比較期摘要與各層級差異。
 * GET /api/monthly/compare?year=&month=[&cmpYear=&cmpMonth=]
 * 回傳：{ current, baseline | null, comparison | null }
 * 缺比較期資料時 baseline/comparison 為 null（優雅退回，前端顯示單期）。
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ym = parseYearMonth(searchParams.get('year'), searchParams.get('month'))
  if (!ym) return NextResponse.json({ error: 'year/month 參數無效' }, { status: 400 })

  const currentRec = await prisma.monthlyPL.findUnique({
    where: { year_month: { year: ym.year, month: ym.month } },
  }) as unknown as MonthlyPL | null
  if (!currentRec) return NextResponse.json({ error: '找不到本期資料' }, { status: 404 })

  const current = summarizePeriod(currentRec)

  const cmp = parseYearMonth(searchParams.get('cmpYear'), searchParams.get('cmpMonth'))
  if (!cmp) return NextResponse.json({ current, baseline: null, comparison: null })

  const baselineRec = await prisma.monthlyPL.findUnique({
    where: { year_month: { year: cmp.year, month: cmp.month } },
  }) as unknown as MonthlyPL | null

  if (!baselineRec) return NextResponse.json({ current, baseline: null, comparison: null })

  const baseline = summarizePeriod(baselineRec)
  const comparison = comparePeriods(currentRec, baselineRec)
  return NextResponse.json({ current, baseline, comparison })
}
