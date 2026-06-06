// 生產環境「首次啟動自動載入真實資料」腳本（CommonJS，容器內以 node 執行）。
// 冪等：只有在資料庫為空時才匯入。使用 createMany 批次寫入，
// 將數百筆插入壓縮成數十次往返，避免在網路磁碟(Railway Volume)上過慢而拖延啟動。
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
  if (m.lineItems.length) {
    await prisma.lineItem.createMany({
      data: m.lineItems.map((li, i) => ({ monthlyPLId: pl.id, category: li.category, label: li.label, amountCents: C(li.amount), note: li.note || '', sortOrder: i })),
    })
  }
  if (m.suppliers.length) {
    await prisma.supplier.createMany({
      data: m.suppliers.map((s, i) => ({ year: m.year, month: m.month, name: s.name, amountCents: C(s.amount), sortOrder: i })),
    })
  }
}

async function main() {
  const existing = await prisma.monthlyPL.count()
  if (existing > 0) { console.log(`[seed-prod] DB 已有 ${existing} 筆月份，略過。`); return }
  console.log('[seed-prod] 空資料庫，批次匯入真實資料...')

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8'))

  await prisma.employee.createMany({
    data: data.employees.map((e, i) => ({ name: e.name, type: e.type, defaultSalaryCents: C(e.salary), sortOrder: i })),
  })
  const emps = await prisma.employee.findMany()
  const empId = Object.fromEntries(emps.map(e => [e.name, e.id]))

  for (const m of data.months2026) await seedMonth(m)
  for (const m of data.months2025) await seedMonth(m)

  const payroll = []
  for (const m of data.months2026) {
    for (const emp of m.employees) {
      if (empId[emp.name]) payroll.push({ year: m.year, month: m.month, employeeId: empId[emp.name], type: 'FULLTIME', salaryCents: C(emp.salary) })
    }
  }
  if (payroll.length) await prisma.payrollEntry.createMany({ data: payroll })

  await prisma.annualPLLine.createMany({
    data: data.annual2025.map(a => {
      const isPct = a.subject.includes('率')
      const conv = (v) => isPct ? BigInt(Math.round((v || 0) * 10000)) : BigInt(C(v))
      const mv = a.months.map(conv)
      return {
        year: 2025, section: '', subject: a.subject,
        m1: mv[0], m2: mv[1], m3: mv[2], m4: mv[3], m5: mv[4], m6: mv[5],
        m7: mv[6], m8: mv[7], m9: mv[8], m10: mv[9], m11: mv[10], m12: mv[11],
        total: conv(a.total), isSubtotal: a.isSubtotal, indent: a.isSubtotal ? 0 : 1, sortOrder: a.sortOrder,
      }
    }),
  })
  console.log('[seed-prod] 匯入完成。')
}

main()
  .catch((e) => { console.error('[seed-prod] 失敗（不影響伺服器啟動）:', e && e.message ? e.message : e) })
  .finally(async () => { await prisma.$disconnect() })
