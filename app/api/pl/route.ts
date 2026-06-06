import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get('year')
  let where: { year: number } | undefined
  if (yearParam !== null) {
    const year = parseInt(yearParam)
    if (Number.isNaN(year)) return NextResponse.json({ error: 'year 參數無效' }, { status: 400 })
    where = { year }
  }
  const records = await prisma.monthlyPL.findMany({
    where, orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })
  return NextResponse.json(records)
}

// 建立新月份（空容器）。若已存在則回傳既有。
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const ym = parseYearMonth((body as Record<string, unknown>)?.year, (body as Record<string, unknown>)?.month)
  if (!ym) return NextResponse.json({ error: '年份與月份為必填，且月份須介於 1–12' }, { status: 400 })

  const record = await prisma.monthlyPL.upsert({
    where: { year_month: { year: ym.year, month: ym.month } },
    update: {},
    create: { year: ym.year, month: ym.month },
  })
  return NextResponse.json(record, { status: 201 })
}
