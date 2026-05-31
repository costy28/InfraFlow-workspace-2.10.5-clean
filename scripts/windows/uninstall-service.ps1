#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Dezinstalează serviciul Windows InfraFlow.
#>

param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$nssm = Join-Path $AppDir "installer\nssm.exe"
if (-not (Test-Path $nssm)) { $nssm = "nssm" }

Write-Host "Oprire serviciu InfraFlow..." -ForegroundColor Yellow
& $nssm stop InfraFlow 2>$null
Start-Sleep -Seconds 2

Write-Host "Dezinstalare serviciu InfraFlow..." -ForegroundColor Yellow
& $nssm remove InfraFlow confirm 2>$null

Write-Host "✅ Serviciu InfraFlow dezinstalat." -ForegroundColor Green
