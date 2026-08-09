import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'
import { raiseInfo, parttimePayCents, totalMinutes, minToTime } from '@/lib/payroll'

function ym(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return parseYearMonth(searchParams.get('year'), searchParams.get('month'))
}
const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? Math.round(n) : 0 }

export async function GET(req: NextRequest) {
  const p = ym(req)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  const [allEmployees, monthEntries, yearFulltime] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.payrollEntry.findMany({
      where: { year: p.year, month: p.month },
      include: { employee: true, shifts: { orderBy: { date: 'asc' } } },
    }),
    prisma.payrollEntry.findMany({
      where: { year: p.year, month: { lte: p.month }, type: 'FULLTIME' },
      orderBy: { month: 'asc' },
    }),
  ])

  // 各正職員工的年度薪資序列（到本月為止）
  const byEmp: Record<number, { salaryCents: number }[]> = {}
  for (const e of yearFulltime) (byEmp[e.employeeId] ||= []).push({ salaryCents: e.salaryCents })

  const fulltime = monthEntries.filter(e => e.type === 'FULLTIME').map(e => ({
    employeeId: e.employeeId, name: e.employee.name, salaryCents: e.salaryCents, note: e.note,
    raise: raiseInfo(byEmp[e.employeeId] || [{ salaryCents: e.salaryCents }]),
  }))

  const parttime = monthEntries.filter(e => e.type === 'PARTTIME').map(e => ({
    employeeId: e.employeeId, name: e.employee.name, hourlyCents: e.hourlyCents, note: e.note,
    shifts: e.shifts.map(s => ({ id: s.id, date: s.date, startMin: s.startMin, endMin: s.endMin, breakMin: s.breakMin, note: s.note })),
    minutes: totalMinutes(e.shifts),
    payCents: parttimePayCents(e.hourlyCents, e.shifts),
  }))

  const fulltimeTotal = fulltime.reduce((a, e) => a + e.salaryCents, 0)
  const parttimeTotal = parttime.reduce((a, e) => a + e.payCents, 0)

  return NextResponse.json({
    year: p.year, month: p.month, fulltime, parttime, allEmployees,
    totals: { fulltimeTotal, parttimeTotal, grandTotal: fulltimeTotal + parttimeTotal },
  })
}

// 整批儲存某月薪資。body: { fulltime:[{employeeId,salaryCents,note}],
//   parttime:[{employeeId,hourlyCents,note,shifts:[{date,startMin,endMin,breakMin,note}]}] }
export async function PUT(req: NextRequest) {
  const p = ym(req)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const b = (body ?? {}) as Record<string, unknown>
  const ft = Array.isArray(b.fulltime) ? b.fulltime as Record<string, unknown>[] : []
  const pt = Array.isArray(b.parttime) ? b.parttime as Record<string, unknown>[] : []

  await prisma.$transaction(async (tx) => {
    // 儲存前先比對既有班表，找出被刪除的班次，寫入操作紀錄（LOG）。
    const existingEntries = await tx.payrollEntry.findMany({
      where: { year: p.year, month: p.month },
      include: { employee: true, shifts: true },
    })
    const incomingByEmp = new Map<number, Set<string>>()
    for (const e of pt) {
      const eid = num(e.employeeId)
      if (!eid) continue
      const set = incomingByEmp.get(eid) ?? new Set<string>()
      const shifts = Array.isArray(e.shifts) ? e.shifts as Record<string, unknown>[] : []
      for (const s of shifts) {
        const d = String(s.date ?? '').trim()
        if (!d) continue
        set.add(`${d}|${num(s.startMin)}|${num(s.endMin)}`)
      }
      incomingByEmp.set(eid, set)
    }
    const deletionLogs: { year: number; month: number; action: string; employeeName: string; detail: string }[] = []
    for (const e of existingEntries) {
      const set = incomingByEmp.get(e.employeeId) ?? new Set<string>()
      for (const s of e.shifts) {
        const key = `${s.date}|${s.startMin}|${s.endMin}`
        if (!set.has(key)) {
          deletionLogs.push({
            year: p.year, month: p.month, action: 'DELETE_SHIFT', employeeName: e.employee.name,
            detail: `刪除班表 ${s.date} ${minToTime(s.startMin)}-${minToTime(s.endMin)}`,
          })
        }
      }
    }

    await tx.payrollEntry.deleteMany({ where: { year: p.year, month: p.month } }) // shifts cascade
    if (deletionLogs.length) await tx.payrollLog.createMany({ data: deletionLogs })
    for (const e of ft) {
      const employeeId = num(e.employeeId)
      if (!employeeId) continue
      await tx.payrollEntry.create({
        data: { year: p.year, month: p.month, employeeId, type: 'FULLTIME', salaryCents: num(e.salaryCents), note: String(e.note ?? '') },
      })
    }
    for (const e of pt) {
      const employeeId = num(e.employeeId)
      if (!employeeId) continue
      const shifts = Array.isArray(e.shifts) ? e.shifts as Record<string, unknown>[] : []
      await tx.payrollEntry.create({
        data: {
          year: p.year, month: p.month, employeeId, type: 'PARTTIME',
          hourlyCents: num(e.hourlyCents), note: String(e.note ?? ''),
          shifts: {
            create: shifts
              .filter(s => String(s.date ?? '').trim())
              .map(s => ({
                date: String(s.date), startMin: num(s.startMin), endMin: num(s.endMin),
                breakMin: num(s.breakMin), note: String(s.note ?? ''),
              })),
          },
        },
      })
    }
  })
  return NextResponse.json({ ok: true })
}
