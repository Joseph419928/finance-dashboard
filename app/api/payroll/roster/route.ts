import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

function ym(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return parseYearMonth(searchParams.get('year'), searchParams.get('month'))
}

// 讀取某年月的撥款名單。
export async function GET(req: NextRequest) {
  const p = ym(req)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })
  const rows = await prisma.payrollRoster.findMany({
    where: { year: p.year, month: p.month },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  const totalCents = rows.reduce((a, r) => a + r.amountCents, 0)
  return NextResponse.json({ rows, totalCents })
}

// 刪除單筆撥款名單，並留下 LOG。?id=
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id 無效' }, { status: 400 })
  const row = await prisma.payrollRoster.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ ok: true })
  await prisma.$transaction([
    prisma.payrollRoster.delete({ where: { id } }),
    prisma.payrollLog.create({
      data: {
        year: row.year, month: row.month, action: 'DELETE_ROSTER',
        employeeName: row.name, detail: `刪除撥款名單：${row.name}`,
      },
    }),
  ])
  return NextResponse.json({ ok: true })
}
