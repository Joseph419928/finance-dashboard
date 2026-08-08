'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { PRESET_SCOPES, type PresetDTO, type PresetScope } from '@/lib/preset'
import { invalidatePresetCache } from '@/components/PresetSelect'

interface EditRow extends PresetDTO {
  originalName: string
  applyRename: boolean
  busy?: boolean
}

export default function PresetSettingsPage() {
  const [scope, setScope] = useState<PresetScope>('LINE_ITEM')
  const [category, setCategory] = useState(CATEGORIES[0].key)
  const [rows, setRows] = useState<EditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ scope, all: '1' })
    if (scope === 'LINE_ITEM') query.set('category', category)
    try {
      const response = await fetch(`/api/preset?${query}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '載入失敗')
      setRows((data.presets as PresetDTO[]).map(row => ({ ...row, originalName: row.name, applyRename: false })))
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [scope, category])

  useEffect(() => { load() }, [load])

  function update(id: number, patch: Partial<EditRow>) {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  async function add() {
    setError('')
    const response = await fetch('/api/preset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, category: scope === 'LINE_ITEM' ? category : '', name: newName }),
    })
    const data = await response.json()
    if (!response.ok) { setError(data.error || '新增失敗'); return }
    setNewName('')
    invalidatePresetCache(scope, scope === 'LINE_ITEM' ? category : '')
    setMessage(`已新增「${data.preset.name}」`)
    await load()
  }

  async function save(row: EditRow) {
    const renamed = row.name !== row.originalName
    update(row.id, { busy: true })
    setError('')
    if (renamed && row.applyRename) {
      try {
        const impactResponse = await fetch(`/api/preset/${row.id}`)
        const impact = await impactResponse.json()
        if (!impactResponse.ok) throw new Error(impact.error || '無法取得影響筆數')
        const ok = confirm(`將「${row.originalName}」改名為「${row.name}」，並同步更新既有 ${impact.affectedRows} 筆資料？此動作無法自動復原。`)
        if (!ok) { update(row.id, { busy: false }); return }
      } catch (err) {
        setError(err instanceof Error ? err.message : '無法取得影響筆數')
        update(row.id, { busy: false })
        return
      }
    }
    try {
      const response = await fetch(`/api/preset/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.name,
          note: row.note,
          costCenter: row.costCenter,
          active: row.active,
          sortOrder: row.sortOrder,
          applyRename: row.applyRename,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '儲存失敗')
      invalidatePresetCache(scope, scope === 'LINE_ITEM' ? category : '')
      const detail = data.updatedRows > 0 ? `，同步更新 ${data.updatedRows} 筆既有資料${data.merged ? '並完成字典合併' : ''}` : ''
      setMessage(`已儲存「${data.preset.name}」${detail}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗')
      update(row.id, { busy: false })
    }
  }

  async function disable(row: EditRow) {
    if (!confirm(`停用「${row.name}」？既有財務資料不會被刪除或修改。`)) return
    const response = await fetch(`/api/preset/${row.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) { setError(data.error || '停用失敗'); return }
    invalidatePresetCache(scope, scope === 'LINE_ITEM' ? category : '')
    setMessage(`已停用「${row.name}」，既有資料不受影響`)
    await load()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">名稱設定</h1>
        <p className="text-sm text-slate-500 mt-1">管理下拉名稱。停用不會改動既有資料；同步改名會影響年度彙總，請逐筆確認。</p>
      </div>

      <div className="card flex flex-wrap gap-2">
        {(Object.keys(PRESET_SCOPES) as PresetScope[]).map(key => (
          <button key={key} className={scope === key ? 'btn-primary' : 'btn-secondary'} onClick={() => setScope(key)}>{PRESET_SCOPES[key]}</button>
        ))}
      </div>

      {scope === 'LINE_ITEM' && (
        <div className="card flex flex-wrap gap-2">
          {CATEGORIES.map(item => (
            <button key={item.key} className={category === item.key ? 'btn-primary' : 'btn-ghost'} onClick={() => setCategory(item.key)}>{item.label}</button>
          ))}
        </div>
      )}

      {error && <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {message && <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm">{message} <Link className="underline ml-2" href="/report/2025">查看 2025 年報</Link></div>}

      <div className="card flex gap-2 items-end">
        <div className="flex-1"><label className="label">新增名稱</label><input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="輸入標準名稱" /></div>
        <button className="btn-primary" onClick={add}>＋ 新增名稱</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <div className="text-center py-10 text-slate-400">載入中…</div> : (
          <div className="min-w-[900px] space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-400 px-1">
              <div className="col-span-3">名稱</div><div className="col-span-2">預設成本中心</div><div className="col-span-2">預設備註</div>
              <div>排序</div><div>使用次數</div><div>啟用</div><div className="col-span-2">操作</div>
            </div>
            {rows.map(row => (
              <div key={row.id} className={`grid grid-cols-12 gap-2 items-center rounded-lg p-1 ${row.active ? '' : 'bg-slate-50 opacity-70'}`}>
                <div className="col-span-3">
                  <input className="input-sm" value={row.name} onChange={e => update(row.id, { name: e.target.value })} />
                  {row.name !== row.originalName && (
                    <label className="flex items-center gap-1 text-[11px] text-amber-700 mt-1">
                      <input type="checkbox" checked={row.applyRename} onChange={e => update(row.id, { applyRename: e.target.checked })} /> 同步更新既有資料
                    </label>
                  )}
                </div>
                <input className="input-sm col-span-2" value={row.costCenter} onChange={e => update(row.id, { costCenter: e.target.value })} />
                <input className="input-sm col-span-2" value={row.note} onChange={e => update(row.id, { note: e.target.value })} />
                <input className="input-sm" type="number" value={row.sortOrder} onChange={e => update(row.id, { sortOrder: Number(e.target.value) || 0 })} />
                <div className="text-sm text-slate-600 tabular-nums" title="為上次執行 db:presets 時的統計，僅供下拉排序參考">{row.usageCount}</div>
                <label className="text-sm"><input type="checkbox" checked={row.active} onChange={e => update(row.id, { active: e.target.checked })} /> {row.active ? '是' : '否'}</label>
                <div className="col-span-2 flex gap-1">
                  <button className="btn-primary" disabled={row.busy} onClick={() => save(row)}>{row.busy ? '儲存中…' : '儲存'}</button>
                  {row.active && <button className="btn-danger" onClick={() => disable(row)}>停用</button>}
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="text-center py-8 text-slate-400">目前沒有名稱，可由上方新增。</div>}
          </div>
        )}
      </div>
    </div>
  )
}
