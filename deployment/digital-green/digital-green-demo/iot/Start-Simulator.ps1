param([switch]$SeedHistory)
$ErrorActionPreference = 'Stop'
$taskDir = $PSScriptRoot
$pidPath = Join-Path $taskDir 'simulator.pid'
$scriptPath = Join-Path $taskDir 'simulator.mjs'
if (Test-Path -LiteralPath $pidPath) {
    $taskProcessId = [int](Get-Content -LiteralPath $pidPath -Raw)
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId" -ErrorAction SilentlyContinue
    if ($taskProcess -and $taskProcess.CommandLine.Contains($scriptPath)) {
        Write-Output '数字绿色农业模拟器已运行。'
        exit 0
    }
}
if (!(Test-Path -LiteralPath (Join-Path $taskDir 'private.json'))) {
    & node (Join-Path $taskDir 'init.mjs')
    if ($LASTEXITCODE -ne 0) { throw '物联网演示初始化失败。' }
}
$nodePath = (Get-Command node).Source
$taskArguments = @('"' + $scriptPath + '"')
if ($SeedHistory) { $taskArguments += '--seed' }
$taskProcess = Start-Process -FilePath $nodePath -ArgumentList $taskArguments -WindowStyle Hidden -WorkingDirectory $taskDir -RedirectStandardOutput (Join-Path $taskDir 'simulator.log') -RedirectStandardError (Join-Path $taskDir 'simulator.error.log') -PassThru
Set-Content -LiteralPath $pidPath -Value $taskProcess.Id
Write-Output ('数字绿色农业模拟器已启动（PID ' + $taskProcess.Id + '），每 30 秒上报。')
