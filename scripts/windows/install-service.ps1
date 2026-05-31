#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instalează InfraFlow ERP ca serviciu Windows folosind NSSM.

.DESCRIPTION
  Rulează o singură dată pe serverul de producție.
  NSSM (installer\nssm.exe) trebuie să existe.

.PARAMETER AppDir
  Calea de instalare a InfraFlow. Implicit: directorul scriptului (două niveluri sus).

.PARAMETER DbConnection
  Connection string SQL Server. Implicit: SERVER\CIEL cu autentificare Windows.

.PARAMETER Port
  Port HTTP. Implicit: 4180.

.EXAMPLE
  .\install-service.ps1
  .\install-service.ps1 -AppDir "C:\InfraFlow" -Port 4180
  .\install-service.ps1 -DbConnection "Server=MYSERVER\SQLEXPRESS;Database=InfraFlow;User Id=sa;Password=parola;TrustServerCertificate=yes"
#>

param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$DbConnection = "Server=SERVER\CIEL;Database=InfraFlow;Trusted_Connection=yes;TrustServerCertificate=yes",
  [int]$Port = 4180
)

$nssm    = Join-Path $AppDir "tools\nssm.exe"
if (-not (Test-Path $nssm)) {
  # Fallback: installer\nssm.exe (structura veche)
  $nssm = Join-Path $AppDir "installer\nssm.exe"
}
$appJs   = Join-Path $AppDir "server\app.js"
$logsDir = Join-Path $AppDir "logs"

# Detectare node.exe — calea completă (serviciile Windows nu au PATH uzual)
$node = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $node) {
  $commonPaths = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe",
    (Join-Path $AppDir "runtime\node\node.exe")
  )
  $node = $commonPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  InfraFlow ERP — Instalare serviciu Windows" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AppDir : $AppDir"
Write-Host "  Port   : $Port"
Write-Host ""

# Verificări preliminare
if (-not (Test-Path $nssm)) {
  Write-Error "NSSM nu a fost găsit. Cauta nssm.exe in tools\ sau installer\"
  Write-Host "Descarcă NSSM de la https://nssm.cc/download" -ForegroundColor Yellow
  exit 1
}

if (-not $node) {
  Write-Error "Node.js nu a fost găsit. Instalează Node.js LTS de la nodejs.org"
  exit 1
}
Write-Host "  Node   : $node" -ForegroundColor Green

if (-not (Test-Path $appJs)) {
  Write-Error "server\app.js nu a fost găsit la: $appJs"
  exit 1
}

# Creare director logs
New-Item -ItemType Directory -Force $logsDir | Out-Null

# Dezinstalare versiune veche dacă există
$existing = & $nssm status InfraFlow 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Oprire serviciu existent..." -ForegroundColor Yellow
  & $nssm stop InfraFlow 2>$null
  Start-Sleep -Seconds 2
  & $nssm remove InfraFlow confirm 2>$null
  Start-Sleep -Seconds 1
}

# Instalare serviciu
Write-Host "Instalare serviciu InfraFlow..." -ForegroundColor Green
& $nssm install InfraFlow $node $appJs
& $nssm set InfraFlow Application $node
& $nssm set InfraFlow AppParameters $appJs
& $nssm set InfraFlow AppDirectory $AppDir
& $nssm set InfraFlow AppNoConsole 1
& $nssm set InfraFlow AppEnvironmentExtra `
  "PORT=$Port" `
  "INFRAFLOW_PORT=$Port" `
  "DB_MODE=mssql" `
  "INFRAFLOW_DB_CONNECTION=$DbConnection" `
  "NODE_ENV=production"
& $nssm set InfraFlow DisplayName "InfraFlow ERP"
& $nssm set InfraFlow Description "InfraFlow ERP — Server principal (infraflow.local:$Port)"
& $nssm set InfraFlow Start SERVICE_AUTO_START
& $nssm set InfraFlow AppStdout (Join-Path $logsDir "infraflow.log")
& $nssm set InfraFlow AppStderr (Join-Path $logsDir "infraflow-error.log")
& $nssm set InfraFlow AppRotateFiles 1
& $nssm set InfraFlow AppRotateOnline 1
& $nssm set InfraFlow AppRotateSeconds 86400
& $nssm set InfraFlow AppRotateBytes 10485760
& $nssm set InfraFlow AppExit Default Restart

# Windows Service Control Manager: restart după 5s, 10s și 30s la crash.
& sc.exe failure InfraFlow reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

# Pornire serviciu
Write-Host "Pornire serviciu..." -ForegroundColor Green
& $nssm start InfraFlow
Start-Sleep -Seconds 3

# Verificare status
$status = & $nssm status InfraFlow 2>&1
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
if ($status -match "SERVICE_RUNNING") {
  Write-Host "  ✅ Serviciu InfraFlow instalat și pornit!" -ForegroundColor Green
  Write-Host "  Accesează: http://localhost:$Port" -ForegroundColor Green
} else {
  Write-Host "  ⚠️ Status: $status" -ForegroundColor Yellow
  Write-Host "  Verifică logs\infraflow-error.log pentru detalii." -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Comenzi utile:"
Write-Host "  nssm status InfraFlow"
Write-Host "  nssm start InfraFlow"
Write-Host "  nssm stop InfraFlow"
Write-Host "  nssm restart InfraFlow"
Write-Host "  Get-Content logs\infraflow.log -Tail 50 -Wait"
