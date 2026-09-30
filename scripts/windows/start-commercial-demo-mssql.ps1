# Pornește DEMO-ul comercial MSSQL pe un port separat, fără să modifice
# instanța operațională care rulează de regulă la localhost:4180.
# Rulează din rădăcina proiectului după seed-commercial-demo-mssql.ps1.
[CmdletBinding()]
param(
  [ValidatePattern('^INFRAFLOW_DEMO(?:_[A-Z0-9_]+)?$')]
  [string]$Database = 'INFRAFLOW_DEMO',
  [ValidateRange(1024, 65535)]
  [int]$Port = 4191
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeEnv = Join-Path $projectRoot 'runtime\mssql.env'

if (-not (Test-Path -LiteralPath $runtimeEnv)) {
  throw "Lipsește configurația locală $runtimeEnv. Configurează runtime-ul MSSQL local înainte de a porni demo-ul; nu introduce parola în acest script."
}

$nodePath = Join-Path $projectRoot 'runtime\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
}

$env:DB_MODE = 'mssql'
$env:INFRAFLOW_DB_PROVIDER = 'mssql'
$env:DB_DATABASE = $Database
$env:INFRAFLOW_SQL_RELATIONAL = '0'
$env:PORT = [string]$Port
$env:INFRAFLOW_PORT = [string]$Port
$env:INFRAFLOW_SCHEDULER_DISABLED = '1'

Write-Host '=== InfraFlow DEMO comercial MSSQL ===' -ForegroundColor Cyan
Write-Host "Baza separată: $Database" -ForegroundColor Green
Write-Host "Adresă: http://localhost:$Port" -ForegroundColor Green
Write-Host 'Scheduler-ul este oprit în demo. Apasă Ctrl+C pentru închidere.' -ForegroundColor Gray

Set-Location $projectRoot
& $nodePath 'server/src/server.js'
