import { prisma } from '@/lib/db'
import { CATEGORIES } from '@/lib/categories'

/**
 * 由 LineItem 重算某月各分類總額快取，寫回 MonthlyPL。
 * 每個分類總額 = 該分類所有細項加總。回傳更新後的紀錄。
 */
export async function recomputeTotals(monthlyPLId: number) {
  const items = await prisma.lineItem.findMany({ where: { monthlyPLId } })

  const sums: Record<string, number> = {}
  for (const c of CATEGORIES) sums[c.totalField] = 0
  for (const it of items) {
    const def = CATEGORIES.find(c => c.key === it.category)
    if (def) sums[def.totalField] += it.amountCents
  }

  return prisma.monthlyPL.update({ where: { id: monthlyPLId }, data: sums })
}

/** 取得（或建立）某年月的 MonthlyPL 容器。 */
export async function ensureMonth(year: number, month: number) {
  return prisma.monthlyPL.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month },
  })
}
