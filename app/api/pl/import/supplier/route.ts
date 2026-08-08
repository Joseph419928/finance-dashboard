import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { replaceSourcedLineItems } from '@/lib/importPL'
import { parseYearMonth } from '@/lib/pl'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const ym = parseYearMonth(input.year, input.month)
  if (!ym) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  const suppliers = await prisma.supplier.findMany({
    where: ym,
    orderBy: { sortOrder: 'asc' },
  })
  if (suppliers.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      replaced: 0,
      message: '該期尚無貨主資料，未做任何變更',
    })
  }

  const result = await replaceSourcedLineItems(
    ym.year,
    ym.month,
    'PROCUREMENT',
    'SUPPLIER',
    suppliers.map(supplier => ({
      label: supplier.name.trim() || '(未命名貨主)',
      amountCents: supplier.amountCents,
      note: supplier.note,
      costCenter: '',
    })),
  )
  return NextResponse.json({
    ok: true,
    target: `${ym.year}/${String(ym.month).padStart(2, '0')}`,
    ...result,
  })
}
