# 为插件准备本地模块解析入口（Windows junction）。
#
# 为什么需要：Node 解析 junction/symlink 时默认用**真实路径**（preserveSymlinks=false），
# 所以插件里 `import '@deepseek-ai/schemastery'` 会从 F:\DSH\tools\token-meter-plugin\
# 往上找 node_modules，而 profile 的 node_modules 不在那条链上 → 解析失败。
# 这里在插件目录内建一层 junction 指向基座包的实际位置，让解析在本地就能命中。
#
# 用途：
#   - @deepseek-ai/schemastery ：宿主半侧定义设置 schema（缺失时插件会优雅降级为无 schema）
#   - esbuild                  ：构建浏览器半侧 bundle（tools/build-client.mjs）
#
# 这两个都是**可选**依赖：schemastery 缺失 → 设置项不注册；esbuild 缺失 → 无法重建 bundle。
param(
  [string]$PluginDir = "F:\DSH\tools\token-meter-plugin",
  [string]$AppModules = "C:\Program Files\DSH Desktop\resources\app\node_modules",
  [string]$EsbuildSource = ""
)
$ErrorActionPreference = 'Stop'

$dsDir = Join-Path $PluginDir 'node_modules\@deepseek-ai'
New-Item -ItemType Directory -Force -Path $dsDir | Out-Null

function Link-Pkg([string]$linkPath, [string]$target) {
  if (-not (Test-Path $target)) { Write-Warning "目标不存在，跳过: $target"; return }
  if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    if ($item.LinkType) { Remove-Item $linkPath -Force -Recurse }
    else { Write-Output "已存在真实目录，跳过: $linkPath"; return }
  }
  New-Item -ItemType Junction -Path $linkPath -Target $target | Out-Null
  Write-Output "linked $([System.IO.Path]::GetFileName($linkPath)) -> $target"
}

Link-Pkg (Join-Path $dsDir 'schemastery') (Join-Path $AppModules '@deepseek-ai\schemastery')

# esbuild：优先用显式给的源，否则在常见位置里找
if (-not $EsbuildSource) {
  $candidates = @(
    (Join-Path $env:APPDATA 'npm\node_modules\esbuild'),
    'C:\Program Files\nodejs\node_modules\esbuild'
  )
  $EsbuildSource = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if ($EsbuildSource) {
  Link-Pkg (Join-Path $PluginDir 'node_modules\esbuild') $EsbuildSource
} else {
  Write-Output "esbuild 未找到；要重建 client bundle 请先 `npm install --no-save esbuild` 后重跑本脚本"
}

Write-Output "`n当前解析入口："
Get-ChildItem (Join-Path $PluginDir 'node_modules') -Force -ErrorAction SilentlyContinue |
  Select-Object Mode, Name, @{n='Target';e={$_.Target}} | Format-Table -AutoSize
Get-ChildItem $dsDir -Force -ErrorAction SilentlyContinue |
  Select-Object Mode, Name, @{n='Target';e={$_.Target}} | Format-Table -AutoSize
