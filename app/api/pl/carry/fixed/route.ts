import { NextRequest, NextResponse } from 'next/server'
import { carryFixedFromPrevious } from '@/lib/importPL'
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

  const result = await carryFixedFromPrevious(ym.year, ym.month)
  return NextResponse.json({ ok: true, ...result })
}
