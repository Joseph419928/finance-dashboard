import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

// 列出所有薪資期別（最新在前）與最新一期。
export async function GET() {
  const periods = await prisma.payrollPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] })
  return NextResponse.json({ periods, latest: periods[0] ?? null })
}

// 新增新月份（薪資期別）。body: { year, month, carry?:boolean }
// carry=true 時，把上一期正職月薪 / 兼職時薪帶入本月（兼職每日工時不複製）。
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const b = (body ?? {}) as Record<string, unknown>
  const p = parseYearMonth(b.year, b.month)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  const existing = await prisma.payrollPeriod.findUnique({ where: { year_month: { year: p.year, month: p.month } } })
  if (existing) return NextResponse.json({ error: `${p.year}/${String(p.month).padStart(2, '0')} 期別已存在` }, { status: 409 })

  const carry = b.carry === true || b.carry === 'true'
  let copied = 0
  let from: string | null = null

  await prisma.$transaction(async (tx) => {
    await tx.payrollPeriod.create({ data: { year: p.year, month: p.month, status: 'DRAFT' } })

    if (carry) {
      const earlier = await tx.payrollEntry.findFirst({
        where: { OR: [{ year: { lt: p.year } }, { year: p.year, month: { lt: p.month } }] },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })
      if (earlier) {
        const prev = await tx.payrollEntry.findMany({ where: { year: earlier.year, month: earlier.month } })
        if (prev.length) {
          await tx.payrollEntry.deleteMany({ where: { year: p.year, month: p.month } })
          await tx.payrollEntry.createMany({
            data: prev.map(e => ({
              year: p.year, month: p.month, employeeId: e.employeeId, type: e.type,
              salaryCents: e.salaryCents, hourlyCents: e.hourlyCents, note: e.note,
            })),
          })
          copied = prev.length
          from = `${earlier.year}/${String(earlier.month).padStart(2, '0')}`
        }
      }
    }

    await tx.payrollLog.create({
      data: {
        year: p.year, month: p.month, action: 'CREATE_PERIOD',
        detail: carry ? `新增期別${from ? `（帶入 ${from}，${copied} 筆）` : '（無上一期可帶入）'}` : '新增期別',
      },
    })
  })

  return NextResponse.json({ ok: true, year: p.year, month: p.month, carried: copied, from })
}
