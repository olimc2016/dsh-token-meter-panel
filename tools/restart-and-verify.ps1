# 重启 DSH Desktop 并自检插件；若启动失败则自动回滚到最近一次 profile 备份。
#
# 为什么用脚本而不是 GUI 里的「重启」：本脚本在**独立进程**里跑，因此重启 DSH
# 不会连带杀掉执行者，可以在重启后继续验证，并在验证失败时自动回滚，
# 避免用户面对一个起不来的 GUI。
#
# 判定口径（重要）：
#   /token-meter/health 对我们的请求会返回 403 —— 这是 connection 服务的
#   Host/Origin 围栏，**不是插件故障**（非浏览器客户端一律被挡）。所以：
#     - 「host 已起来」= 能拿到任意 HTTP 响应（含 403/404）
#     - 「插件已加载」= composition 解析通过（重启前静态验证）
#   真正的插件健康由 DSH 日志与 GUI 侧栏入口确认。
param(
  [string]$PluginDir = "F:\DSH\tools\token-meter-plugin",
  [string]$ProfileDir = "C:\Users\oli20\.dsh\profiles\desktop",
  [int]$WaitSeconds = 90,
  [switch]$NoRollback
)
$ErrorActionPreference = 'Continue'
function Log($m) { Write-Output ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }

$shim = (Get-ChildItem "$env:APPDATA\DSH Desktop\host-commands\desktop\generations" -Recurse -Filter dsh.cmd -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $shim) { Log "找不到 dsh.cmd shim，退出"; exit 2 }

# 0) 重启前静态自检：composition 能否解析出本插件
Log "重启前自检：--dump-config"
$before = & $shim --profile desktop --dump-config 2>&1
if ($LASTEXITCODE -ne 0) { Log "composition 解析失败（退出码 $LASTEXITCODE），放弃重启：`n$before"; exit 3 }
if (-not ($before | Select-String -SimpleMatch 'dsh-token-meter-panel')) { Log "配置里没有本插件，放弃重启"; exit 3 }
Log "composition OK（含 dsh-token-meter-panel row）"

$backup = Get-ChildItem "F:\DSH\backup-dsh-profile-*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
Log "回滚备份：$($backup.FullName)"

# 1) 停掉桌面 host：按 PID 精确杀，先杀 host（最老的进程），子进程随之退出。
#    顺序很重要——若先杀父进程，可能把脚本自己的输出管道打断，导致脚本半途死掉。
$all = @(Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue | Sort-Object StartTime)
$hostPid = ($all | Select-Object -First 1).Id
Log "停止 $($all.Count) 个 DSH Desktop 进程（host PID = $hostPid）"
$all | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { Log "  无法终止 $($_.Id)：$($_.Exception.Message)" } }
Start-Sleep -Seconds 5
for ($i = 0; $i -lt 8; $i++) {
  $left = @(Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { break }
  $left | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }
  Start-Sleep -Seconds 2
}
$leftCount = @(Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue).Count
if ($leftCount -gt 0) { Log "警告：仍有 $leftCount 个进程残留" } else { Log "进程已全部退出" }

# 2) 启动
$exe = 'C:\Program Files\DSH Desktop\DSH Desktop.exe'
Log "启动 $exe"
Start-Process $exe

# 3) 等待 host 起来：按主进程 PID 找到它的监听端口，再探 HTTP
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$port = $null; $status = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $main = @(Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -Last 1)
  if ($main.Count -eq 0) { continue }
  $mainPid = $main[0].Id
  $hit = netstat -ano | Select-String -SimpleMatch 'LISTENING' | Select-String -SimpleMatch "$mainPid" | Select-String -SimpleMatch '127.0.0.1:'
  foreach ($h in $hit) {
    $m = [regex]::Match($h.Line, '127\.0\.0\.1:(\d+)\s')
    if (-not $m.Success) { continue }
    $candidate = $m.Groups[1].Value
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$candidate/" -UseBasicParsing -TimeoutSec 4
      $port = $candidate; $status = $r.StatusCode; break
    } catch {
      $resp = $_.Exception.Response
      if ($resp -ne $null) { $port = $candidate; $status = [int]$resp.StatusCode; break }
    }
  }
  if ($port) { break }
}

if ($port) {
  Log "PASS：DSH host 已起来 http://127.0.0.1:$port （HTTP $status，403 属正常鉴权围栏）"
  $logDir = "$env:APPDATA\DSH Desktop\logs"
  $logFile = Join-Path $logDir ("dsh-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
  if (Test-Path $logFile) {
    $hits = Select-String -Path $logFile -Pattern 'token-meter' -SimpleMatch -ErrorAction SilentlyContinue
    if ($hits) { Log "日志命中 token-meter（插件已挂载）："; $hits | Select-Object -Last 6 | ForEach-Object { Log ("  " + $_.Line) } }
    else { Log "日志里暂无 token-meter 记录（插件可能未挂载）" }
    $errs = Select-String -Path $logFile -Pattern 'failed to load|client-modules|Invalid effect|Cannot find package' -ErrorAction SilentlyContinue
    if ($errs) { Log "日志出现可疑错误："; $errs | Select-Object -Last 8 | ForEach-Object { Log ("  " + $_.Line) } }
  } else { Log "未找到今日日志文件：$logFile" }
  exit 0
}

Log "FAIL：等待 ${WaitSeconds}s 后 host 仍未监听 HTTP"
if ($NoRollback) { Log "按要求不自动回滚"; exit 1 }

# 4) 自动回滚
Log "开始回滚 profile"
Get-Process 'DSH Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
foreach ($f in @('package.json','cordis.patch.yml','pnpm-workspace.yaml','pnpm-lock.yaml','cordis.yml')) {
  $src = Join-Path $backup.FullName $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $ProfileDir $f) -Force; Log "恢复 $f" }
}
Log "回滚完成，重新启动 DSH"
Start-Process 'C:\Program Files\DSH Desktop\DSH Desktop.exe'
exit 1
