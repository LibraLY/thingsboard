Push-Location $PSScriptRoot
try {
    docker compose ps
    docker compose logs --tail 40 thingsboard-ce
} finally { Pop-Location }
