# Reset date tranzactionale demo - rulat zilnic la 03:00

$ErrorActionPreference = "Stop"
$projectRoot = "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean"
$logDir = Join-Path $projectRoot "logs"
$logFile = Join-Path $logDir "demo-reset.log"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "[$timestamp] Demo reset inceput"

$nodePath = Join-Path $projectRoot "runtime\node\bin\node.exe"
if (-not (Test-Path $nodePath)) { $nodePath = "node" }

$env:DB_MODE = "json"
$env:INFRAFLOW_DB_PROVIDER = "json"
$env:DEMO_MODE = "true"
$env:PORT = "4190"

$resetScript = Join-Path $projectRoot "scripts\reset-demo-data.js"
& $nodePath $resetScript

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content $logFile "[$timestamp] Demo reset finalizat"
Write-Host "Reset demo finalizat: $timestamp"
