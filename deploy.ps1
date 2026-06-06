# 財務管理系統 - GitHub + Railway 部署腳本
# 使用方式: 在 PowerShell 中執行此腳本
# 前提: 需要安裝 git (https://git-scm.com)

$repoName = "finance-dashboard"
$githubUser = "Joseph419928"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== 財務管理系統部署流程 ===" -ForegroundColor Green
Write-Host "專案目錄: $projectDir" -ForegroundColor Cyan

Set-Location $projectDir

# Step 1: Git 初始化
Write-Host "`n[1/4] 初始化 Git..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
    Write-Host "Git 已初始化" -ForegroundColor Green
} else {
    Write-Host "Git 已存在，跳過初始化" -ForegroundColor Gray
}

# Step 2: 建立 .env (本地開發用)
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ".env 已建立 (DATABASE_URL=file:./dev.db)" -ForegroundColor Green
}

# Step 3: Git commit
Write-Host "`n[2/4] 提交程式碼..." -ForegroundColor Yellow
git add .
git status --short
git commit -m "feat: 財務管理系統 v1.0 - 損益控管儀表板" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "已有最新提交，無需重新提交" -ForegroundColor Gray
}

# Step 4: 提示建立 GitHub Repo
Write-Host "`n[3/4] GitHub 儲存庫設定" -ForegroundColor Yellow
Write-Host "請在瀏覽器中建立 GitHub 儲存庫:" -ForegroundColor Cyan
Write-Host "  1. 前往: https://github.com/new" -ForegroundColor White
Write-Host "  2. Repository name: finance-dashboard" -ForegroundColor White
Write-Host "  3. 選擇 Public 或 Private" -ForegroundColor White
Write-Host "  4. 不要勾選 Add README / .gitignore / license" -ForegroundColor White
Write-Host "  5. 點擊 Create repository" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "建立完成後，按 Enter 繼續推送..."

# Step 5: 推送到 GitHub
Write-Host "`n[4/4] 推送到 GitHub..." -ForegroundColor Yellow
$remoteUrl = "https://github.com/$githubUser/$repoName.git"

git remote remove origin 2>$null
git remote add origin $remoteUrl
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 成功推送至 GitHub!" -ForegroundColor Green
    Write-Host "儲存庫: https://github.com/$githubUser/$repoName" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "=== 下一步: Railway 部署 ===" -ForegroundColor Green
    Write-Host "1. 前往 https://railway.app" -ForegroundColor White
    Write-Host "2. 登入後點擊 New Project -> Deploy from GitHub repo" -ForegroundColor White
    Write-Host "3. 選擇 $githubUser/$repoName" -ForegroundColor White
    Write-Host "4. 新增 Volume: 掛載點設為 /data" -ForegroundColor White
    Write-Host "5. 在 Variables 加入: DATABASE_URL=file:/data/finance.db" -ForegroundColor White
    Write-Host "6. Railway 自動部署完成後即可使用!" -ForegroundColor White
} else {
    Write-Host "`n❌ 推送失敗，請確認:" -ForegroundColor Red
    Write-Host "  - GitHub 儲存庫已建立" -ForegroundColor White
    Write-Host "  - 已設定 Git 認證 (gh auth login 或 SSH key)" -ForegroundColor White
}
