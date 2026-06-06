import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

// 帶入上一期：把最近一個較早月份的薪資資料（正職月薪 / 兼職時薪）複製到本月，
// 供使用者編輯。兼職的每日工時不複製（屬當月資料）。
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const p = parseYearMonth((body as Record<string, unknown>)?.year, (body as Record<string, unknown>)?.month)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  const earlier = await prisma.payrollEntry.findFirst({
    where: { OR: [{ year: { lt: p.year } }, { year: p.year, month: { lt: p.month } }] },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
  if (!earlier) return NextResponse.json({ ok: true, message: '查無上一期資料', copied: 0 })

  const prev = await prisma.payrollEntry.findMany({
    where: { year: earlier.year, month: earlier.month },
  })

  const data = prev.map((e) => ({
    year: p.year, month: p.month, employeeId: e.employeeId, type: e.type,
    salaryCents: e.salaryCents, hourlyCents: e.hourlyCents, note: e.note,
  }))
  await prisma.$transaction([
    prisma.payrollEntry.deleteMany({ where: { year: p.year, month: p.month } }),
    prisma.payrollEntry.createMany({ data }),
  ])
  return NextResponse.json({ ok: true, from: `${earlier.year}/${String(earlier.month).padStart(2, '0')}`, copied: prev.length })
}
