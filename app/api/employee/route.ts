import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

const TYPES = ['FULLTIME', 'PARTTIME']

export async function GET() {
  const employees = await prisma.employee.findMany({
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  })
  return NextResponse.json({ employees })
}

// 新增員工（PT 姓名僅需輸入一次，之後由系統記憶）。
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const r = (body ?? {}) as Record<string, unknown>
  const name = String(r.name ?? '').trim()
  const type = String(r.type ?? '')
  if (!name) return NextResponse.json({ error: '姓名為必填' }, { status: 400 })
  if (!TYPES.includes(type)) return NextResponse.json({ error: '類型無效' }, { status: 400 })

  const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? Math.round(n) : 0 }
  try {
    const employee = await prisma.employee.create({
      data: {
        name, type,
        defaultSalaryCents: num(r.defaultSalaryCents),
        defaultHourlyCents: num(r.defaultHourlyCents),
      },
    })
    return NextResponse.json({ employee }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: '已有同名員工' }, { status: 409 })
    }
    throw e
  }
}
