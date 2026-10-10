#requires -Version 5.1
<#
    package-client.ps1
    ---------------------------------------------------------------------------
    Builds the client delivery bundle: a single ZIP containing only what the
    client needs to run الوكيل on a Windows machine (Docker Desktop + Tailscale).

    Included : docker-compose.yml, .env, README-تشغيل.txt,
               START.bat, STOP.bat, start.ps1, stop.ps1, db/seed.sql
    Excluded : the whole source tree, node_modules, .git, this script itself.

    Output   : <project>\release\alwakeel-deploy.zip  (top-level folder "alwakeel")

    Usage    :  powershell -ExecutionPolicy Bypass -File .\package-client.ps1
                powershell -ExecutionPolicy Bypass -File .\package-client.ps1 -Force
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Make Arabic console output display correctly under Windows PowerShell 5.1
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding           = [System.Text.Encoding]::UTF8
} catch { }

$deployDir  = $PSScriptRoot
$projectDir = Split-Path $deployDir -Parent
$envFile    = Join-Path $deployDir ".env"
$releaseDir = Join-Path $projectDir "release"
$outZip     = Join-Path $releaseDir "alwakeel-deploy.zip"

function Info($m) { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[x] $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 0) Sanity: required files exist
# ---------------------------------------------------------------------------
$include = @(
    "docker-compose.yml",
    ".env",
    "README-تشغيل.txt",
    "START.bat",
    "STOP.bat",
    "start.ps1",
    "stop.ps1",
    "db"
)

$missing = @()
foreach ($i in $include) {
    if (-not (Test-Path -LiteralPath (Join-Path $deployDir $i))) { $missing += $i }
}
if ($missing.Count -gt 0) {
    Fail ("Missing required file(s) in deploy\: " + ($missing -join ", "))
    exit 1
}

# ---------------------------------------------------------------------------
# 1) Validate .env — refuse to ship obvious placeholders unless -Force
# ---------------------------------------------------------------------------
function Get-EnvValue([string]$key) {
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match ("^\s*" + [regex]::Escape($key) + "\s*=") } | Select-Object -First 1
    if (-not $line) { return "" }
    $v = ($line -replace ("^\s*" + [regex]::Escape($key) + "\s*=\s*"), "").Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
        $v = $v.Substring(1, $v.Length - 2)
    }
    return $v
}

$problems = @()
$appImage   = Get-EnvValue "APP_IMAGE"
$authSecret = Get-EnvValue "NEXTAUTH_SECRET"
$pgPassword = Get-EnvValue "POSTGRES_PASSWORD"
$adminEmail = Get-EnvValue "INITIAL_ADMIN_EMAIL"
$adminPass  = Get-EnvValue "INITIAL_ADMIN_PASSWORD"

if ($appImage -match "yourdockerhubuser" -or $appImage -notmatch "/") {
    $problems += "APP_IMAGE لا يزال قيمة افتراضية — ضع اسم حسابك على Docker Hub (مثال: myuser/alwakeel:latest)."
}
if ($authSecret -match "change-me" -or $authSecret.Length -lt 32) {
    $problems += "NEXTAUTH_SECRET ضعيف أو افتراضي — ولّد سرًّا قويًا (48 بايت على الأقل)."
}
if ($pgPassword -match "change-me" -or $pgPassword.Length -lt 12) {
    $problems += "POSTGRES_PASSWORD ضعيف أو افتراضي — استخدم 16+ حرفًا (حروف وأرقام فقط)."
}
if ([string]::IsNullOrWhiteSpace($adminEmail) -or $adminEmail -notmatch "@") {
    $problems += "INITIAL_ADMIN_EMAIL فارغ أو غير صالح."
}
if ([string]::IsNullOrWhiteSpace($adminPass) -or $adminPass -match "change-me" -or $adminPass.Length -lt 8) {
    $problems += "INITIAL_ADMIN_PASSWORD فارغ أو ضعيف (8 أحرف على الأقل)."
}

if ($problems.Count -gt 0) {
    Warn "قيم يجب ضبطها في deploy\.env قبل التسليم:"
    $problems | ForEach-Object { Write-Host ("   - " + $_) -ForegroundColor Yellow }
    if (-not $Force) {
        Write-Host ""
        Fail "أوقفت الإنشاء. عدّل .env ثم أعد المحاولة (أو استخدم -Force للتجاهل)."
        exit 1
    }
    Warn "تم التجاهل بسبب -Force — الحزمة ستُبنى كما هي."
}

# ---------------------------------------------------------------------------
# 2) Stage the files under a single top-level folder "alwakeel"
# ---------------------------------------------------------------------------
$stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
$staging = Join-Path $env:TEMP ("alwakeel-pkg-" + $stamp)
$dest    = Join-Path $staging "alwakeel"
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Info "تجهيز الملفات..."
foreach ($i in $include) {
    Copy-Item -LiteralPath (Join-Path $deployDir $i) -Destination $dest -Recurse -Force
}

# The $include list above is the whitelist — .env.example and this script are
# never copied into the bundle, so no extra pruning is needed.

# ---------------------------------------------------------------------------
# 3) Create the ZIP
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}
if (Test-Path -LiteralPath $outZip) { Remove-Item -LiteralPath $outZip -Force }

Info "إنشاء الحزمة المضغوطة..."
Compress-Archive -Path $dest -DestinationPath $outZip -CompressionLevel Optimal -Force

Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------------
# 4) Report
# ---------------------------------------------------------------------------
$sizeKB = [math]::Round((Get-Item -LiteralPath $outZip).Length / 1KB, 1)
Write-Host ""
Ok "تم إنشاء الحزمة:"
Write-Host ("    " + $outZip) -ForegroundColor Green
Write-Host ("    الحجم: {0} KB" -f $sizeKB) -ForegroundColor DarkGray
Write-Host ""
Write-Host "  أرسل هذا الملف للعميل. يحتوي داخله على مجلد 'alwakeel':" -ForegroundColor DarkGray
Write-Host "    - docker-compose.yml, .env, README-تشغيل.txt" -ForegroundColor DarkGray
Write-Host "    - START.bat, STOP.bat, start.ps1, stop.ps1, db/seed.sql" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  تذكير: تأكد أن GitHub Actions رفعت الصورة (APP_IMAGE) إلى Docker Hub قبل التسليم." -ForegroundColor DarkGray
