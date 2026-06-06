import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

function ym(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return parseYearMonth(searchParams.get('year'), searchParams.get('month'))
}

export async function GET(req: NextRequest) {
  const p = ym(req)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })
  const suppliers = await prisma.supplier.findMany({
    where: { year: p.year, month: p.month }, orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ suppliers })
}

// 整批取代某月的月結貨主清單。body: { suppliers: [{name, amountCents, note}] }
export async function PUT(req: NextRequest) {
  const p = ym(req)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }

  const rows = Array.isArray((body as Record<string, unknown>)?.suppliers)
    ? ((body as Record<string, unknown>).suppliers as unknown[]) : []
  const clean = rows.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const name = String(r.name ?? '').trim()
    const amtRaw = typeof r.amountCents === 'number' ? r.amountCents : parseFloat(String(r.amountCents))
    const amountCents = Number.isFinite(amtRaw) ? Math.round(amtRaw) : 0
    return { name, amountCents, note: String(r.note ?? ''), sortOrder: i, year: p.year, month: p.month }
  }).filter(r => r.name || r.amountCents !== 0)

  await prisma.$transaction([
    prisma.supplier.deleteMany({ where: { year: p.year, month: p.month } }),
    ...(clean.length ? [prisma.supplier.createMany({ data: clean })] : []),
  ])
  const suppliers = await prisma.supplier.findMany({
    where: { year: p.year, month: p.month }, orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json({ suppliers })
}
