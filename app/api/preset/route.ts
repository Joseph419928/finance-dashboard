import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isCategory } from '@/lib/categories'
import { isPresetScope, normalizeName } from '@/lib/preset'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || ''
  if (!isPresetScope(scope)) return NextResponse.json({ error: 'scope 參數無效' }, { status: 400 })
  const category = scope === 'LINE_ITEM' ? (searchParams.get('category') || '') : ''
  if (scope === 'LINE_ITEM' && !isCategory(category)) {
    return NextResponse.json({ error: 'category 參數無效' }, { status: 400 })
  }
  const presets = await prisma.itemPreset.findMany({
    where: {
      scope,
      category,
      ...(searchParams.get('all') === '1' ? {} : { active: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { usageCount: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json({ presets })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const scope = String(input.scope ?? '')
  if (!isPresetScope(scope)) return NextResponse.json({ error: 'scope 參數無效' }, { status: 400 })
  const category = scope === 'LINE_ITEM' ? String(input.category ?? '') : ''
  if (scope === 'LINE_ITEM' && !isCategory(category)) {
    return NextResponse.json({ error: 'category 參數無效' }, { status: 400 })
  }
  const name = normalizeName(input.name)
  if (!name) return NextResponse.json({ error: '請輸入名稱' }, { status: 400 })

  const preset = await prisma.itemPreset.upsert({
    where: { scope_category_name: { scope, category, name } },
    create: {
      scope,
      category,
      name,
      note: String(input.note ?? ''),
      costCenter: String(input.costCenter ?? ''),
    },
    update: { active: true },
  })
  return NextResponse.json({ preset })
}
