$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $PSScriptRoot 'simulator.pid'
$scriptPath = Join-Path $PSScriptRoot 'simulator.mjs'
if (!(Test-Path -LiteralPath $pidPath)) { Write-Output '本次演示模拟器未运行。'; exit 0 }
$taskProcessId = [int](Get-Content -LiteralPath $pidPath -Raw)
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId" -ErrorAction SilentlyContinue
if ($taskProcess) {
    if (!$taskProcess.CommandLine.Contains($scriptPath)) { throw 'PID 已被其他程序占用，未执行停止。' }
    Stop-Process -Id $taskProcessId
}
Remove-Item -LiteralPath $pidPath
$taskStatusPath = Join-Path $PSScriptRoot 'simulator-status.json'
if (Test-Path -LiteralPath $taskStatusPath) {
    $taskStatus = Get-Content -LiteralPath $taskStatusPath -Raw | ConvertFrom-Json
    $taskStatus.running = $false
    $taskStatus | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskStatusPath -Encoding utf8
}
Write-Output '已停止本次数字绿色农业模拟器，ThingsBoard 和已有数据均保留。'
