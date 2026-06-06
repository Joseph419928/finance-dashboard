// 生產環境「首次啟動自動載入真實資料」腳本（CommonJS，容器內以 node 執行）。
// 冪等：只有在資料庫為空時才匯入，之後絕不覆蓋使用者編輯的資料。
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const C = (y) => Math.round((y || 0) * 100)

const TOTAL_FIELD = {
  REVENUE: 'revenueActual', PROCUREMENT: 'procurementTotal', PAYROLL: 'payrollTotal',
  FIXED: 'fixedTotal', OPERATING: 'operatingTotal', CENTRAL: 'centralTotal',
  NON_OPERATING: 'nonOperatingTotal', SHAREHOLDER: 'shareholderTotal',
}

async function seedMonth(m) {
  const sums = {
    revenueActual: 0, procurementTotal: 0, payrollTotal: 0, fixedTotal: 0,
    operatingTotal: 0, centralTotal: 0, nonOperatingTotal: 0, shareholderTotal: 0,
  }
  for (const li of m.lineItems) sums[TOTAL_FIELD[li.category]] += C(li.amount)
  const pl = await prisma.monthlyPL.create({
    data: { year: m.year, month: m.month, revenueBudget: C(m.revenueBudget), revenueFaceVal: C(m.revenueFaceVal), status: '', ...sums },
  })
  let order = 0
  for (const li of m.lineItems) {
    await prisma.lineItem.create({ data: { monthlyPLId: pl.id, category: li.category, label: li.label, amountCents: C(li.amount), note: li.note || '', sortOrder: order++ } })
  }
  order = 0
  for (const s of m.suppliers) {
    await prisma.supplier.create({ data: { year: m.year, month: m.month, name: s.name, amountCents: C(s.amount), sortOrder: order++ } })
  }
}

async function main() {
  const existing = await prisma.monthlyPL.count()
  if (existing > 0) { console.log(`[seed-prod] DB 已有 ${existing} 筆月份資料，略過匯入。`); return }
  console.log('[seed-prod] 空資料庫，開始匯入真實資料...')

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8'))

  for (let i = 0; i < data.employees.length; i++) {
    const e = data.employees[i]
    await prisma.employee.create({ data: { name: e.name, type: e.type, defaultSalaryCents: C(e.salary), sortOrder: i } })
  }
  for (const m of data.months2026) {
    await seedMonth(m)
    for (const emp of m.employees) {
      const e = await prisma.employee.findUnique({ where: { name: emp.name } })
      if (e) await prisma.payrollEntry.create({ data: { year: m.year, month: m.month, employeeId: e.id, type: 'FULLTIME', salaryCents: C(emp.salary) } })
    }
  }
  for (const m of data.months2025) await seedMonth(m)
  for (const a of data.annual2025) {
    const isPct = a.subject.includes('率')
    const conv = (v) => isPct ? BigInt(Math.round((v || 0) * 10000)) : BigInt(C(v))
    const mv = a.months.map(conv)
    await prisma.annualPLLine.create({
      data: {
        year: 2025, section: '', subject: a.subject,
        m1: mv[0], m2: mv[1], m3: mv[2], m4: mv[3], m5: mv[4], m6: mv[5],
        m7: mv[6], m8: mv[7], m9: mv[8], m10: mv[9], m11: mv[10], m12: mv[11],
        total: conv(a.total), isSubtotal: a.isSubtotal, indent: a.isSubtotal ? 0 : 1, sortOrder: a.sortOrder,
      },
    })
  }
  console.log('[seed-prod] 匯入完成。')
}

main()
  .catch((e) => { console.error('[seed-prod] 匯入失敗（不影響伺服器啟動）:', e && e.message ? e.message : e) })
  .finally(async () => { await prisma.$disconnect() })
