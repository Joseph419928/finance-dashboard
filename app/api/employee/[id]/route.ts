import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

function parseId(raw: string): number | null {
  const id = parseInt(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}
const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? Math.round(n) : 0 }

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (id === null) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const r = (body ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (r.name !== undefined) data.name = String(r.name).trim()
  if (r.defaultSalaryCents !== undefined) data.defaultSalaryCents = num(r.defaultSalaryCents)
  if (r.defaultHourlyCents !== undefined) data.defaultHourlyCents = num(r.defaultHourlyCents)
  if (r.active !== undefined) data.active = !!r.active
  try {
    const employee = await prisma.employee.update({ where: { id }, data })
    return NextResponse.json({ employee })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return NextResponse.json({ error: '找不到員工' }, { status: 404 })
      if (e.code === 'P2002') return NextResponse.json({ error: '已有同名員工' }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (id === null) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  try {
    await prisma.employee.delete({ where: { id } }) // payroll entries + shifts cascade
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '找不到員工' }, { status: 404 })
    }
    throw e
  }
}
