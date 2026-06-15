# 財務管理系統 — 損益表合規與決策可視化修改指示

> 給 Claude Code 的執行規格。本檔由財務專家（合規）＋資深會計師／營運顧問／市場投資專家三角色審查後產出，使用者已逐項同意 F1–F10。
> 目標：使月損益表符合台灣**商業會計法 + 商業會計處理準則 + 企業會計準則（EAS，中小企業適用）**所要求之格式與原則，並讓決策者一目瞭然公司營運狀態。
> 金額一律維持「分（整數 cents）」內部儲存，僅顯示／輸入時換算為元（沿用 `lib/money.ts`）。年度大額沿用 `BigInt`。

---

## 0. 執行原則（請務必遵守）

1. **不破壞既有資料**：所有 schema 變更以「新增欄位 / 新增分類」為主，舊欄位保留為相容或別名，提供 Prisma migration，不可直接刪欄造成資料遺失。
2. **單一資料來源**：科目與分類定義集中在 `lib/categories.ts`，計算邏輯集中在 `lib/types.ts`，請勿在頁面散落硬編。
3. **分（cents）整數制不變**：新增的所得稅、各層小計皆為 `Int`（月）或 `BigInt`（年），不得引入浮點儲存。
4. **權責 vs 現金雙軌**：導入權責基礎時，保留「現金面」欄位為輔助，不刪除，讓使用者可對照。
5. 每完成一個 Fxx，請執行 `npx tsc --noEmit` 與 `npm run build` 確認無型別／建置錯誤，再進行下一項。

---

## 目標損益表結構（修改後應呈現）

依商業會計處理準則第 31 條之損益表格式，逐層小計如下：

```
營業收入 (REVENUE)
− 營業成本 (COGS / 採購款)
= 營業毛利 (GROSS_PROFIT)            ← 必要小計
− 營業費用 (OPEX：薪資、租金、折舊、水電、運費、管理費等)
= 營業淨利(損) (OPERATING_INCOME)    ← 必要小計
+ 營業外收入 − 營業外費用 (NON_OP：利息、處分損益、兌換等)
= 稅前淨利(損) (PRETAX_INCOME)       ← 必要小計
− 所得稅費用 (INCOME_TAX)
= 本期淨利(損) (NET_INCOME)          ← 必要小計
────────────────────────────────────
（損益表結束。以下為盈餘分配，獨立呈現，不屬損益表）
− 股東提撥／業主提取 (盈餘分配)
= 可動用留抵現金
```

---

## F1（紅・合規必須）現金基礎 → 權責發生制

**法規**：商業會計法第 10 條，會計基礎採權責發生制；收入於賺得時、費用於發生時認列，與現金收付脫鉤。

**現況**：`lib/categories.ts` 之 `REVENUE` label 為「營業收入(現金)」、hint「實際現金回收」；`MonthlyPL.revenueActual` 即現金回收數。

**修改**：
- `prisma/schema.prisma` `MonthlyPL` 新增權責欄位（保留現金欄位為輔助）：
  - `revenueAccrual Int @default(0)`（權責認列營業收入，作為損益表本體營收）
  - `arBalance Int @default(0)`（期末應收帳款，輔助）
  - `apBalance Int @default(0)`（期末應付帳款，輔助）
- `lib/categories.ts`：`REVENUE` label 改「營業收入」、hint「權責認列之營業收入」；現金回收改由輔助欄位或新增 `REVENUE_CASH` 輔助分類承接，不混入損益主體。
- `lib/types.ts`：損益計算之營收來源由 `revenueActual` 改為 `revenueAccrual`（若為 0 則回退 `revenueActual` 以相容舊資料）。
- UI（`components/PLForm.tsx`）：營收區同時顯示「權責營收／現金回收」兩欄，並標註現金回收僅供現金流量參考。

**驗收**：損益表營收以權責數呈現；現金回收仍可輸入查閱；舊月份未填權責時不報錯（回退現金數並標示）。

---

## F2（紅・合規必須）採購款獨立為「營業成本」，呈現營業毛利

**法規**：商業會計處理準則第 31 條，營業收入 − 營業成本 = 營業毛利，為第一層必要小計。

**現況**：`lib/categories.ts` 中 `PROCUREMENT`(採購款) `kind:'expense'`，與薪資、固定支出並列；`lib/types.ts` `calcTotalExpenses` 一次全加，無毛利概念。

**修改**：
- `lib/categories.ts`：新增 `kind` 值 `'cogs'`，將 `PROCUREMENT` 改為 `kind:'cogs'`，label「營業成本（採購）」。新增分組概念 `statementGroup: 'COGS' | 'OPEX' | 'NON_OP' | 'REVENUE' | 'APPROPRIATION'` 於 `CategoryDef`，逐一標註：
  - `REVENUE` → REVENUE
  - `PROCUREMENT` → COGS
  - `PAYROLL / FIXED / OPERATING / CENTRAL` → OPEX
  - `NON_OPERATING` → NON_OP（見 F5 再細分）
  - `SHAREHOLDER` → APPROPRIATION（見 F4 移出損益）
- `lib/types.ts` 新增：
  - `calcCOGS(pl)` = COGS 群組加總
  - `calcGrossProfit(pl)` = 營收 − COGS
  - `calcOpex(pl)` = OPEX 群組加總
  - 既有 `calcTotalExpenses` 保留但改為「不含 COGS 之營業費用」或明確標註其語意，避免雙重加總。

**驗收**：月表與儀表板出現「營業毛利」與「毛利率」；採購款不再與營業費用混加。

---

## F3（紅・合規必須）補齊分層小計與所得稅費用

**法規**：損益表須逐層呈現營業毛利 → 營業淨利 → 稅前淨利 →（減）所得稅費用 → 本期淨利。

**現況**：`lib/types.ts` 僅 `calcNetProfit = revenueActual − calcTotalExpenses`，缺各層小計與稅。註：`AnnualPLLine`（2025 年度表）已有這些小計與 `section` 欄位，月表應與之一致。

**修改**：
- `prisma/schema.prisma` `MonthlyPL` 新增 `incomeTaxCents Int @default(0)`（所得稅費用，可由使用者輸入或依稅率估列）。
- `lib/types.ts` 新增完整層級函式：
  - `calcOperatingIncome(pl)` = 營業毛利 − 營業費用(OPEX)
  - `calcNonOperatingNet(pl)` = 營業外收入 − 營業外費用
  - `calcPretaxIncome(pl)` = 營業淨利 + 營業外淨額
  - `calcNetIncome(pl)` = 稅前淨利 − incomeTaxCents
  - 既有 `calcNetProfit` 改為轉呼叫 `calcNetIncome`（保持呼叫端相容）。
- UI：月表（`app/monthly/[year]/[month]/page.tsx` + `components/PLForm.tsx`）依「目標損益表結構」依序顯示五層小計；小計列以粗體、底色標示，且不可被重複加總（比照 `app/report/2025/page.tsx` 的 `isSubtotal` 樣式）。

**驗收**：月表呈現營業毛利 / 營業淨利 / 稅前淨利 / 所得稅費用 / 本期淨利 五層；月表結構與年度表 `section` 一致。

---

## F4（紅・合規必須）股東提撥移出損益表

**法規**：股東提撥屬盈餘分配 / 業主提取，為股東權益交易，不得列入損益表。

**現況**：`lib/categories.ts` `SHAREHOLDER` `kind:'appropriation'`；`lib/types.ts` `calcDisposable = calcNetProfit − shareholderTotal`。

**修改**：
- 自損益表本體與損益分類顯示中移除 `SHAREHOLDER`；保留資料欄位 `shareholderTotal` 但歸入獨立「盈餘分配 / 可動用現金」區塊。
- `lib/types.ts`：`calcNetIncome` 不得扣股東提撥；`calcDisposable(pl)` = `calcNetIncome(pl) − shareholderTotal`，並改名語意為「本期淨利後之可動用現金」，置於損益表下方獨立呈現。
- UI：股東提撥不出現在損益表科目列，改放損益表下方「盈餘分配」小區。

**驗收**：損益表本期淨利完全不受股東提撥影響；股東提撥僅出現在獨立盈餘分配區。

---

## F5（黃・強烈建議）營業外費用科目重分類

**法規**：營業外應為利息收支、處分資產損益、兌換損益等與本業無關項目；修繕、尾牙、警友會屬管理費用（營業費用）。

**現況**：`lib/categories.ts` `NON_OPERATING` hint 含「修繕、尾牙、警友會等」。

**修改**：
- 將修繕、尾牙、警友會等預設改歸 OPEX（建議新增 `OPEX_ADMIN` 管理費用分類承接，或併入 `OPERATING`）。
- `NON_OPERATING` 僅保留真正業外項目（利息費用、處分損益、兌換損益）；另建議新增 `NON_OPERATING_INCOME`（營業外收入，如利息收入）以支援 F3 的營業外淨額計算。
- 提供既有 `LineItem` 之 `category` 重分類腳本（migration 或一次性 script），把現存標示為修繕/尾牙/警友會的細項自 `NON_OPERATING` 改為對應 OPEX 分類。

**驗收**：營業淨利不再被業外性質誤計；營業外僅含利息與業外損益。

---

## F6（黃・強烈建議）貸款本金 / 車貸：拆分利息與折舊

**法規**：借款本金償還屬融資活動（負債減少），非費用；僅利息為費用（營業外）；車輛／設備應資本化並提折舊。

**現況**：`lib/categories.ts` `FIXED` hint「貸款、租金、車貸等」整筆當費用。

**修改**：
- 將 `FIXED` 內之貸款／車貸細項拆分為三：
  - 利息部分 → `NON_OPERATING`（營業外費用 — 利息費用）
  - 本金部分 → **不入損益**；新增 `lib/categories.ts` 之非損益分類 `FINANCING_PRINCIPAL`（僅供現金流量／負債追蹤），或記於備註欄並排除於損益計算。
  - 車輛／設備 → 資本化，新增「折舊費用」科目（OPEX），按月提列。
- `prisma`：如需追蹤資產與折舊，新增最小 `FixedAsset`（資產原值、年限、殘值、累計折舊）為選配；若範圍過大，至少先以「折舊費用」OPEX 細項手動輸入。
- 租金維持 OPEX（租金費用）。

**驗收**：本金償還不再壓低損益；利息進營業外；車輛改折舊。若 `FixedAsset` 暫不做，至少折舊費用可手動列入 OPEX 並於 spec 註明待辦。

---

## F7（黃・強烈建議）會計科目改用標準名稱

**現況**：科目用口語名（採購款、每月固定支出、中區支出、人事薪資）。

**修改**：
- 在 `lib/categories.ts` 為每個 `CategoryDef` 新增 `standardName`（標準會計科目）與保留 `label`（口語別名）：
  - 採購款 → 營業成本
  - 人事薪資 → 薪資費用
  - 每月固定支出 → 拆為 租金費用 / 折舊費用 / 利息費用（見 F6）
  - 營業費用 → 維持，細分 運費、水電費、油料費、過路費等
  - 中區支出 → 依性質拆（見 F8）
- 報表輸出（年度表、損益表列印）使用 `standardName`；輸入介面可仍顯示口語別名以利使用者。

**驗收**：對外／正式報表科目名稱符合商業會計法科目體系；介面操作不受影響。

---

## F8（黃・強烈建議）中區支出 = 成本中心，非科目

**法規**：損益表按「性質」分類；地區／據點為第二維度（成本中心），不應為頂層科目。

**現況**：`lib/categories.ts` `CENTRAL`(中區支出) 為地區分群。

**修改**：
- 新增 `LineItem` 維度欄位 `costCenter String @default("")`（如「中區」「總部」），不再以地區當 `category`。
- 將原 `CENTRAL` 細項依性質改入 `PAYROLL` / 租金（OPEX）/ `OPERATING` 等，並標 `costCenter='中區'`。
- 保留 `centralTotal` 為相容欄位（可標 deprecated），改以 `costCenter` 群組做地區分析（供 F10 成本中心報表）。

**驗收**：損益表科目皆為性質分類；地區分析改由 `costCenter` 維度產生，不影響損益層級。

---

## F9（黃・強烈建議）銀行餘額移出損益紀錄

**法規**：銀行餘額屬資產負債表項目，與損益表混置造成邊界不清。

**現況**：`MonthlyPL.bankBalance` 存於損益紀錄。

**修改**：
- 短期：`bankBalance` 於損益表畫面移除，改置於獨立「現金狀況 / 資產」小區或現金流量視圖；欄位可保留但語意上脫離損益。
- 中期（選配）：新增 `CashPosition`（year, month, bankBalanceCents, 其他資產負債摘要）模型，`bankBalance` 資料遷移過去。
- `lib/types.ts`：確保任何損益計算皆不引用 `bankBalance`。

**驗收**：損益表與計算完全不含 `bankBalance`；餘額改於現金 / 資產區呈現。

---

## F10（藍・決策可視化）增補決策 KPI 與現金流量視圖

**視角**：營運顧問 ＋ 市場投資專家，使決策者一眼看出獲利結構與現金品質。

**現況**：`app/dashboard/page.tsx` + `components/DashboardClient.tsx` 有累計營收／總支出／淨利率／月趨勢／費用圓餅。`expenseBreakdown` 仍含股東提撥（需配合 F4 移除）。

**修改**（於 dashboard 與相關計算）：
1. **三率趨勢**：毛利率（毛利/營收）、營業利益率（營業淨利/營收）、淨利率（本期淨利/營收），月趨勢折線。
2. **損益兩平點**：需先區分固定成本 vs 變動成本——在 `lib/categories.ts` 為各分類加 `costBehavior: 'fixed' | 'variable'`（採購／運費等 variable；租金／薪資／折舊等 fixed），計算 BEP = 固定成本 /（1 − 變動成本率）。
3. **現金流量三分類**：營業活動 / 投資活動（設備）/ 融資活動（借款本金、股東提撥），呼應 F6、F4。
4. **成長率**：YoY 與 MoM 營收與淨利成長率。
5. **股東報酬**：累計股東提撥、占淨利比，呼應 F4 盈餘分配區。
6. 修正 `app/dashboard/page.tsx` 之 `expenseBreakdown`：移除「股東提撥」；採購款改標「營業成本」並與營業費用分開呈現。

**驗收**：儀表板呈現三率、BEP、現金流量三分類、YoY/MoM、股東報酬；費用拆解不含股東提撥且毛利可見。

---

## F11（藍・決策可視化）每月結算圖表化＋期間比較

**視角**：營運顧問 ＋ 市場投資專家。每月結算後，使用者應能以圖表一眼看懂該月財務狀況，並能與「去年同期」或「自選某一期」對比，看出變化方向與幅度。

**現況**：`app/monthly/[year]/[month]/page.tsx` 僅顯示該月損益編輯表與一個淨損益數字，沒有圖表、也無跨期比較。`components/DashboardClient.tsx` 的圖表為「全部月份累計」視角，非單月結算視角。

**修改**：

1. **每月結算圖表區**（新增於月表頁面，或新建 `app/monthly/[year]/[month]/summary` 與 `components/MonthlySummaryCharts.tsx`，沿用 `react-chartjs-2`）：
   - **損益瀑布圖（waterfall）**：營業收入 → −營業成本 → 營業毛利 → −營業費用 → 營業淨利 → ±營業外 → 稅前淨利 → −所得稅 → 本期淨利，逐層遞減呈現獲利結構。
   - **費用結構圓餅/長條**：依 F2、F5、F8 之性質分類（營業成本、薪資、租金、折舊、運費、營業外…）。
   - **三率卡＋迷你趨勢**：毛利率／營業利益率／淨利率（呼應 F10）。
   - **預算 vs 實際**：該月 `revenueBudget` 對 `revenueAccrual`（呼應 F1），差異以正負色標示。

2. **期間比較選擇器**（本功能核心）：在結算圖表區上方提供比較模式下拉，三種模式：
   - `去年同期`：自動對應 `year−1` 同 `month`（例：2026/03 對 2025/03）。
   - `自選某期`：使用者以年／月下拉選任一已存在之 `MonthlyPL` 期間。
   - `不比較`：僅顯示本期。
   - 圖表改為「本期 vs 比較期」雙數列（長條並列），並在每個損益層級顯示**差異額**與**差異率（%）**；成長為綠、衰退為紅（沿用既有語意色）。
   - 缺少比較期資料時，顯示「該期間無資料」並優雅退回單期視圖，不可報錯。

3. **資料來源與計算**：
   - 後端（該頁 server component 或新 `app/api/monthly/compare/route.ts`）一次查詢本期與比較期兩筆 `MonthlyPL`（含 `lineItems`），各自以 `lib/types.ts` 的 F3 層級函式（`calcGrossProfit` / `calcOperatingIncome` / `calcPretaxIncome` / `calcNetIncome` 等）算出五層小計後回傳。
   - 比較計算集中在 `lib/types.ts` 新增 `comparePeriods(current, baseline)`，回傳各層級之 `{ current, baseline, diff, pct }`；`pct` 以 baseline 為分母，baseline 為 0 時回傳 `null` 並於 UI 顯示「—」（不可除以零）。
   - 顯示之百分比一律 `toFixed(1)`，金額沿用 `fmtCurrency`（分→元，不縮寫）。

4. **可用性**：比較模式選擇以 `localStorage`／URL query（如 `?cmp=yoy` 或 `?cmp=2025-03`）記憶，使用者切換月份時沿用上次偏好。

**驗收**：
- 進入任一月份可看到該月結算圖表（瀑布、費用結構、三率、預算對比）。
- 可切換「去年同期 / 自選某期 / 不比較」，圖表即時更新為雙期並列並顯示差異額與差異率。
- 比較期無資料時優雅退回，不報錯；baseline 為 0 時百分比顯示「—」。
- 所有金額為分制整數計算、顯示換算為元；百分比 `toFixed(1)`。

---

## 受影響檔案清單（總覽）

| 檔案 | 主要變更 |
|---|---|
| `prisma/schema.prisma` | MonthlyPL 新增 revenueAccrual / arBalance / apBalance / incomeTaxCents；LineItem 新增 costCenter；（選配）FixedAsset、CashPosition；新增 migration |
| `lib/categories.ts` | 新增 kind `'cogs'`、`statementGroup`、`standardName`、`costBehavior`；重分類 NON_OPERATING、FIXED、CENTRAL；股東提撥標 APPROPRIATION |
| `lib/types.ts` | 新增 calcCOGS / calcGrossProfit / calcOpex / calcOperatingIncome / calcNonOperatingNet / calcPretaxIncome / calcNetIncome；calcNetProfit 轉呼叫；calcDisposable 重新定位 |
| `lib/pl.ts` | `DIRECT_NUMERIC_FIELDS` 加入 revenueAccrual、incomeTaxCents、arBalance、apBalance 等；sanitize 對應 |
| `lib/monthly.ts` | `recomputeTotals` 對應新分類群組 |
| `app/api/pl/route.ts`、`app/api/pl/[id]/route.ts` | 接受新欄位、重算邏輯 |
| `app/monthly/[year]/[month]/page.tsx`、`components/PLForm.tsx` | 五層小計損益表呈現、權責/現金雙欄、股東提撥移至盈餘分配區 |
| `app/report/2025/page.tsx` | 確認月表結構與年度表 section 一致（年度表已合規，作為對照基準） |
| `app/dashboard/page.tsx`、`components/DashboardClient.tsx` | 三率、BEP、現金流量三分類、YoY/MoM、股東報酬；expenseBreakdown 移除股東提撥、分出營業成本 |
| `app/monthly/[year]/[month]/page.tsx`、（新）`components/MonthlySummaryCharts.tsx`、（新）`app/api/monthly/compare/route.ts` | F11 每月結算圖表（瀑布／費用結構／三率／預算對比）＋去年同期/自選期間比較 |
| `lib/types.ts` | （F11）新增 `comparePeriods(current, baseline)`，回傳各損益層級之 current/baseline/diff/pct |
| `_build_seed.py` / `prisma/seed*` | 重新匯入時依新分類群組對應（選配，僅在重建種子資料時） |

## 建議執行順序

1. F2 + F3（分類群組 + 計算層級，骨幹）→ 2. F4（移出股東提撥）→ 3. F5 + F6 + F8（重分類）→ 4. F7（標準科目名）→ 5. F1（權責雙軌）→ 6. F9（銀行餘額移出）→ 7. F10（儀表板 KPI）→ 8. F11（每月結算圖表＋期間比較，依賴 F3 的層級函式與 F10 的三率）。

每步完成後執行 `npx tsc --noEmit` 與 `npm run build`，並以一個既有月份資料肉眼核對五層小計加總正確、無重複計算。

---

## 注意事項（非法律意見）

本規格為依台灣會計法規所做之系統合規與可視化建議，非正式法律或稅務意見。所得稅估列方式、折舊年限、權責認列時點等，建議導入前與貴公司簽證會計師確認後再定案。若貴公司屬公開發行／須採 IFRS（證券發行人財務報告編製準則），請告知，部分科目分層與其他綜合損益（OCI）需再調整。
