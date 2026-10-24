$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "手迹 InkMark · 安装" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor DarkGray

$python = $env:PYTHON
if (-not $python) {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if ($command) { $python = $command.Source }
}
if (-not $python) {
  throw "没有找到 python。请安装 Python 3.11+，或先设置 `$env:PYTHON='C:\path\to\python.exe'。"
}

$venv = Join-Path $root "backend\.venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
  Write-Host "[1/4] 创建 Python 虚拟环境" -ForegroundColor Cyan
  & $python -m venv $venv
} else {
  Write-Host "[1/4] Python 虚拟环境已存在" -ForegroundColor DarkGray
}
$venvPython = Join-Path $venv "Scripts\python.exe"

Write-Host "[2/4] 安装后端依赖" -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r (Join-Path $root "backend\requirements.txt") --quiet

Write-Host "[3/4] 准备字体" -ForegroundColor Cyan
$fontDir = Join-Path $root "backend\assets\fonts"
$fontCount = @(Get-ChildItem $fontDir -Filter *.ttf -ErrorAction SilentlyContinue).Count
if ($fontCount -lt 8) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\download_fonts.ps1")
} else {
  Write-Host "字体已齐全，跳过下载" -ForegroundColor DarkGray
}

Write-Host "[4/4] 安装并构建前端" -ForegroundColor Cyan
Set-Location (Join-Path $root "frontend")
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  & pnpm install --ignore-scripts
  & pnpm build
} else {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) { throw "没有找到 pnpm 或 npm。请安装 Node.js 20+。" }
  & npm install --ignore-scripts
  & npm run build
}

Write-Host ""
Write-Host "安装完成。" -ForegroundColor Green
Write-Host "运行：powershell -ExecutionPolicy Bypass -File scripts\run.ps1" -ForegroundColor Gray
Write-Host "打开：http://127.0.0.1:8420" -ForegroundColor Gray
