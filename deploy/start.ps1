$ErrorActionPreference = "Stop"
$root        = $PSScriptRoot
$envFile     = Join-Path $root ".env"
$composeFile = Join-Path $root "docker-compose.yml"
$compose     = @("compose", "--env-file", $envFile, "-f", $composeFile)

function Info($m) { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[x] $m" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

if (-not (Test-Path $envFile))     { Die "Missing .env file next to this script." }
if (-not (Test-Path $composeFile)) { Die "Missing docker-compose.yml next to this script." }

# ---------------------------------------------------------------------------
# 1) Docker must be installed and running
# ---------------------------------------------------------------------------
Info "Checking Docker..."
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Warn "Docker is not running. Trying to start Docker Desktop..."
    $candidates = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if (-not $candidates) {
        Die "Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/ then run this again."
    }
    Start-Process -FilePath $candidates[0]
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 5
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { Die "Docker did not start in time. Open Docker Desktop manually, wait for it to be ready, then retry." }
}
Ok "Docker is running."

# ---------------------------------------------------------------------------
# 2) Tailscale must be installed
# ---------------------------------------------------------------------------
Info "Checking Tailscale..."
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $ts) {
    Die "Tailscale is not installed. Install it from https://tailscale.com/download/windows , sign in to your network, then run this again."
}

# ---------------------------------------------------------------------------
# 3) Download the image and start the containers
# ---------------------------------------------------------------------------
Info "Downloading the app image (first run can take a few minutes)..."
docker @compose pull
if ($LASTEXITCODE -ne 0) { Die "Could not download the app image. Check APP_IMAGE in .env and your internet connection." }

Info "Starting containers..."
docker @compose up -d
if ($LASTEXITCODE -ne 0) { Die "Could not start the containers." }

# ---------------------------------------------------------------------------
# 4) Wait until the app answers
# ---------------------------------------------------------------------------
Info "Waiting for the app to become ready..."
$up = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { }
}
if (-not $up) { Die "The app did not become ready. Run: docker compose logs app" }
Ok "App is ready."

# ---------------------------------------------------------------------------
# 5) Create the first admin (safe to run every time)
# ---------------------------------------------------------------------------
Info "Ensuring the administrator account exists..."
docker @compose exec -T app npx prisma db seed

# ---------------------------------------------------------------------------
# 6) Make sure Tailscale is connected
# ---------------------------------------------------------------------------
$status = (tailscale status --json | ConvertFrom-Json)
if ($status.BackendState -ne "Running") {
    Warn "Tailscale is not logged in. A browser window will open - sign in, then run this script again."
    tailscale up
    Die "After signing in to Tailscale, run this script again."
}
$dnsName = $status.Self.DNSName.TrimEnd('.')
$url     = "https://$dnsName"

# ---------------------------------------------------------------------------
# 7) Point the app at the public URL (first run / if it changed)
# ---------------------------------------------------------------------------
$content   = Get-Content -LiteralPath $envFile -Raw
$current   = [regex]::Match($content, '(?m)^NEXTAUTH_URL=(.*)$').Groups[1].Value.Trim()
if ($current -ne $url) {
    Info "Setting NEXTAUTH_URL to $url ..."
    $updated = [regex]::Replace($content, '(?m)^NEXTAUTH_URL=.*$', "NEXTAUTH_URL=$url")
    Set-Content -LiteralPath $envFile -Value $updated -NoNewline -Encoding UTF8
    docker @compose up -d
}

# ---------------------------------------------------------------------------
# 8) Turn on the stable public link
# ---------------------------------------------------------------------------
Info "Enabling the stable public link (Tailscale Funnel)..."
tailscale funnel --bg 3000

Write-Host ""
Ok "The system is running."
Write-Host "  Open this stable link:  $url" -ForegroundColor Green
Write-Host "  First time only: if Tailscale asks, enable Funnel + HTTPS in your" -ForegroundColor DarkGray
Write-Host "  Tailscale admin console (https://login.tailscale.com/admin)." -ForegroundColor DarkGray
Read-Host "Press Enter to close this window (the app keeps running)"
