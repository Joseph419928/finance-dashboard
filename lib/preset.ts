export const PRESET_SCOPES = {
  LINE_ITEM: '損益細項名稱',
  SUPPLIER: '貨主名稱',
  COST_CENTER: '成本中心',
} as const

export type PresetScope = keyof typeof PRESET_SCOPES

export interface PresetDTO {
  id: number
  scope: PresetScope
  category: string
  name: string
  note: string
  costCenter: string
  active: boolean
  usageCount: number
  sortOrder: number
}

/** 去頭尾空白、全形空白轉半形、連續空白收斂。 */
export function normalizeName(v: unknown): string {
  return String(v ?? '').replace(/　/g, ' ').trim().replace(/\s+/g, ' ')
}

export function isPresetScope(v: string): v is PresetScope {
  return Object.prototype.hasOwnProperty.call(PRESET_SCOPES, v)
}
