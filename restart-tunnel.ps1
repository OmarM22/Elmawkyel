$ErrorActionPreference = "Stop"
$project = $PSScriptRoot
$tunnelLog = Join-Path $env:TEMP "opencode\cloudflared.log"
$appLog = Join-Path $env:TEMP "opencode\next-prod.log"

# 1. Stop the old tunnel (if any)
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Start a fresh quick tunnel
New-Item -ItemType Directory -Path (Split-Path $tunnelLog) -Force | Out-Null
Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cloudflared tunnel --url http://localhost:3000 > `"$tunnelLog`" 2>&1" -WindowStyle Hidden

# 3. Wait for the new URL
$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
}
if (-not $url) {
  Write-Host "FAILED: could not get a tunnel URL. Log tail:" -ForegroundColor Red
  Get-Content $tunnelLog -Tail 20 -ErrorAction SilentlyContinue
  exit 1
}

# 4. Point NEXTAUTH_URL at the new URL (required - otherwise login loops)
#    Explicit UTF-8 on both sides - the Write tool writes UTF-8 (no BOM) and
#    PS 5.1 defaults would mangle non-ASCII comments.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$envPath = Join-Path $project ".env"
$content = [System.IO.File]::ReadAllText($envPath, $utf8)
$content = [regex]::Replace($content, 'NEXTAUTH_URL="[^"]*"', "NEXTAUTH_URL=`"$url`"")
[System.IO.File]::WriteAllText($envPath, $content, $utf8)

# 5. Restart the app server so it picks up the new NEXTAUTH_URL
$p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($p) { Stop-Process -Id $p -Force; Start-Sleep -Seconds 3 }
if (-not (Test-Path (Join-Path $project ".next"))) {
  Write-Host "Building (first run)..." -ForegroundColor Yellow
  Push-Location $project
  node ".\node_modules\next\dist\bin\next" build
  Pop-Location
}
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start > `"$appLog`" 2>&1" -WorkingDirectory $project -WindowStyle Hidden
Start-Sleep -Seconds 10

# 6. Report (poll - the server needs a few seconds to bind the port)
$serverUp = $false
for ($i = 0; $i -lt 30; $i++) {
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { $serverUp = $true; break }
  Start-Sleep -Seconds 1
}
Write-Host ""
if ($serverUp) { Write-Host "Server: UP (port 3000)" -ForegroundColor Green } else { Write-Host "Server: DOWN - check $appLog" -ForegroundColor Red }
Write-Host ""
Write-Host "NEW LINK:" -ForegroundColor Cyan
Write-Host $url -ForegroundColor Green
Write-Host ""
Write-Host "Open it in the browser and log in (Ctrl+Shift+R if the old session sticks)."
