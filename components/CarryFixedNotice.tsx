'use client'
import { useEffect } from 'react'

export default function CarryFixedNotice({ count, from }: { count: number; from: string }) {
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('carried')
    url.searchParams.delete('from')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  return (
    <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      已自動帶入 {from} 的固定支出 {count} 筆，可直接修改。
    </div>
  )
}
