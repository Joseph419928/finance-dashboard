import { prisma } from '@/lib/db'
import { fmtCurrency } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

const MONTH_LABELS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

export default async function Report2025Page() {
  const lines = await prisma.annualPLLine.findMany({
    where: { year: 2025 }, orderBy: { sortOrder: 'asc' },
  })

  // BigInt → Number（年度數十億分仍遠小於 2^53，安全）
  const n = (v: bigint) => Number(v)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">2025 年度損益表</h1>
        <p className="text-sm text-slate-500 mt-1">依檔案 02 忠實重現（唯讀）。小計列以粗體標示，不重複加總。</p>
      </div>

      <div className="card-flush overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="th text-left sticky left-0 bg-slate-50 z-10 min-w-[200px]">會計科目</th>
              {MONTH_LABELS.map(m => <th key={m} className="th-r">{m}</th>)}
              <th className="th-r bg-slate-100 text-slate-700">年度總計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map(l => {
              const months = [l.m1, l.m2, l.m3, l.m4, l.m5, l.m6, l.m7, l.m8, l.m9, l.m10, l.m11, l.m12]
              const isPct = l.subject.includes('率')
              return (
                <tr key={l.id} className={l.isSubtotal ? 'bg-slate-50 font-semibold text-slate-800' : 'hover:bg-slate-50/60'}>
                  <td className={`td sticky left-0 z-10 ${l.isSubtotal ? 'bg-slate-50 font-semibold' : 'bg-white'} ${l.indent ? 'pl-6 text-slate-600' : 'font-medium text-slate-800'}`}>
                    {l.subject}
                  </td>
                  {months.map((v, i) => (
                    <td key={i} className="td-r text-slate-600">
                      {isPct ? (n(v) === 0 ? '—' : `${(n(v) / 100).toFixed(1)}%`) : (n(v) === 0 ? '—' : fmtCurrency(n(v)))}
                    </td>
                  ))}
                  <td className={`td-r bg-slate-50/60 ${l.isSubtotal ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                    {isPct ? `${(n(l.total) / 100).toFixed(1)}%` : fmtCurrency(n(l.total))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">金額以整數「分」精確儲存，顯示時換算為元，完整顯示不縮寫。</p>
    </div>
  )
}
