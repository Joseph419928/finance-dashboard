# 財務管理系統 — 資料自動帶入（貨主／薪資匯入・固定支出續期）開發規格

> 給 **CODEX** 的執行規格；完成後由 Claude 審核。
> 前置文件：[`ACCOUNTING_FIX_SPEC.md`](./ACCOUNTING_FIX_SPEC.md)（損益表分層與科目定義，本規格沿用其結論，不得推翻）。
> 金額一律維持「分（整數 cents）」內部儲存，僅顯示／輸入時換算為元（沿用 `lib/money.ts`、`components/MoneyInput.tsx`）。

---

## 0. 需求（使用者原話）

1. 頁面中的**貨主**和**薪資**，多一個按鈕可以直接匯入到該期的相對應欄位
   （例：2026 年 7 月的薪資，直接代入 2026 年 7 月的損益表，使用者不用再手動輸入）。
2. 每個月的**固定支出**，從上一期自動代入，不要再讓使用者手動輸入。
3. 讓使用者可以用**選取**的，不要用手打的 —— 每期都會不一樣說法。

對應章節：I1／I2（第 5、6 節）＝需求 1；I3（第 7 節）＝需求 2；**I4／I5（第 9、10 節）＝需求 3**。

---

## 1. 現況分析（實作前務必理解，勿重複造輪子）

| 模組 | 資料表 | 目前行為 |
|---|---|---|
| 月結貨主 | `Supplier(year, month, name, amountCents, note, sortOrder)` | [`app/suppliers/page.tsx`](app/suppliers/page.tsx) 獨立維護，**與損益表完全沒有連動**。已有「↻ 帶入上一期名單」（`POST /api/supplier/carry`，金額歸 0）。 |
| 薪資 | `PayrollEntry` + `Shift` | [`app/payroll/page.tsx`](app/payroll/page.tsx) 獨立維護，**與損益表完全沒有連動**。已有「↻ 帶入上一期」（`POST /api/payroll/carry`，複製月薪／時薪，不複製工時）。 |
| 損益表 | `MonthlyPL` + `LineItem` | [`components/PLForm.tsx`](components/PLForm.tsx) 逐筆手動輸入；儲存時 `PUT /api/pl/[id]` **整批取代**該月所有 `LineItem`，再由 [`lib/monthly.ts`](lib/monthly.ts) `recomputeTotals()` 重算各分類快取總額。 |

**目前的痛點（本規格要解決的根因）**

- `prisma/schema.prisma:41` 註解寫「`payrollTotal` 來自薪資模組」，但實際上 `recomputeTotals()` 是**以 `LineItem` 加總覆寫**所有分類總額。
  ⇒ 薪資模組即使有資料，只要沒有 `category='PAYROLL'` 的 `LineItem`，損益表的薪資費用就是 0。這正是使用者被迫手動重打的原因。
- 本規格的解法方向：**維持 `LineItem` 為唯一資料來源**（不要改成雙軌加總），改由「匯入」動作把貨主／薪資**具體化（materialize）成 `LineItem`**。
  ⇒ `recomputeTotals()`、`lib/annualReport.ts`、儀表板、年報全部不必改，自動一致。
- 完成後請一併修正 `prisma/schema.prisma:41` 的註解，改為「= 對應 LineItem 加總；可由薪資模組匯入產生」。

---

## 2. 執行原則（務必遵守）

1. **不破壞既有資料**：schema 只新增欄位、不刪不改型別；提供 Prisma migration。
2. **單一資料來源**：分類定義在 `lib/categories.ts`、損益計算在 `lib/types.ts`、總額重算在 `lib/monthly.ts`。匯入邏輯集中在**新檔** `lib/importPL.ts`，不得散落在 route 或頁面。
3. **冪等（重複點擊不重複計算）**：匯入以 `source` 為單位「整批取代」，同一期重複匯入結果相同。
4. **不吃掉使用者手打的資料**：匯入只會刪除**同分類且同 source** 的列，`source='MANUAL'` 的列一律保留。
5. **分（cents）整數制不變**：不得引入浮點儲存；所有金額運算用 `Math.round`。
6. 每完成一個 I 項目，執行 `npx tsc --noEmit` 與 `npm run build` 確認無型別／建置錯誤，再進行下一項。

---

## 3. 資料模型變更

### 3.1 `LineItem` 新增 `source` 欄位

```prisma
model LineItem {
  id          Int       @id @default(autoincrement())
  monthlyPLId Int
  category    String
  label       String
  amountCents Int       @default(0)
  note        String    @default("")
  costCenter  String    @default("")
  sortOrder   Int       @default(0)
  // 來源標記：MANUAL（手動輸入）/ SUPPLIER（貨主模組匯入）/ PAYROLL（薪資模組匯入）/ CARRY_FIXED（上期固定支出帶入）
  // 匯入時以 (monthlyPLId, category, source) 為單位整批取代，確保冪等且不影響手動列。
  source      String    @default("MANUAL")
  monthlyPL   MonthlyPL @relation(fields: [monthlyPLId], references: [id], onDelete: Cascade)

  @@index([monthlyPLId, category])
  @@index([monthlyPLId, source])
}
```

Migration：`npx prisma migrate dev --name add_lineitem_source`
既有資料因 `@default("MANUAL")` 自動補值，無須資料轉換腳本。
`prisma/seed.ts`、`prisma/seed-prod.cjs`、`prisma/reclassify.cjs` **不需修改**（預設值即可）。

### 3.2 新檔 `lib/lineSource.ts`

```ts
// LineItem 來源標記（單一資料來源）。決定匯入／帶入時的取代範圍與 UI 標籤。
export const LINE_SOURCES = {
  MANUAL:      { label: '手動',     badge: '' },
  SUPPLIER:    { label: '貨主匯入', badge: '貨主' },
  PAYROLL:     { label: '薪資匯入', badge: '薪資' },
  CARRY_FIXED: { label: '上期帶入', badge: '上期' },
} as const

export type LineSource = keyof typeof LINE_SOURCES

export function isLineSource(v: string): v is LineSource {
  return Object.prototype.hasOwnProperty.call(LINE_SOURCES, v)
}

/** 清洗未知值 → MANUAL（相容舊資料與外部輸入）。 */
export function toLineSource(v: unknown): LineSource {
  const s = String(v ?? '')
  return isLineSource(s) ? s : 'MANUAL'
}
```

### 3.3 型別與清洗層同步

- `lib/types.ts` 的 `interface LineItem` 加上 `source: LineSource`（由 `lib/lineSource.ts` import，不要重新定義字串聯集）。
- `lib/pl.ts`：
  - `CleanLineItem` 加上 `source: LineSource`。
  - `sanitizeLineItems()` 內以 `toLineSource(r.source)` 取值（未帶則為 `MANUAL`）。
    ⚠️ 這是**必要**的：`PUT /api/pl/[id]` 會整批取代所有 `LineItem`，若前端不回送 `source`，匯入標記會在使用者按下「儲存」後全部退化成 `MANUAL`，第二次匯入就會產生重複列。

### 3.4 `lib/monthly.ts` 支援交易內重算

`recomputeTotals()` 目前直接用 `prisma`，匯入需要在同一交易中完成，改為可注入 client：

```ts
import { Prisma } from '@prisma/client'
type Db = Prisma.TransactionClient | typeof prisma

export async function recomputeTotals(monthlyPLId: number, db: Db = prisma) { /* 內部一律用 db */ }
```

既有呼叫端（`app/api/pl/[id]/route.ts:46`）不需改動（第二參數有預設值）。

---

## 4. 共用匯入核心 `lib/importPL.ts`（新檔）

**所有匯入／帶入 API 都必須經由這支，不得各自實作。**

```ts
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ensureMonth, recomputeTotals } from '@/lib/monthly'
import type { Category } from '@/lib/categories'
import type { LineSource } from '@/lib/lineSource'

export interface ImportRow {
  label: string
  amountCents: number
  note?: string
  costCenter?: string
}

export interface ImportResult {
  monthlyPLId: number
  year: number
  month: number
  category: Category
  source: LineSource
  /** 本次寫入筆數 */
  imported: number
  /** 本次被取代（刪除）的舊筆數 */
  replaced: number
  /** 本次寫入金額合計（分） */
  totalCents: number
  /** 同分類下 source='MANUAL' 的既有筆數（供 UI 提醒可能重複） */
  manualCount: number
  /** 更新後該月完整明細，供前端直接 setState，不必重新 fetch */
  lineItems: LineItemDTO[]
}

/**
 * 以 (該月, category, source) 為單位整批取代細項，並重算分類總額快取。
 * - 該月 MonthlyPL 不存在時自動建立（ensureMonth）。
 * - rows 為空陣列時：不刪除、不寫入，直接回傳 imported=0, replaced=0（避免誤清空）。
 * - 全程單一 transaction。
 */
export async function replaceSourcedLineItems(
  year: number, month: number, category: Category, source: LineSource, rows: ImportRow[],
): Promise<ImportResult>
```

實作要點：

1. `const pl = await ensureMonth(year, month)`。
2. `prisma.$transaction(async tx => { ... })`：
   - `replaced = (await tx.lineItem.deleteMany({ where: { monthlyPLId: pl.id, category, source } })).count`
   - 取 `maxSort = (await tx.lineItem.aggregate({ where: { monthlyPLId: pl.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1`
   - `createMany` 寫入 `rows`，`sortOrder = maxSort + 1 + i`，`amountCents: Math.round(r.amountCents)`，`note`/`costCenter` 預設 `''`。
   - `await recomputeTotals(pl.id, tx)`
3. 交易外再查一次完整 `lineItems`（`orderBy: { sortOrder: 'asc' }`）與 `manualCount`，組成 `ImportResult`。
4. **空列過濾**：`label` 空白且 `amountCents === 0` 的列不寫入（與 `sanitizeLineItems` 一致）。
5. 金額為 0 但有名稱的列**要**寫入（貨主當月無交易也應留痕）。

---

## 5. I1 — 貨主 → 損益表「營業成本（採購）」匯入

**目標分類**：`PROCUREMENT`（`statementGroup: 'COGS'`），`source='SUPPLIER'`。

### 5.1 API：`POST /api/pl/import/supplier`（新檔 `app/api/pl/import/supplier/route.ts`）

- Request：`{ year: number, month: number }`
- 驗證：`parseYearMonth()`（`lib/pl.ts`）；無效 → `400 { error: '年月參數無效' }`
- 讀取：`prisma.supplier.findMany({ where: { year, month }, orderBy: { sortOrder: 'asc' } })`
- 該期無貨主資料（`length === 0`）→ 回 `200 { ok: true, imported: 0, replaced: 0, message: '該期尚無貨主資料，未做任何變更' }`，**不得刪除既有匯入列**。
- 映射：

  | Supplier | → LineItem |
  |---|---|
  | `name`（空白時用 `(未命名貨主)`） | `label` |
  | `amountCents` | `amountCents` |
  | `note` | `note` |
  | — | `costCenter: ''`、`category: 'PROCUREMENT'`、`source: 'SUPPLIER'` |

- 呼叫 `replaceSourcedLineItems(year, month, 'PROCUREMENT', 'SUPPLIER', rows)`
- Response：`200 { ok: true, target: '2026/07', ...ImportResult }`

### 5.2 UI：`app/suppliers/page.tsx`

在「↻ 帶入上一期名單」右側新增按鈕：

```
⇩ 匯入至 {year}/{month} 損益表
```

行為（**順序不可調換**）：

1. `confirm()`：
   `將 2026/07 的貨主明細（共 N 筆、合計 $X）匯入 2026/07 損益表的「營業成本（採購）」？\n\n• 會先儲存本頁目前的編輯內容\n• 損益表中先前由貨主匯入的列會被取代\n• 手動輸入的列不受影響`
2. **先呼叫既有 `save()`**（`PUT /api/supplier`）確保 DB 與畫面一致 —— 匯入讀的是 DB，不是畫面狀態。`save()` 失敗即中止並顯示錯誤。
3. `POST /api/pl/import/supplier`。
4. 成功訊息（`msg` state）：`已匯入 N 筆至 2026/07 損益表（合計 $X）`，並附 `next/link` → `/monthly/{year}/{month}`。
   若 `manualCount > 0`，追加提醒：`另有 N 筆手動輸入的營業成本，請確認是否重複。`
   若 `imported === 0`，顯示 API 回傳的 `message`。
5. 匯入期間按鈕 `disabled`，文字改「匯入中…」。

`save()` 需改為回傳 `boolean`（成功與否），供上述流程判斷。

---

## 6. I2 — 薪資 → 損益表「人事薪資」匯入

**目標分類**：`PAYROLL`（`statementGroup: 'OPEX'`），`source='PAYROLL'`。

### 6.1 API：`POST /api/pl/import/payroll`（新檔 `app/api/pl/import/payroll/route.ts`）

- Request / 驗證同 I1。
- 讀取：`prisma.payrollEntry.findMany({ where: { year, month }, include: { employee: true, shifts: true } })`，
  排序 `[{ type: 'asc' }, { employeeId: 'asc' }]`（FULLTIME 在前，與畫面一致）。
- 無資料 → 同 I1 的空集合處理。
- **金額計算一律沿用 `lib/payroll.ts`，不得在 route 內重算工時**：

  | 類型 | `label` | `amountCents` | `note` |
  |---|---|---|---|
  | `FULLTIME` | `${employee.name}（正職）` | `salaryCents` | `月薪` + （entry.note 非空時附加 `・${note}`） |
  | `PARTTIME` | `${employee.name}（PT）` | `parttimePayCents(hourlyCents, shifts)` | `工時 ${(totalMinutes(shifts)/60).toFixed(1)} 小時 × 時薪 ${fmtCurrency(hourlyCents)}` + （entry.note 非空時附加 `・${note}`） |

  > 明細層級刻意採「逐員工一列」，與系統其他分類的明細粒度一致，年報 `lib/annualReport.ts` 依 `label` 逐月彙總也才有意義。彙總成單筆不在本次範圍。

- 呼叫 `replaceSourcedLineItems(year, month, 'PAYROLL', 'PAYROLL', rows)`
- Response 同 I1。

### 6.2 UI：`app/payroll/page.tsx`

在「↻ 帶入上一期」右側新增 `⇩ 匯入至 {year}/{month} 損益表`，流程與 5.2 完全相同（先 `save()`（`PUT /api/payroll`）再匯入），確認文字改為「人事薪資」、合計顯示 `ftTotal + ptTotal`。

---

## 7. I3 — 每月固定支出自動帶入上一期

**目標分類**：`FIXED`（每月固定支出／租金費用），`source='CARRY_FIXED'`。
**與貨主／薪資的差異：金額要一起帶（不歸零）**，因為使用者的需求就是「不要再手動輸入」。

### 7.1 API：`POST /api/pl/carry/fixed`（新檔 `app/api/pl/carry/fixed/route.ts`）

- Request：`{ year, month }`，驗證同上。
- 找「最近一個較早、且有 `FIXED` 明細」的月份：

```ts
const prev = await prisma.lineItem.findFirst({
  where: {
    category: 'FIXED',
    monthlyPL: { OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
  },
  orderBy: [{ monthlyPL: { year: 'desc' } }, { monthlyPL: { month: 'desc' } }],
  select: { monthlyPL: { select: { id: true, year: true, month: true } } },
})
```

- 查無 → `200 { ok: true, copied: 0, message: '查無上一期固定支出資料' }`（不做任何變更）。
- 取該月全部 `FIXED` 明細（`orderBy: { sortOrder: 'asc' }`），映射 `label` / `amountCents` / `note` / `costCenter` 原樣複製（**含金額**），`source='CARRY_FIXED'`。
  - 來源列不論其原本 `source` 為何（`MANUAL` 或 `CARRY_FIXED`）皆可被複製；寫入本期後一律標記 `CARRY_FIXED`。
- `replaceSourcedLineItems(year, month, 'FIXED', 'CARRY_FIXED', rows)`
- Response：`200 { ok: true, from: '2026/06', ...ImportResult }`

### 7.2 建立新月份時自動帶入

修改 `app/api/pl/route.ts` 的 `POST`：

```ts
// body: { year, month, carryFixed?: boolean }  預設 carryFixed = true
```

1. 先 `findUnique({ where: { year_month: ... } })` 判斷是否為「新建」。
2. 沿用既有 `upsert` 建立容器。
3. **僅在「本次為新建」且 `carryFixed !== false` 時**執行 7.1 的帶入邏輯（抽成 `lib/importPL.ts` 的 `carryFixedFromPrevious(year, month)` 供兩處共用，不要複製貼上）。
   - 已存在的月份一律不動，避免覆蓋既有資料。
4. Response 追加：`{ ...record, carriedFixed: number, carriedFrom: string | null }`。

修改 `app/monthly/new/page.tsx`：

- 新增 checkbox：`自動帶入上一期的每月固定支出`，預設 **勾選**，state `carryFixed`，隨 POST body 送出。
- 說明文字：`會把上一期「每月固定支出」的項目與金額原樣複製到新月份，之後仍可自行修改。`
- 建立成功後仍導向 `/monthly/{year}/{month}`（若 `carriedFixed > 0`，可用 query `?carried=N` 帶過去顯示提示，非必要）。

### 7.3 既有月份的手動帶入

在 `PLForm` 的 `FIXED` 區段提供「↻ 帶入上一期固定支出」按鈕（見第 8 節）。

---

## 8. `components/PLForm.tsx` 調整

### 8.1 `Row` 型別與往返

- `interface Row` 加 `source: LineSource`；初始化時 `source: (li.source as LineSource) ?? 'MANUAL'`。
- `addRow()` 建立的新列 `source: 'MANUAL'`。
- `save()` 的 payload 每列**必須**帶 `source`（呼應 3.3 的警告）。

### 8.2 區段內的匯入按鈕

`CategorySection` 新增 optional prop `action?: React.ReactNode`，於標題列右側渲染。三個分類掛上按鈕：

| 分類 | 按鈕 | 呼叫 |
|---|---|---|
| `PROCUREMENT` | `⇩ 由貨主模組匯入` | `POST /api/pl/import/supplier` |
| `PAYROLL` | `⇩ 由薪資模組匯入` | `POST /api/pl/import/payroll` |
| `FIXED` | `↻ 帶入上一期固定支出` | `POST /api/pl/carry/fixed` |

**共用流程 `runImport(url, confirmText)`（三個按鈕共用一支）**：

1. `confirm(confirmText)`（點明：會先儲存目前編輯內容；同來源既有列會被取代；手動列不受影響）。
2. `await save()` —— **必要**。`PLForm` 儲存時是整批取代 `LineItem`，若先匯入再儲存，畫面上的舊 state 會把剛匯入的資料蓋掉。
3. `POST` 匯入 API（body 帶 `record.year` / `record.month`）。
4. **以回應中的 `lineItems` 重建本地 state**：

```ts
setRows(res.lineItems.map(li => ({ cid: newCid(), category: li.category, label: li.label,
  amountCents: li.amountCents, note: li.note, costCenter: li.costCenter || '', source: li.source })))
```

   ⚠️ 不可只靠 `router.refresh()`。`rows` 是 `useState(初始值)`，server component 重新渲染**不會**重設既有 state，畫面會停在匯入前的內容。
5. 顯示結果訊息（沿用 `savedAt` 旁的區域或新增 `hint` state）；`imported === 0` 時顯示 API 的 `message`。
6. 進行中按鈕 `disabled`。

`save()` 需改為 `Promise<boolean>`，回傳成功與否。

### 8.3 來源標記顯示

每列 `label` 輸入框左側或後方，`source !== 'MANUAL'` 時顯示小標籤（沿用 `.badge` 樣式）：
`貨主` / `薪資` / `上期`，`title` 屬性寫完整說明（例：`由貨主模組匯入，重新匯入會取代此列`）。
**列本身仍可編輯、可刪除**（不上鎖），但區段說明加一行灰字：
`標示來源的列會在下次匯入時被覆蓋，手動調整請改為新增一列。`

---

## 9. I4 — 項目名稱改為「選取」而非「手打」

### 9.1 問題實證（不是假設，是現有資料）

`lib/annualReport.ts:56` 的 `aggregateLeafRows()` 是**以 `label` 字串完全相等**來逐月彙總的。
只要同一件事每期寫法不同，年度損益表就會裂成好幾列，月與月之間也無法比較。

實際掃描 `prisma/seed_data.json`（2025 + 2026）的結果：

| 分類 | 筆數 | 相異名稱數 | 同一件事的不同寫法（節錄） |
|---|---|---|---|
| `FIXED` | 161 | **26** | `車輛_租金_小車-3875` / `小車-3875`；`車輛_租金_裕隆-5381` / `裕隆-5381`；`租金_房租_中和` / `房租`；`車輛_租金_租賃車-6687` / `租金_租賃車_6687`；`車輛_貸款_賓士_6836` / `賓士` |
| `OPERATING` | 97 | **23** | `車輛_加油費` / `油資`；`行政_租金_影印機` / `租金_影印機`；`車輛_停車費_市場` / `停車費`；`水電瓦斯費_市場` / `水電費用` / `租金& 水電費-市場` |
| `PAYROLL` | 45 | 7 | `職工福利_早餐` / `職工福利_中和_早餐` / `職工福利_市場_早餐` |
| `REVENUE` | 16 | 2 | `營業收入` / `營業收入(現金)` |
| `CENTRAL` | 15 | 2 | `公司信用卡_中區` / `中區支出` |

> 可見 2025 年用口語命名、2026 年改用「大類_子類_標的」結構化命名。
> **新資料一律採 2026 的結構化命名法**；舊資料的合併另見 I5。

**解法**：建立「名稱字典」（`ItemPreset`），輸入介面由**自由文字框改為下拉選單**，只有在字典裡沒有時才允許新增（新增即入字典，下期直接選）。

### 9.2 Schema：新增 `ItemPreset`

```prisma
// 可選取的名稱字典。讓各期名稱一致，年度彙總才不會裂成多列。
model ItemPreset {
  id         Int      @id @default(autoincrement())
  scope      String   // LINE_ITEM（損益細項）/ SUPPLIER（貨主）/ COST_CENTER（成本中心）
  category   String   @default("") // scope=LINE_ITEM 時為 lib/categories.ts 的 Category；其餘為 ""
  name       String   // 標準名稱（唯一）
  note       String   @default("") // 預設備註（選取時帶入空白備註欄，可再改）
  costCenter String   @default("") // 預設成本中心（僅 scope=LINE_ITEM 有意義）
  active     Boolean  @default(true) // 停用後不再出現在下拉，但既有資料不受影響
  usageCount Int      @default(0)   // 歷史使用次數，下拉排序用
  sortOrder  Int      @default(0)   // 人工置頂用，越小越前
  createdAt  DateTime @default(now())

  @@unique([scope, category, name])
  @@index([scope, category, active])
}
```

Migration：`npx prisma migrate dev --name add_item_preset`

### 9.3 新檔 `lib/preset.ts`

```ts
export const PRESET_SCOPES = {
  LINE_ITEM:   '損益細項名稱',
  SUPPLIER:    '貨主名稱',
  COST_CENTER: '成本中心',
} as const
export type PresetScope = keyof typeof PRESET_SCOPES

export interface PresetDTO {
  id: number; scope: PresetScope; category: string; name: string
  note: string; costCenter: string; active: boolean; usageCount: number; sortOrder: number
}

/** 名稱正規化：去頭尾空白、全形空白→半形、連續空白收斂為一個。 */
export function normalizeName(v: unknown): string {
  return String(v ?? '').replace(/　/g, ' ').trim().replace(/\s+/g, ' ')
}

export function isPresetScope(v: string): v is PresetScope { /* … */ }
```

`normalizeName()` 必須套用在：字典的新增／改名、`lib/pl.ts` 的 `sanitizeLineItems()` 之 `label`、`app/api/supplier/route.ts` 的 `name`。
（避免「油資 」與「油資」被當成兩個名稱。）

### 9.4 字典初始化腳本 `prisma/seed-presets.cjs`

`package.json` 加 `"db:presets": "node prisma/seed-presets.cjs"`。行為（**冪等，可重複執行**）：

1. 掃 `LineItem` 的相異 `(category, normalizeName(label))` → upsert 成 `scope='LINE_ITEM'` 的字典，`usageCount` = 出現次數。
2. 掃 `Supplier` 的相異 `normalizeName(name)` → `scope='SUPPLIER'`。
3. 掃 `LineItem` 的相異非空 `costCenter` → `scope='COST_CENTER'`；再補上內建預設 `中區`、`總部`、`市場`、`中和`（已存在則略過）。
4. upsert 用 `@@unique([scope, category, name])`，**只更新 `usageCount`，不覆寫使用者已設定的 `note` / `costCenter` / `sortOrder` / `active`**。
5. 輸出統計：各 scope 新增／更新筆數。

### 9.5 API `/api/preset`（新檔 `app/api/preset/route.ts`、`app/api/preset/[id]/route.ts`）

| Method | Path | 說明 |
|---|---|---|
| `GET` | `/api/preset?scope=LINE_ITEM&category=FIXED[&all=1]` | 回 `{ presets: PresetDTO[] }`，預設只回 `active=true`；排序 `sortOrder asc, usageCount desc, name asc`。`scope` 無效 → `400`。 |
| `POST` | `/api/preset` | body `{ scope, category?, name, note?, costCenter? }`。`normalizeName` 後 upsert（已存在則回既有並把 `active` 設回 `true`）。名稱空白 → `400 { error: '請輸入名稱' }`。回 `{ preset }`。 |
| `PATCH` | `/api/preset/[id]` | body `{ name?, note?, costCenter?, active?, sortOrder?, applyRename?: boolean }`。改名邏輯見 I5。 |
| `DELETE` | `/api/preset/[id]` | **軟刪除**（`active=false`），不得實體刪除，也不得動到既有 `LineItem` / `Supplier`。 |

### 9.6 新元件 `components/PresetSelect.tsx`

```tsx
interface Props {
  scope: PresetScope
  category?: string          // scope=LINE_ITEM 時必填
  value: string
  /** preset 為選中的字典項（自訂新增時亦會回傳新建的 preset） */
  onChange: (name: string, preset?: PresetDTO) => void
  className?: string
  placeholder?: string       // 預設「選擇名稱…」
}
```

行為規格：

1. 以 `<select>` 呈現（非 `<datalist>`）。理由：`datalist` 仍可自由打字、行動裝置支援不一致，達不到「不要手打」的目的；原生 `select` 在手機是系統選單，反而更好按。
2. 選項結構：
   ```
   （空白）選擇名稱…
   ── 常用 ──
   車輛_加油費
   車輛_停車費_市場
   …
   ── ＋ 輸入新名稱… ──   (value = "__CUSTOM__")
   ```
3. **相容鐵則**：若目前 `value` 不在字典中（舊資料，如 `油資`），必須在最上方額外插入一個 `油資（既有）` 選項並選中它。
   **嚴禁**把不在字典中的既有值清空或靜默改寫成別的名稱。
4. 選到 `__CUSTOM__` → 就地切換成文字輸入 + `確定` / `取消` 兩個小按鈕。按確定時：
   - `normalizeName`，空字串則不動作；
   - `POST /api/preset` 寫入字典（同名則沿用既有）；
   - 呼叫 `onChange(name, preset)`，並把新項目加入本地選項清單、切回 select 模式。
5. 字典以 `(scope, category)` 為 key 做**模組層級快取**（`Map<string, Promise<PresetDTO[]>>`），同一頁多列共用一次請求；新增後要讓該 key 失效並重新載入。
6. 載入中顯示 `disabled` 的 `載入中…`；載入失敗顯示紅字並允許重試（不可讓使用者卡住無法輸入）。

### 9.7 套用位置

| 檔案 | 欄位 | 改法 |
|---|---|---|
| `components/PLForm.tsx` | 項目名稱 | `<PresetSelect scope="LINE_ITEM" category={cat.key} …/>`。選中 preset 時，**若該列的 `costCenter` / `note` 目前為空**，才用 preset 的預設值自動填入（已有值不覆蓋）。 |
| `components/PLForm.tsx` | 成本中心 | `<PresetSelect scope="COST_CENTER" …/>` |
| `app/suppliers/page.tsx` | 貨主名稱 | `<PresetSelect scope="SUPPLIER" …/>` |
| — | 細項備註 | **維持自由文字**。備註是「本期發生原因」，本來就每期不同，不應字典化。 |

薪資模組的員工本來就是下拉選取（`AddPicker`），不需修改。

---

## 10. I5 — 名稱管理頁（新增／改名合併／停用）

### 10.1 頁面 `/settings/presets`（新檔 `app/settings/presets/page.tsx`）

- `components/Sidebar.tsx` 的 `nav` 陣列末端加入：
  `{ href: '/settings/presets', label: '名稱設定', icon: '🏷️' }`
- 版面：上方 scope 分頁（損益細項／貨主／成本中心）；選 `LINE_ITEM` 時再以 `lib/categories.ts` 的 `CATEGORIES` 做分類篩選。
- 每列可編輯：名稱、預設成本中心、預設備註、排序、啟用/停用；顯示 `usageCount`（唯讀）。
- 提供「＋ 新增名稱」。

### 10.2 改名＝合併（`PATCH` 的 `applyRename`）

這是解決既有資料不一致的關鍵功能。

- 當 `name` 有變更且 `applyRename === true`：於**單一 transaction** 內
  1. `scope='LINE_ITEM'`：`prisma.lineItem.updateMany({ where: { category, label: 舊名 }, data: { label: 新名 } })`
  2. `scope='SUPPLIER'`：`prisma.supplier.updateMany({ where: { name: 舊名 }, data: { name: 新名 } })`
  3. `scope='COST_CENTER'`：`prisma.lineItem.updateMany({ where: { costCenter: 舊名 }, data: { costCenter: 新名 } })`
  4. 更新該 preset 的 `name`
  5. **若新名已存在另一筆 preset**（＝合併情境）：把舊 preset 設為 `active=false`，並把 `usageCount` 加到新 preset 上，不得因 `@@unique` 衝突而丟出未處理的例外 → 需先偵測並走合併分支。
- 回應：`{ preset, updatedRows: number, merged: boolean }`
- UI 確認文字：`將「油資」改名為「車輛_加油費」，並同步更新既有 N 筆資料？此動作無法自動復原。`
- `applyRename` 未帶或為 `false` 時，只改字典、不動既有資料。
- 金額不受影響，但 `label` 變動會影響年報彙總 → 改名後請提示使用者到 `/report/2025` 確認。

### 10.3 附錄 A：建議合併清單（**需使用者逐條確認後才執行，CODEX 不得自動套用**）

以 9.1 掃描結果整理，供使用者在 `/settings/presets` 逐條操作的參考：

| 分類 | 建議保留（標準名） | 建議併入的舊寫法 |
|---|---|---|
| `FIXED` | `車輛_租金_小車-3875` | `小車-3875` |
| `FIXED` | `車輛_租金_裕隆-5381` | `裕隆-5381` |
| `FIXED` | `車輛_租金_租賃車-6687` | `租金_租賃車_6687`、`租金_租賃車` |
| `FIXED` | `租金_房租_中和` | `房租` |
| `FIXED` | `車輛_貸款_賓士_6836` | `賓士` |
| `OPERATING` | `車輛_加油費` | `油資` |
| `OPERATING` | `車輛_停車費_市場` | `停車費` |
| `OPERATING` | `行政_租金_影印機` | `租金_影印機` |
| `OPERATING` | `水電瓦斯費_市場` | `水電費用`、`租金& 水電費-市場` |
| `CENTRAL` | `公司信用卡_中區` | `中區支出` |
| `REVENUE` | `營業收入` | `營業收入(現金)` |

> ⚠️ `貸款_富育` / `富育一銀貸款` / `富育台企貸款` / `富育一銀循環息` / `富育台企青創` 這組**不可貿然合併**——可能是不同筆貸款（一銀／台企／青創）與利息，需使用者確認後再決定。
> 車貸類 `車貸6738` / `貸款_車輛_賓士_6738`、`車貸-9983` / `車輛_租金_租賃車-9983` 同理，請逐筆與使用者確認車號對應關係。

---

## 11. 邊界情況與行為契約（審核會逐條檢查）

| # | 情境 | 期望行為 |
|---|---|---|
| E1 | 同一期連按兩次「匯入貨主」 | 結果完全相同；`PROCUREMENT` 不會出現兩份貨主列（`replaced` 第二次 > 0）。 |
| E2 | 損益表已有手動輸入的採購列 | 手動列完整保留；回應 `manualCount > 0`，UI 提醒可能重複。 |
| E3 | 該期貨主／薪資無任何資料 | 不刪不寫、回 `imported: 0` 與說明訊息；既有匯入列保持原狀。 |
| E4 | 該期 `MonthlyPL` 尚未建立 | `ensureMonth()` 自動建立空容器後再匯入，不報 404。 |
| E5 | 匯入後在 `PLForm` 修改金額並儲存 | 修改值保留，且 `source` 不變（仍為 `SUPPLIER`/`PAYROLL`/`CARRY_FIXED`）。 |
| E6 | 匯入後再按一次匯入 | E5 的手動修改**會被覆蓋**（既定語意），confirm 文字須事先說明。 |
| E7 | 兼職當月無任何工時 | `parttimePayCents` = 0，仍寫入一列（金額 0），note 顯示 `工時 0.0 小時 × 時薪 $X`。 |
| E8 | 新增月份時上一期無固定支出 | 正常建立月份，`carriedFixed: 0`，不報錯。 |
| E9 | 對已存在的月份重按「建立月份」 | 維持既有 upsert 行為，**不觸發**自動帶入（不覆蓋既有資料）。 |
| E10 | 匯入後的分類快取 | `MonthlyPL.procurementTotal` / `payrollTotal` / `fixedTotal` 與 `LineItem` 加總一致（由 `recomputeTotals` 保證）；儀表板、年報數字同步變動。 |
| E11 | 交易中途失敗 | 整筆 rollback，不得出現「刪了舊列但沒寫新列」的狀態。 |
| E12 | 開啟舊月份，某列名稱不在字典中（如 `油資`） | 下拉顯示 `油資（既有）` 並選中；儲存後值不變。**絕不可**被清空或改成別的名稱。 |
| E13 | 字典中該分類尚無任何項目 | 下拉只有「＋ 輸入新名稱…」；新增後立即可選，且不需重新整理頁面。 |
| E14 | 兩位使用者同時新增同一個名稱 | `@@unique([scope, category, name])` 擋下；`POST /api/preset` 走 upsert，不得回 500。 |
| E15 | 停用某字典項 | 下拉不再出現該項；**既有 `LineItem` / `Supplier` 資料完全不動**，年報數字不變。 |
| E16 | 改名 + `applyRename`，且新名已存在 | 走合併分支：既有資料改為新名、舊 preset 停用、`usageCount` 累加，不得因唯一鍵衝突丟例外。 |
| E17 | 名稱前後有空白（`油資 `） | `normalizeName()` 收斂後才寫入，不得產生看起來一樣卻不相等的兩個名稱。 |

---

## 12. 驗收清單

**建置**

```bash
npx tsc --noEmit
```

```bash
npm run build
```

**資料庫**

```bash
npx prisma migrate dev --name add_lineitem_source
```

```bash
npx prisma migrate dev --name add_item_preset
```

```bash
npm run db:presets
```

**手動測試腳本（依序執行，全數通過才算完成）**

1. 於 `/suppliers` 選 2026/07，輸入 3 筆貨主（含 1 筆金額 0）→ 儲存 → 按「匯入至 2026/07 損益表」。
2. 開 `/monthly/2026/7`：「營業成本（採購）」出現 3 筆、各帶「貨主」標籤，小計 = 貨主頁合計；「營業毛利」隨之變動。
3. 回 `/suppliers` 改一筆金額 → 再次匯入 → 損益表仍是 3 筆（非 6 筆），金額已更新。
4. 於 `/monthly/2026/7` 手動新增一筆採購列並儲存 → 再匯入一次 → 手動列仍在，且 UI 出現「另有 N 筆手動輸入」提醒。
5. 於 `/payroll` 2026/07 建立 1 名正職 + 1 名兼職（含工時）→ 儲存 → 匯入 → 損益表「人事薪資」出現 2 筆，兼職金額 = `時薪 × 總工時`（自行以計算機驗算）；`payrollTotal` 與畫面小計一致。
6. 於 `/monthly/2026/7` 的「每月固定支出」新增 3 筆並儲存 → 於 `/monthly/new` 建立 2026/08（勾選自動帶入）→ 8 月固定支出出現同樣 3 筆**含金額**，標籤「上期」。
7. 於 8 月改一筆金額並儲存 → 重新整理頁面 → 金額保留、標籤仍為「上期」。
8. 於 `/monthly/new` 取消勾選建立 2026/09 → 9 月固定支出為空。
9. `/dashboard` 與 `/report/2025`（年報）不因本次變更而報錯。
10. 執行 `npm run db:presets` → `/settings/presets` 的「損益細項」看得到各分類的既有名稱與使用次數；再執行一次，筆數不變（冪等）。
11. 於 `/monthly/2026/7` 的「營業費用」新增一列：名稱欄是**下拉**，可直接選到 `車輛_加油費`；選取後若該列成本中心為空會自動帶入預設值。
12. 同一列改選「＋ 輸入新名稱…」→ 輸入 `車輛_洗車費` → 確定 → 該名稱立刻出現在下拉中；重新整理頁面後仍在。
13. 開啟 2025 年任一月份（含 `油資` 這類舊名稱）→ 下拉顯示 `油資（既有）` 且已選中 → 直接儲存 → 重新整理，名稱仍是 `油資`（未被清空或改寫）。
14. `/settings/presets` 把 `油資` 改名為 `車輛_加油費` 並勾選「同步更新既有資料」→ 顯示更新筆數 → `/report/2025` 中兩列已合併為一列，金額為兩者相加。
15. 於 `/settings/presets` 停用一個字典項 → 下拉不再出現，但既有月份該列資料與年報數字完全不變。
16. `/suppliers` 的貨主名稱同為下拉，且 I1 匯入後損益表的採購列名稱與貨主字典一致。

---

## 13. 不在本次範圍（請勿順手實作）

- 貨主／薪資的「即時連動」（如薪資一改，損益表自動同步）—— 本次維持**使用者主動按鈕匯入**，語意明確、可控。
- 匯入成彙總單筆（`mode: 'summary'`）。
- 匯入營業收入、營業外項目等其他分類。
- `SHAREHOLDER` / `FINANCING_PRINCIPAL` 的跨期帶入。
- 鎖定（唯讀）匯入列。
- 匯入紀錄稽核表（audit log）。
- **自動模糊比對／自動合併相似名稱**（如自動判定 `油資` ≈ `車輛_加油費`）—— 一律由使用者在 `/settings/presets` 明確操作，附錄 A 只是建議清單。
- 備註欄字典化、字典的匯入匯出。
- 強制既有資料一律改用字典名稱（舊資料維持原樣，靠 I5 逐步收斂）。

---

## 14. 交付檢查表（CODEX 自檢後回報）

- [ ] `prisma/schema.prisma` 新增 `LineItem.source` + 索引，migration 已產生
- [ ] `schema.prisma:41` `payrollTotal` 註解已修正
- [ ] 新檔 `lib/lineSource.ts`
- [ ] 新檔 `lib/importPL.ts`（`replaceSourcedLineItems` + `carryFixedFromPrevious`）
- [ ] `lib/monthly.ts` `recomputeTotals` 支援 transaction client
- [ ] `lib/pl.ts` `CleanLineItem` / `sanitizeLineItems` 處理 `source`
- [ ] `lib/types.ts` `LineItem` 介面加 `source`
- [ ] 新 API：`/api/pl/import/supplier`、`/api/pl/import/payroll`、`/api/pl/carry/fixed`
- [ ] `/api/pl` POST 支援 `carryFixed`（僅新建時生效）
- [ ] `app/suppliers/page.tsx`、`app/payroll/page.tsx` 匯入按鈕（先存後匯）
- [ ] `app/monthly/new/page.tsx` 自動帶入 checkbox
- [ ] `components/PLForm.tsx`：`source` 往返、三個區段按鈕、以回應重建 state、來源標籤

**I4 / I5（選取式輸入）**

- [ ] `prisma/schema.prisma` 新增 `ItemPreset` + migration
- [ ] 新檔 `lib/preset.ts`（`normalizeName` 已套用到 `sanitizeLineItems` 與 supplier PUT）
- [ ] 新檔 `prisma/seed-presets.cjs` + `package.json` 的 `db:presets`（冪等）
- [ ] 新 API：`/api/preset`（GET/POST）、`/api/preset/[id]`（PATCH/DELETE 軟刪除）
- [ ] 新元件 `components/PresetSelect.tsx`（含「（既有）」相容選項與自訂新增）
- [ ] `PLForm` 項目名稱／成本中心、`suppliers` 貨主名稱改為 `PresetSelect`
- [ ] 新頁 `app/settings/presets/page.tsx` + `Sidebar` 導覽項
- [ ] 改名合併（`applyRename`）含唯一鍵衝突的合併分支

**共同**

- [ ] `npx tsc --noEmit` 與 `npm run build` 皆通過
- [ ] 第 12 節手動測試 1–16 全數通過（請附實際結果，勿只回報「應該可以」）
- [ ] 第 11 節 E1–E17 逐條自檢，特別是 **E12（舊名稱不得被清空或改寫）**
