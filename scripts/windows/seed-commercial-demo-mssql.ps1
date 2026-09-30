# Pregătește doar o bază MSSQL dedicată demo. Nu folosi numele bazei clientului.
# Exemplu:
#   $env:INFRAFLOW_DEMO_DATABASE = 'INFRAFLOW_DEMO'
#   .\scripts\windows\seed-commercial-demo-mssql.ps1
# Pentru recrearea datelor fictive: adaugă -Reset.
param([switch]$Reset)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $env:INFRAFLOW_DEMO_DATABASE) {
  throw 'Setează mai întâi $env:INFRAFLOW_DEMO_DATABASE, de exemplu INFRAFLOW_DEMO.'
}

$nodePath = Join-Path $projectRoot 'runtime\node\bin\node.exe'
if (-not (Test-Path $nodePath)) { $nodePath = 'node' }
$arguments = @((Join-Path $projectRoot 'scripts\seed-commercial-demo-mssql.js'))
if ($Reset) { $arguments += '--reset' }

Write-Host "Pregătesc baza demo separată: $($env:INFRAFLOW_DEMO_DATABASE)" -ForegroundColor Cyan
& $nodePath @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
