$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$fontDir = Join-Path $root "backend\assets\fonts"
New-Item -ItemType Directory -Force -Path $fontDir | Out-Null

$fonts = @(
  @{ File = "MaShanZheng-Regular.ttf"; Url = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mashanzheng/MaShanZheng-Regular.ttf" },
  @{ File = "ZhiMangXing-Regular.ttf"; Url = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zhimangxing/ZhiMangXing-Regular.ttf" },
  @{ File = "LongCang-Regular.ttf"; Url = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/longcang/LongCang-Regular.ttf" },
  @{ File = "LiuJianMaoCao-Regular.ttf"; Url = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/liujianmaocao/LiuJianMaoCao-Regular.ttf" },
  @{ File = "Xiaolai-Regular.ttf"; Url = "https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf" },
  @{ File = "Yozai-Regular.ttf"; Url = "https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf" },
  @{ File = "ChenYuluoyan-2.0-Thin.ttf"; Url = "https://github.com/Chenyu-otf/chenyuluoyan_thin/releases/download/v2.0/ChenYuluoyan-2.0-Thin.ttf" },
  @{ File = "LXGWWenKai-Regular.ttf"; Url = "https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf" }
)

foreach ($f in $fonts) {
  $out = Join-Path $fontDir $f.File
  if ((Test-Path $out) -and ((Get-Item $out).Length -gt 500000)) {
    Write-Host "skip $($f.File)" -ForegroundColor DarkGray
    continue
  }
  Write-Host "download $($f.File)" -ForegroundColor Cyan
  curl.exe -L --fail --silent --show-error --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 300 -o $out $f.Url
  if ($LASTEXITCODE -ne 0) { throw "download failed: $($f.Url)" }
}

Get-ChildItem $fontDir -Filter *.ttf | Select-Object Name, @{n="MB";e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
