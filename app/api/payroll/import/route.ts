import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseYearMonth } from '@/lib/pl'
import { parseRosterFile } from '@/lib/rosterImport'

export const runtime = 'nodejs'

// 匯入撥款名單至指定年月。multipart/form-data：file（xlsx/csv）、mode（replace|append）。
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const p = parseYearMonth(searchParams.get('year'), searchParams.get('month'))
  if (!p) return NextResponse.json({ error: '年月參數無效' }, { status: 400 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })
  const mode = String(form.get('mode') || 'replace') === 'append' ? 'append' : 'replace'

  let rows
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    rows = parseRosterFile(buf)
  } catch {
    return NextResponse.json({ error: '檔案解析失敗，請確認為 Excel(.xlsx) 或 CSV 格式' }, { status: 400 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: '找不到可匯入的資料，請確認檔案含「姓名」與「入帳金額 / 實發」欄位' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    if (mode === 'replace') await tx.payrollRoster.deleteMany({ where: { year: p.year, month: p.month } })
    let sort = mode === 'append' ? await tx.payrollRoster.count({ where: { year: p.year, month: p.month } }) : 0
    for (const r of rows) {
      await tx.payrollRoster.create({
        data: {
          year: p.year, month: p.month, name: r.name, amountCents: r.amountCents,
          idNumber: r.idNumber, bankAccount: r.bankAccount, email: r.email, company: r.company, sortOrder: sort++,
        },
      })
    }
    await tx.payrollLog.create({
      data: {
        year: p.year, month: p.month, action: 'IMPORT_ROSTER',
        detail: `匯入撥款名單 ${rows.length} 筆（${file.name}｜${mode === 'replace' ? '覆蓋' : '附加'}）`,
      },
    })
  })

  const totalCents = rows.reduce((a, r) => a + r.amountCents, 0)
  return NextResponse.json({ ok: true, imported: rows.length, totalCents, mode })
}
