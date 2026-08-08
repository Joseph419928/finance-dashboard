import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { normalizeName } from '@/lib/preset'

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  const preset = await prisma.itemPreset.findUnique({ where: { id } })
  if (!preset) return NextResponse.json({ error: '找不到名稱' }, { status: 404 })

  let affectedRows = 0
  if (preset.scope === 'LINE_ITEM') {
    affectedRows = await prisma.lineItem.count({ where: { category: preset.category, label: preset.name } })
  } else if (preset.scope === 'SUPPLIER') {
    affectedRows = await prisma.supplier.count({ where: { name: preset.name } })
  } else if (preset.scope === 'COST_CENTER') {
    affectedRows = await prisma.lineItem.count({ where: { costCenter: preset.name } })
  }
  return NextResponse.json({ affectedRows })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }
  const input = (body ?? {}) as Record<string, unknown>
  const current = await prisma.itemPreset.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: '找不到名稱' }, { status: 404 })

  const nextName = input.name === undefined ? current.name : normalizeName(input.name)
  if (!nextName) return NextResponse.json({ error: '請輸入名稱' }, { status: 400 })
  const renamed = nextName !== current.name
  const applyRename = renamed && input.applyRename === true
  const metadata: Prisma.ItemPresetUpdateInput = {}
  if (input.note !== undefined) metadata.note = String(input.note)
  if (input.costCenter !== undefined) metadata.costCenter = String(input.costCenter)
  if (input.active !== undefined) metadata.active = input.active === true
  if (input.sortOrder !== undefined) {
    const sortOrder = Number(input.sortOrder)
    metadata.sortOrder = Number.isFinite(sortOrder) ? Math.round(sortOrder) : 0
  }

  try {
    if (applyRename) {
      const result = await prisma.$transaction(async tx => {
        const target = await tx.itemPreset.findUnique({
          where: {
            scope_category_name: {
              scope: current.scope,
              category: current.category,
              name: nextName,
            },
          },
        })
        let updatedRows = 0
        if (current.scope === 'LINE_ITEM') {
          updatedRows = (await tx.lineItem.updateMany({
            where: { category: current.category, label: current.name },
            data: { label: nextName },
          })).count
        } else if (current.scope === 'SUPPLIER') {
          updatedRows = (await tx.supplier.updateMany({
            where: { name: current.name },
            data: { name: nextName },
          })).count
        } else if (current.scope === 'COST_CENTER') {
          updatedRows = (await tx.lineItem.updateMany({
            where: { costCenter: current.name },
            data: { costCenter: nextName },
          })).count
        }

        if (target && target.id !== current.id) {
          const preset = await tx.itemPreset.update({
            where: { id: target.id },
            data: {
              active: true,
              usageCount: { increment: current.usageCount },
            },
          })
          await tx.itemPreset.update({ where: { id: current.id }, data: { active: false } })
          return { preset, updatedRows, merged: true }
        }
        const preset = await tx.itemPreset.update({
          where: { id: current.id },
          data: { ...metadata, name: nextName },
        })
        return { preset, updatedRows, merged: false }
      })
      return NextResponse.json(result)
    }

    const preset = await prisma.itemPreset.update({
      where: { id },
      data: { ...metadata, ...(renamed ? { name: nextName } : {}) },
    })
    return NextResponse.json({ preset, updatedRows: 0, merged: false })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: '同一分類已有這個名稱；若要合併，請勾選同步更新既有資料' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id)
  if (!id) return NextResponse.json({ error: '無效的 id' }, { status: 400 })
  try {
    const preset = await prisma.itemPreset.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ preset })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '找不到名稱' }, { status: 404 })
    }
    throw error
  }
}
