// 一次性重分類腳本（F5 + F8）。冪等：可重複執行。
// 用法（本地或 Railway Shell）：node prisma/reclassify.cjs
//
//   F5：原 NON_OPERATING 下「修繕 / 尾牙 / 警友會」等管理費用 → OPERATING（營業費用）。
//   F8：原 CENTRAL（中區支出）細項 → 依性質歸 OPERATING，並標 costCenter='中區'。
//
// 重分類後會重算受影響月份的分類總額快取（totalField）。
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// F5：營業外費用中屬「管理費用」性質的關鍵字 → 改記營業費用(OPERATING)
const ADMIN_KEYWORDS = ['修繕', '尾牙', '警友', '春酒', '清潔', '雜支', '辦公']

const TOTAL_FIELDS = [
  'revenueActual', 'procurementTotal', 'payrollTotal', 'fixedTotal',
  'operatingTotal', 'centralTotal', 'depreciationTotal', 'nonOperatingTotal',
  'nonOperatingIncomeTotal', 'financingPrincipalTotal', 'shareholderTotal',
]
const FIELD_OF = {
  REVENUE: 'revenueActual', PROCUREMENT: 'procurementTotal', PAYROLL: 'payrollTotal',
  FIXED: 'fixedTotal', OPERATING: 'operatingTotal', CENTRAL: 'centralTotal',
  DEPRECIATION: 'depreciationTotal', NON_OPERATING: 'nonOperatingTotal',
  NON_OPERATING_INCOME: 'nonOperatingIncomeTotal', FINANCING_PRINCIPAL: 'financingPrincipalTotal',
  SHAREHOLDER: 'shareholderTotal',
}

async function recompute(monthlyPLId) {
  const items = await prisma.lineItem.findMany({ where: { monthlyPLId } })
  const sums = Object.fromEntries(TOTAL_FIELDS.map(f => [f, 0]))
  for (const it of items) {
    const f = FIELD_OF[it.category]
    if (f) sums[f] += it.amountCents
  }
  await prisma.monthlyPL.update({ where: { id: monthlyPLId }, data: sums })
}

async function main() {
  const affected = new Set()

  // F5：營業外費用 → 營業費用（依關鍵字）
  const nonOp = await prisma.lineItem.findMany({ where: { category: 'NON_OPERATING' } })
  for (const it of nonOp) {
    if (ADMIN_KEYWORDS.some(k => it.label.includes(k) || (it.note || '').includes(k))) {
      await prisma.lineItem.update({ where: { id: it.id }, data: { category: 'OPERATING' } })
      affected.add(it.monthlyPLId)
      console.log(`[F5] NON_OPERATING → OPERATING：${it.label}`)
    }
  }

  // F8：中區支出 → 營業費用，標 costCenter='中區'
  const central = await prisma.lineItem.findMany({ where: { category: 'CENTRAL' } })
  for (const it of central) {
    await prisma.lineItem.update({
      where: { id: it.id },
      data: { category: 'OPERATING', costCenter: it.costCenter || '中區' },
    })
    affected.add(it.monthlyPLId)
    console.log(`[F8] CENTRAL → OPERATING (中區)：${it.label}`)
  }

  for (const id of affected) await recompute(id)
  console.log(`[reclassify] 完成，重算 ${affected.size} 個月份的分類總額。`)
}

main()
  .catch(e => { console.error('[reclassify] 失敗：', e && e.message ? e.message : e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
