$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'ThingsBoard startup failed.' }
    Write-Host 'ThingsBoard: http://localhost:8080 (allow time for startup)'
} finally { Pop-Location }
