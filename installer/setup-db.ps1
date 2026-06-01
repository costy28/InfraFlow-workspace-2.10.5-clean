#Requires -Version 5.1
param(
  [string]$AppDir = (Split-Path -Parent $PSScriptRoot),
  [string]$Port = "4180"
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $AppDir ".env"
$checkScript = Join-Path $AppDir "scripts\windows\check-sqlserver.ps1"

Write-Host "=== InfraFlow - Configurare MSSQL ===" -ForegroundColor Cyan
if (-not (Test-Path $checkScript)) { throw "Lipseste scriptul $checkScript" }
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $checkScript
if ($LASTEXITCODE -ne 0) { throw "SQL Server Express este obligatoriu pentru instalarea InfraFlow." }

if (Test-Path $envFile) {
  Write-Host ".env exista deja - configuratia este pastrata." -ForegroundColor Yellow
} else {
  $chars = (65..90) + (97..122) + (48..57)
  $appKey = -join ($chars | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  $envContent = @"
PORT=$Port
INFRAFLOW_PORT=$Port
NODE_ENV=production
DB_MODE=mssql
INFRAFLOW_DB_PROVIDER=mssql
DB_SERVER=.\SQLEXPRESS
DB_DATABASE=INFRAFLOW
DB_TRUSTED_CONNECTION=false
DB_ENCRYPT=false
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_POOL_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=30000
DB_REQUEST_TIMEOUT=30000
MSSQL_RELATIONAL=0
# Credentialele SQL sunt salvate separat in runtime\mssql.env.
APP_KEY=$appKey
"@
  Set-Content -Path $envFile -Value $envContent -Encoding UTF8
  Write-Host ".env MSSQL creat: $envFile" -ForegroundColor Green
}
