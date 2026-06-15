import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

// 元 → 分 (整數)
const C = (yuan: number | undefined | null) => Math.round((yuan || 0) * 100)

const TOTAL_FIELD: Record<string, string> = {
  REVENUE: 'revenueActual',
  PROCUREMENT: 'procurementTotal',
  PAYROLL: 'payrollTotal',
  FIXED: 'fixedTotal',
  OPERATING: 'operatingTotal',
  CENTRAL: 'centralTotal',
  DEPRECIATION: 'depreciationTotal',
  NON_OPERATING: 'nonOperatingTotal',
  NON_OPERATING_INCOME: 'nonOperatingIncomeTotal',
  FINANCING_PRINCIPAL: 'financingPrincipalTotal',
  SHAREHOLDER: 'shareholderTotal',
}

interface LI { category: string; label: string; amount: number; note?: string }
interface Mon {
  year: number; month: number; revenueActual: number; revenueFaceVal: number; revenueBudget: number
  lineItems: LI[]; employees: { name: string; salary: number }[]; suppliers: { name: string; amount: number }[]
}
interface SeedData {
  months2026: Mon[]; months2025: Mon[]
  employees: { name: string; type: string; salary: number }[]
  annual2025: { subject: string; months: number[]; total: number; isSubtotal: boolean; sortOrder: number }[]
}

const data: SeedData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8')
)

async function clearAll() {
  await prisma.shift.deleteMany()
  await prisma.payrollEntry.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.lineItem.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.annualPLLine.deleteMany()
  await prisma.monthlyPL.deleteMany()
}

async function seedMonth(m: Mon) {
  const sums: Record<string, number> = {
    revenueActual: 0, procurementTotal: 0, payrollTotal: 0, fixedTotal: 0,
    operatingTotal: 0, centralTotal: 0, depreciationTotal: 0, nonOperatingTotal: 0,
    nonOperatingIncomeTotal: 0, financingPrincipalTotal: 0, shareholderTotal: 0,
  }
  for (const li of m.lineItems) {
    const field = TOTAL_FIELD[li.category]
    if (field) sums[field] += C(li.amount)
  }

  const pl = await prisma.monthlyPL.create({
    data: {
      year: m.year, month: m.month,
      revenueBudget: C(m.revenueBudget), revenueFaceVal: C(m.revenueFaceVal),
      status: '', ...sums,
    },
  })

  let order = 0
  for (const li of m.lineItems) {
    await prisma.lineItem.create({
      data: {
        monthlyPLId: pl.id, category: li.category, label: li.label,
        amountCents: C(li.amount), note: li.note || '', sortOrder: order++,
      },
    })
  }

  order = 0
  for (const s of m.suppliers) {
    await prisma.supplier.create({
      data: { year: m.year, month: m.month, name: s.name, amountCents: C(s.amount), sortOrder: order++ },
    })
  }
}

async function main() {
  console.log('Clearing existing data...')
  await clearAll()

  console.log('Seeding employees (master)...')
  for (let i = 0; i < data.employees.length; i++) {
    const e = data.employees[i]
    await prisma.employee.create({
      data: { name: e.name, type: e.type, defaultSalaryCents: C(e.salary), sortOrder: i },
    })
  }

  console.log('Seeding 2026 months (file 01)...')
  for (const m of data.months2026) {
    await seedMonth(m)
    for (const emp of m.employees) {
      const e = await prisma.employee.findUnique({ where: { name: emp.name } })
      if (e) {
        await prisma.payrollEntry.create({
          data: { year: m.year, month: m.month, employeeId: e.id, type: 'FULLTIME', salaryCents: C(emp.salary) },
        })
      }
    }
  }

  console.log('Seeding 2025 months (file 02, editable)...')
  for (const m of data.months2025) await seedMonth(m)

  console.log('Seeding 2025 annual income statement...')
  for (const a of data.annual2025) {
    // 比率(率)列存「基點」(ratio×10000)，報表 ÷100 顯示為百分比(兩位小數)；
    // 其餘金額列存「分」(×100)。
    const isPct = a.subject.includes('率')
    const conv = (v: number) => isPct ? BigInt(Math.round((v || 0) * 10000)) : BigInt(C(v))
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

  const counts = {
    months: await prisma.monthlyPL.count(),
    lineItems: await prisma.lineItem.count(),
    employees: await prisma.employee.count(),
    payroll: await prisma.payrollEntry.count(),
    suppliers: await prisma.supplier.count(),
    annual: await prisma.annualPLLine.count(),
  }
  console.log('Seeding complete:', counts)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
