import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// 薪資 / 班表操作紀錄。可選 year & month 過濾；預設取最新 200 筆。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const where = Number.isInteger(year) && Number.isInteger(month) && year > 0 && month > 0
    ? { year, month } : {}
  const logs = await prisma.payrollLog.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
  })
  return NextResponse.json({ logs })
}
