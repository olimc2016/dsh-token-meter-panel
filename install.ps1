# dsh-token-meter-panel installer (Windows PowerShell)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Version v0.6.0
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Profile web
#
# What it does:
#   1. locates the DSH CLI (dsh.cmd) shipped with DSH Desktop, or falls back to npx
#   2. puts DSH's bundled pnpm on PATH for this session (DSH needs it to install plugins)
#   3. runs: dsh plugin --profile <profile> add github:.../dsh-token-meter-panel#<version>
#   4. prints the installed version and tells you to restart DSH Desktop
#
# It only touches your DSH profile's dependency list. No admin rights needed.

param(
  [string]$Version = 'latest',
  [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'
$Repo = 'olimc2016/dsh-token-meter-panel'
$Package = 'dsh-token-meter-panel'

Write-Host "== $Package installer ==" -ForegroundColor Cyan

# ---- 1) collect candidate bin dirs (dsh + pnpm shipped with DSH Desktop) ----
$roots = @(
  (Join-Path $env:APPDATA 'DSH Desktop\host-commands'),
  (Join-Path $env:APPDATA 'DSH Desktop\cli'),
  (Join-Path $env:APPDATA 'DSH Desktop\runtime-commands')
) | Where-Object { Test-Path $_ }

$extraBins = @()
foreach ($r in $roots) {
  Get-ChildItem $r -Recurse -Include dsh.cmd,pnpm.cmd -ErrorAction SilentlyContinue |
    ForEach-Object { $extraBins += $_.DirectoryName }
}
$extraBins = $extraBins | Select-Object -Unique
if ($extraBins.Count -gt 0) {
  $env:PATH = ($extraBins -join ';') + ';' + $env:PATH
  Write-Host "found DSH tool dirs:" -ForegroundColor DarkGray
  $extraBins | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
}

# ---- 2) locate the DSH CLI ----
$dsh = $null
$cmd = Get-Command dsh -ErrorAction SilentlyContinue
if ($cmd) { $dsh = @($cmd.Source) }
elseif ($extraBins.Count -gt 0) {
  $hit = Get-ChildItem ($extraBins -join ',') -Filter dsh.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { $dsh = @($hit.FullName) }
}

$spec = "github:$Repo"
if ($Version -and $Version -ne 'latest') { $spec = "$spec#$Version" }

if ($dsh) {
  Write-Host "using DSH CLI: $($dsh[0])" -ForegroundColor DarkGray
  # pnpm must be resolvable by the CLI; report early if not
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "note: pnpm not found on PATH. DSH ships one; if the install fails, add its dir to PATH." -ForegroundColor Yellow
  }
  & $dsh[0] plugin --profile $Profile add $spec
  $code = $LASTEXITCODE
} else {
  Write-Host "dsh not found on PATH; falling back to npx @deepseek-ai/dsh" -ForegroundColor Yellow
  npx --yes '@deepseek-ai/dsh' plugin --profile $Profile add $spec
  $code = $LASTEXITCODE
}

if ($code -ne 0) {
  Write-Host "install FAILED (exit $code)." -ForegroundColor Red
  Write-Host "If it mentions 'pnpm' is not recognized, run this first:" -ForegroundColor Yellow
  Write-Host '  npm i -g pnpm' -ForegroundColor Yellow
  exit $code
}

# ---- 3) report ----
$installed = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\node_modules\$Package\package.json"
if (Test-Path $installed) {
  $v = (Get-Content $installed -Raw | ConvertFrom-Json).version
  Write-Host "installed $Package v$v into profile '$Profile'" -ForegroundColor Green
} else {
  Write-Host "installed into profile '$Profile' (version file not found, that's odd)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "NEXT: fully quit DSH Desktop and start it again." -ForegroundColor Cyan
Write-Host "Then open the 'Token' panel in the left sidebar." -ForegroundColor Cyan
Write-Host "Future updates install themselves in the background (restart DSH to apply)." -ForegroundColor DarkGray
