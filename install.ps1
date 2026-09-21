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

# ---- 1) locate the DSH CLI ----
# If `dsh` already resolves, don't touch PATH at all (messing with PATH can break
# the CLI's own pnpm lookup). Only when it's missing do we discover and prepend dirs.
$dsh = $null
$cmd = Get-Command dsh -ErrorAction SilentlyContinue
if ($cmd) {
  $dsh = $cmd.Source
  Write-Host "using DSH CLI from PATH: $dsh" -ForegroundColor DarkGray
}

if (-not $dsh) {
  Write-Host "dsh not on PATH; looking inside DSH Desktop..." -ForegroundColor Yellow
  $roots = @(
    (Join-Path $env:APPDATA 'DSH Desktop\runtime-commands'),
    (Join-Path $env:APPDATA 'DSH Desktop\host-commands'),
    (Join-Path $env:APPDATA 'DSH Desktop\cli')
  ) | Where-Object { Test-Path $_ }

  $found = @()
  foreach ($r in $roots) {
    Get-ChildItem $r -Recurse -Include dsh.cmd -ErrorAction SilentlyContinue |
      ForEach-Object { $found += $_.FullName }
  }
  # prefer concrete generation dirs, newest first
  $found = $found | Sort-Object @{ Expression = { if ($_ -match 'generations') { 0 } else { 1 } } }, `
                                 @{ Expression = { (Get-Item $_).LastWriteTime } ; Descending = $true } |
           Select-Object -Unique

  foreach ($c in $found) {
    try {
      $null = & $c --version 2>$null
      if ($LASTEXITCODE -eq 0) {
        $dsh = $c
        $bin = Split-Path $c -Parent
        $env:PATH = "$bin;$env:PATH"
        Write-Host "using DSH CLI: $dsh" -ForegroundColor DarkGray
        break
      }
    } catch { $null = $_ }
  }
  if (-not $dsh -and $found.Count -gt 0) { $dsh = $found[0]; $env:PATH = "$(Split-Path $dsh -Parent);$env:PATH" }
}

$spec = "github:$Repo"
if ($Version -and $Version -ne 'latest') { $spec = "$spec#$Version" }

if ($dsh) {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "note: pnpm not found. If install fails, run: npm i -g pnpm" -ForegroundColor Yellow
  }
  & $dsh plugin --profile $Profile add $spec
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
