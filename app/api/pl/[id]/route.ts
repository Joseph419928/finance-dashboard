import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sanitizePLData, sanitizeLineItems } from '@/lib/pl'
import { recomputeTotals } from '@/lib/monthly'

function parseId(raw: string): number | null {
  const id = parseInt(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (id === null) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  const record = await prisma.monthlyPL.findUnique({
    where: { id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!record) return NextResponse.json({ error: '找不到資料' }, { status: 404 })
  return NextResponse.json(record)
}

// 更新容器欄位 + 整批取代細項，並重算分類總額。
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (id === null) return NextResponse.json({ error: '無效的 id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }

  const container = sanitizePLData(body)
  const hasLineItems = Array.isArray((body as Record<string, unknown>)?.lineItems)
  const lineItems = hasLineItems ? sanitizeLineItems((body as Record<string, unknown>).lineItems) : null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyPL.update({ where: { id }, data: container })
      if (lineItems) {
        await tx.lineItem.deleteMany({ where: { monthlyPLId: id } })
        if (lineItems.length) {
          await tx.lineItem.createMany({
            data: lineItems.map(li => ({ ...li, monthlyPLId: id })),
          })
        }
      }
    })
    if (lineItems) await recomputeTotals(id)
    const record = await prisma.monthlyPL.findUnique({
      where: { id }, include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    })
    return NextResponse.json(record)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '找不到資料' }, { status: 404 })
    }
    throw e
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (id === null) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  try {
    await prisma.monthlyPL.delete({ where: { id } }) // line items cascade
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '找不到資料' }, { status: 404 })
    }
    throw e
  }
}
