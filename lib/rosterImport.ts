// 撥款名單（薪資清冊）匯入解析。支援 .xlsx / .csv。
// 依「財務-薪資撥款名單」格式設計：姓名 / 入帳金額 / 身分證號 / 入帳帳號 / 受款人E-Mail / 公司。
// 欄位名稱以別名彈性比對，容許不同來源檔的表頭差異。
import * as XLSX from 'xlsx'

export interface RosterRow {
  name: string
  amountCents: number
  idNumber: string
  bankAccount: string
  email: string
  company: string
}

export const ROSTER_COLUMNS = ['姓名', '入帳金額', '身分證號', '入帳帳號', '受款人E-Mail', '公司'] as const

// 去空白 + 轉小寫，供欄位別名比對。
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toLowerCase()

// 別名依「優先順序」排列：入帳金額用「實發」優先於「應發」。
const FIELD_ALIASES: Record<keyof RosterRow, string[]> = {
  name: ['姓名', '員工姓名', '受款人姓名', '名字', 'name'],
  amountCents: ['入帳金額', '實發', '實發金額', '實發薪資', '撥款金額', '淨額', '應發', '金額', 'amount'],
  idNumber: ['身分證號', '身分證字號', '身份證號', '身分證', 'id'],
  bankAccount: ['入帳帳號', '匯入帳號', '銀行帳號', '帳號', 'account'],
  email: ['受款人e-mail', '受款人email', 'e-mail', 'email', '電子郵件', '信箱'],
  company: ['公司名稱', '公司', '單位', 'company'],
}

function matchColumn(cells: string[], aliases: string[]): number {
  // 先找完全相等，再找包含（避免「應扣」誤配到「應發」等）。
  for (const a of aliases) {
    const na = norm(a)
    const exact = cells.findIndex(c => c === na)
    if (exact >= 0) return exact
  }
  for (const a of aliases) {
    const na = norm(a)
    const inc = cells.findIndex(c => c.includes(na))
    if (inc >= 0) return inc
  }
  return -1
}

/** 從二維陣列（含表頭）解析出撥款名單列。找不到表頭時回傳空陣列。 */
export function parseRosterRows(rows: unknown[][]): RosterRow[] {
  let headerIdx = -1
  let colMap: Partial<Record<keyof RosterRow, number>> = {}
  const scan = Math.min(rows.length, 15)
  for (let i = 0; i < scan; i++) {
    const cells = (rows[i] || []).map(norm)
    const map: Partial<Record<keyof RosterRow, number>> = {}
    ;(Object.keys(FIELD_ALIASES) as (keyof RosterRow)[]).forEach(key => {
      const idx = matchColumn(cells, FIELD_ALIASES[key])
      if (idx >= 0) map[key] = idx
    })
    // 至少要有「姓名」與「金額」兩欄才算有效表頭。
    if (map.name !== undefined && map.amountCents !== undefined) {
      headerIdx = i
      colMap = map
      break
    }
  }
  if (headerIdx < 0) return []

  const out: RosterRow[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const cell = (k: keyof RosterRow) => (colMap[k] !== undefined ? String(r[colMap[k]!] ?? '').trim() : '')
    const name = cell('name')
    if (!name) continue
    const amtStr = colMap.amountCents !== undefined ? String(r[colMap.amountCents]! ?? '') : ''
    const amt = parseFloat(amtStr.replace(/[,\s$元]/g, ''))
    out.push({
      name,
      amountCents: Number.isFinite(amt) ? Math.round(amt * 100) : 0,
      idNumber: cell('idNumber'),
      bankAccount: cell('bankAccount'),
      email: cell('email'),
      company: cell('company'),
    })
  }
  return out
}

/** 解析上傳的檔案位元組（xlsx 或 csv 皆可）。取第一個工作表。 */
export function parseRosterFile(buf: Buffer): RosterRow[] {
  const wb = XLSX.read(buf, { type: 'buffer', raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  // raw:false → 帳號等文字欄位保留前導零；header:1 → 取原始二維陣列。
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '', raw: false })
  return parseRosterRows(rows)
}
