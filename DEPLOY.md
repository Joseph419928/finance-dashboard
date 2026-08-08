# 部署指南 — GitHub + Railway

## 方法一：執行 PowerShell 腳本（推薦）

在 PowerShell 中執行：
```powershell
.\deploy.ps1
```

---

## 方法二：手動步驟

### 步驟 1 — 建立 GitHub 儲存庫

1. 前往 https://github.com/new
2. Repository name：`finance-dashboard`
3. 選擇 Public（或 Private）
4. **不要**勾選 Add README / .gitignore / license
5. 點擊 **Create repository**

### 步驟 2 — 推送程式碼

在本專案資料夾開啟 PowerShell 或終端機：

```bash
git init
git branch -M main
git add .
git commit -m "feat: 財務管理系統 v1.0"
git remote add origin https://github.com/Joseph419928/finance-dashboard.git
git push -u origin main
```

> **注意**：若尚未設定 Git 認證，請先安裝 [GitHub CLI](https://cli.github.com/) 並執行 `gh auth login`

---

### 步驟 3 — Railway 部署

1. 前往 https://railway.app 並登入
2. 點擊 **New Project → Deploy from GitHub repo**
3. 選擇 `Joseph419928/finance-dashboard`
4. Railway 自動偵測 Dockerfile 並開始建置

### 步驟 4 — 設定 Volume（資料庫持久化）

在 Railway 的 service 頁面：
1. 點擊 **+ New → Volume**
2. Mount Path 設為：`/data`
3. Railway 自動重啟服務

### 步驟 5 — 設定環境變數

在 Railway → service → **Variables** 分頁：

| 變數名稱 | 值 | 必填 |
|---------|-----|------|
| `DATABASE_URL` | `file:/data/finance.db` | ✅ |
| `APP_PASSWORD` | 自訂一組強密碼（登入用） | ✅ |
| `NODE_ENV` | `production` | ✅ |

> ⚠️ **務必設定 `APP_PASSWORD`**。若留空，系統不會啟用登入保護，任何知道網址的人都能讀寫財務資料。

### 步驟 6 — 初始化資料庫與種子資料（可選）

部署完成後，在 Railway 服務的 **Shell** 分頁執行：

```bash
npx prisma db push
npx tsx prisma/seed.ts
```

這會建立資料表並匯入 3 筆範例月份資料（2025/03、2025/04、2026/02）。

> 本專案不使用 migration 歷史，schema 變更一律由部署時的 `prisma db push` 套用。

---

## 本地開發

```bash
# 安裝相依套件
npm install

# 初始化／同步資料庫 schema
npx prisma db push

# 匯入種子資料
npm run db:seed

# 啟動開發伺服器
npm run dev
```

瀏覽器開啟 http://localhost:3000

---

## 系統功能

| 路徑 | 功能 |
|------|------|
| `/dashboard` | 損益控管儀表板（KPI、圖表、明細表） |
| `/monthly` | 每月損益列表 |
| `/monthly/new` | 新增月份 |
| `/monthly/[年]/[月]` | 編輯月份損益 |
| `/api/pl` | REST API（GET/POST） |
| `/api/pl/[id]` | REST API（GET/PUT/DELETE） |
