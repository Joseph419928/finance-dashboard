import { prisma } from '@/lib/db'
import { ensureMonth, recomputeTotals } from '@/lib/monthly'
import type { Category } from '@/lib/categories'
import type { LineSource } from '@/lib/lineSource'
import { normalizeName } from '@/lib/preset'

export interface ImportRow {
  label: string
  amountCents: number
  note?: string
  costCenter?: string
}

export interface LineItemDTO {
  id: number
  monthlyPLId: number
  category: string
  label: string
  amountCents: number
  note: string
  costCenter: string
  sortOrder: number
  source: string
}

export interface ImportResult {
  monthlyPLId: number
  year: number
  month: number
  category: Category
  source: LineSource
  imported: number
  replaced: number
  totalCents: number
  manualCount: number
  lineItems: LineItemDTO[]
}

export type CarryFixedResult = Partial<ImportResult> & {
  copied: number
  from: string | null
  message?: string
}

/** 以 (月份, category, source) 整批取代；MANUAL 與其他來源不受影響。 */
export async function replaceSourcedLineItems(
  year: number,
  month: number,
  category: Category,
  source: LineSource,
  rows: ImportRow[],
): Promise<ImportResult> {
  const pl = await ensureMonth(year, month)
  const clean = rows
    .map(row => ({
      label: String(row.label ?? '').trim(),
      amountCents: Math.round(Number(row.amountCents) || 0),
      note: String(row.note ?? ''),
      costCenter: String(row.costCenter ?? ''),
    }))
    .filter(row => row.label || row.amountCents !== 0)

  let replaced = 0
  if (clean.length > 0) {
    await prisma.$transaction(async tx => {
      replaced = (await tx.lineItem.deleteMany({
        where: { monthlyPLId: pl.id, category, source },
      })).count
      const aggregate = await tx.lineItem.aggregate({
        where: { monthlyPLId: pl.id },
        _max: { sortOrder: true },
      })
      const maxSort = aggregate._max.sortOrder ?? -1
      await tx.lineItem.createMany({
        data: clean.map((row, index) => ({
          monthlyPLId: pl.id,
          category,
          source,
          label: row.label || '(未命名)',
          amountCents: row.amountCents,
          note: row.note,
          costCenter: row.costCenter,
          sortOrder: maxSort + 1 + index,
        })),
      })
      await recomputeTotals(pl.id, tx)
    })

    // 字典是輸入輔助資料，不屬匯入主交易；同步失敗不可回滾已成功的財務匯入。
    const presetNames = Array.from(new Set(clean
      .map(row => normalizeName(row.label))
      .filter(name => name && name !== '(未命名)' && name !== '(未命名貨主)')))
    try {
      await Promise.all(presetNames.map(name => prisma.itemPreset.upsert({
        where: { scope_category_name: { scope: 'LINE_ITEM', category, name } },
        create: { scope: 'LINE_ITEM', category, name, active: true },
        update: { active: true },
      })))
    } catch (error) {
      console.error('匯入已完成，但名稱字典同步失敗', error)
    }
  }

  const [lineItems, manualCount] = await Promise.all([
    prisma.lineItem.findMany({
      where: { monthlyPLId: pl.id },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.lineItem.count({
      where: { monthlyPLId: pl.id, category, source: 'MANUAL' },
    }),
  ])

  return {
    monthlyPLId: pl.id,
    year,
    month,
    category,
    source,
    imported: clean.length,
    replaced,
    totalCents: clean.reduce((sum, row) => sum + row.amountCents, 0),
    manualCount,
    lineItems,
  }
}

/** 找最近一個較早且有固定支出明細的月份，含金額原樣帶入本期。 */
export async function carryFixedFromPrevious(
  year: number,
  month: number,
): Promise<CarryFixedResult> {
  const previous = await prisma.lineItem.findFirst({
    where: {
      category: 'FIXED',
      monthlyPL: {
        OR: [
          { year: { lt: year } },
          { year, month: { lt: month } },
        ],
      },
    },
    orderBy: [
      { monthlyPL: { year: 'desc' } },
      { monthlyPL: { month: 'desc' } },
    ],
    select: {
      monthlyPL: { select: { id: true, year: true, month: true } },
    },
  })
  if (!previous) {
    return { copied: 0, from: null, message: '查無上一期固定支出資料' }
  }

  const sourceRows = await prisma.lineItem.findMany({
    where: { monthlyPLId: previous.monthlyPL.id, category: 'FIXED' },
    orderBy: { sortOrder: 'asc' },
  })
  const result = await replaceSourcedLineItems(
    year,
    month,
    'FIXED',
    'CARRY_FIXED',
    sourceRows.map(row => ({
      label: row.label,
      amountCents: row.amountCents,
      note: row.note,
      costCenter: row.costCenter,
    })),
  )
  return {
    ...result,
    copied: result.imported,
    from: `${previous.monthlyPL.year}/${String(previous.monthlyPL.month).padStart(2, '0')}`,
  }
}
