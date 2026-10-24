$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$dist = Join-Path $root "frontend\dist\index.html"

if (-not (Test-Path $python)) {
  throw "还没有安装后端依赖。请先运行 scripts\setup.ps1。"
}
if (-not (Test-Path $dist)) {
  throw "前端还没有构建。请先运行 scripts\setup.ps1。"
}

Set-Location (Join-Path $root "backend")
Write-Host ""
Write-Host "手迹 InkMark · http://127.0.0.1:8420" -ForegroundColor Yellow
Write-Host "按 Ctrl+C 停止" -ForegroundColor DarkGray
Write-Host ""

& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8420 --log-level info
