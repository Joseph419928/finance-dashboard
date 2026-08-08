'use client'
import { useEffect, useState } from 'react'
import { normalizeName, type PresetDTO, type PresetScope } from '@/lib/preset'

const cache = new Map<string, Promise<PresetDTO[]>>()
const subscribers = new Map<string, Set<() => void>>()

export function invalidatePresetCache(scope?: PresetScope, category = '') {
  if (scope) {
    const key = cacheKey(scope, category)
    cache.delete(key)
    subscribers.get(key)?.forEach(notify => notify())
  } else {
    cache.clear()
    subscribers.forEach(group => group.forEach(notify => notify()))
  }
}

function cacheKey(scope: PresetScope, category: string) {
  return `${scope}:${category}`
}

function subscribe(key: string, notify: () => void) {
  let group = subscribers.get(key)
  if (!group) {
    group = new Set()
    subscribers.set(key, group)
  }
  group.add(notify)
  return () => {
    group?.delete(notify)
    if (group?.size === 0) subscribers.delete(key)
  }
}

function fetchPresets(scope: PresetScope, category: string) {
  const key = cacheKey(scope, category)
  let request = cache.get(key)
  if (!request) {
    const query = new URLSearchParams({ scope })
    if (scope === 'LINE_ITEM') query.set('category', category)
    request = fetch(`/api/preset?${query}`).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '名稱載入失敗')
      return data.presets as PresetDTO[]
    })
    cache.set(key, request)
  }
  return request
}

interface Props {
  scope: PresetScope
  category?: string
  value: string
  onChange: (name: string, preset?: PresetDTO) => void
  className?: string
  placeholder?: string
}

export default function PresetSelect({
  scope,
  category = '',
  value,
  onChange,
  className = 'input-sm',
  placeholder = '選擇名稱…',
}: Props) {
  const [presets, setPresets] = useState<PresetDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [custom, setCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => subscribe(cacheKey(scope, category), () => setReload(value => value + 1)), [scope, category])

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    fetchPresets(scope, category)
      .then(rows => { if (live) setPresets(rows) })
      .catch(err => { if (live) setError(err instanceof Error ? err.message : '名稱載入失敗') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [scope, category, reload])

  async function createCustom() {
    const name = normalizeName(customName)
    if (!name) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/preset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, category, name }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '新增失敗')
      const preset = data.preset as PresetDTO
      invalidatePresetCache(scope, category)
      setPresets(rows => [...rows.filter(row => row.id !== preset.id), preset])
      setCustom(false)
      setCustomName('')
      onChange(preset.name, preset)
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗')
    } finally {
      setSaving(false)
    }
  }

  if (custom) {
    return (
      <div className={`${className} h-auto p-1 flex gap-1`}>
        <input className="min-w-0 flex-1 outline-none" autoFocus value={customName} onChange={e => setCustomName(e.target.value)} placeholder="輸入新名稱" />
        <button type="button" disabled={saving} className="text-emerald-700 text-xs" onClick={createCustom}>確定</button>
        <button type="button" disabled={saving} className="text-slate-500 text-xs" onClick={() => { setCustom(false); setCustomName('') }}>取消</button>
        {error && <span className="text-rose-600 text-xs">{error}</span>}
      </div>
    )
  }

  if (loading) return <select className={className} disabled value=""><option value="">載入中…</option></select>
  if (error) {
    return (
      <div className="flex items-center gap-1 text-xs text-rose-600">
        <span>{error}</span>
        <button type="button" className="underline" onClick={() => invalidatePresetCache(scope, category)}>重試</button>
        <button type="button" className="underline" onClick={() => setCustom(true)}>輸入新名稱</button>
      </div>
    )
  }

  const selected = presets.find(preset => preset.name === value)
  const isExisting = Boolean(value && !selected)
  return (
    <select
      className={className}
      value={value}
      onChange={event => {
        if (event.target.value === '__CUSTOM__') {
          setCustomName('')
          setCustom(true)
          return
        }
        const preset = presets.find(row => row.name === event.target.value)
        onChange(event.target.value, preset)
      }}
    >
      {isExisting && <option value={value}>{value}（既有）</option>}
      <option value="">{placeholder}</option>
      {presets.length > 0 && <option disabled value="__COMMON__">── 常用 ──</option>}
      {presets.map(preset => <option key={preset.id} value={preset.name}>{preset.name}</option>)}
      <option value="__CUSTOM__">── ＋ 輸入新名稱… ──</option>
    </select>
  )
}
