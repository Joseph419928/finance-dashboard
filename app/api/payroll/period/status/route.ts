import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'

// 薪資期別審批狀態轉換。body: { year, month, action:'submit'|'approve'|'reopen', actor? }
// DRAFT --submit--> SUBMITTED --approve--> APPROVED；reopen 退回 DRAFT。
const FLOW: Record<string, { from: string[]; to: string }> = {
  submit: { from: ['DRAFT'], to: 'SUBMITTED' },
  approve: { from: ['SUBMITTED'], to: 'APPROVED' },
  reopen: { from: ['SUBMITTED', 'APPROVED'], to: 'DRAFT' },
}
const LABEL: Record<string, string> = { submit: '送審', approve: '核准', reopen: '退回草稿' }

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const b = (body ?? {}) as Record<string, unknown>
  const p = parseYearMonth(b.year, b.month)
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })
  const action = String(b.action || '')
  const rule = FLOW[action]
  if (!rule) return NextResponse.json({ error: '動作無效' }, { status: 400 })
  const actor = String(b.actor || '').trim()

  // 期別不存在時自動建立（草稿），確保工作台永遠可操作。
  const period = await prisma.payrollPeriod.upsert({
    where: { year_month: { year: p.year, month: p.month } },
    create: { year: p.year, month: p.month, status: 'DRAFT' },
    update: {},
  })
  if (!rule.from.includes(period.status)) {
    return NextResponse.json({ error: `目前狀態（${period.status}）不可執行「${LABEL[action]}」` }, { status: 409 })
  }
  if (action === 'approve' && !actor) {
    return NextResponse.json({ error: '請填寫核准人' }, { status: 400 })
  }

  const updated = await prisma.payrollPeriod.update({
    where: { year_month: { year: p.year, month: p.month } },
    data: {
      status: rule.to,
      approver: action === 'approve' ? actor : action === 'reopen' ? '' : period.approver,
      approvedAt: action === 'approve' ? new Date() : action === 'reopen' ? null : period.approvedAt,
    },
  })
  await prisma.payrollLog.create({
    data: {
      year: p.year, month: p.month, action: action.toUpperCase(),
      actor, detail: `${LABEL[action]}${actor ? `（${actor}）` : ''}`,
    },
  })
  return NextResponse.json({ ok: true, period: updated })
}
