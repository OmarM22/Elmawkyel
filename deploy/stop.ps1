$root        = $PSScriptRoot
$envFile     = Join-Path $root ".env"
$composeFile = Join-Path $root "docker-compose.yml"

$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) {
    Write-Host "[*] Turning off the public link..." -ForegroundColor Cyan
    tailscale funnel reset *> $null
}

if ((Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $composeFile)) {
    Write-Host "[*] Stopping the containers..." -ForegroundColor Cyan
    docker compose --env-file $envFile -f $composeFile down
}

Write-Host "[+] Stopped. Your data is kept in the 'db-data' volume." -ForegroundColor Green
Read-Host "Press Enter to close"
