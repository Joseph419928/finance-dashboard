import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

// 帶入上一期：把最近一個較早月份的貨主名單複製到本月（金額歸 0），供使用者編輯。
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const p = parseYearMonth((body as Record<string, unknown>)?.year, (body as Record<string, unknown>)?.month)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  // 找出最近一個較早的月份（有貨主資料者）
  const earlier = await prisma.supplier.findMany({
    where: { OR: [{ year: { lt: p.year } }, { year: p.year, month: { lt: p.month } }] },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { sortOrder: 'asc' }],
  })
  if (earlier.length === 0) return NextResponse.json({ suppliers: [], message: '查無上一期資料' })

  const prevYear = earlier[0].year
  const prevMonth = earlier[0].month
  const prevList = earlier.filter(s => s.year === prevYear && s.month === prevMonth)

  await prisma.$transaction([
    prisma.supplier.deleteMany({ where: { year: p.year, month: p.month } }),
    prisma.supplier.createMany({
      data: prevList.map((s, i) => ({
        year: p.year, month: p.month, name: s.name, amountCents: 0, note: s.note, sortOrder: i,
      })),
    }),
  ])
  const suppliers = await prisma.supplier.findMany({
    where: { year: p.year, month: p.month }, orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ suppliers, from: `${prevYear}/${String(prevMonth).padStart(2, '0')}` })
}
