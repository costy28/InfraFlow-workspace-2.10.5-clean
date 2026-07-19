#Requires -RunAsAdministrator
param(
  [string]$AppDir = "C:\Program Files (x86)\InfraFlow",
  [int]$Port = 4180,
  [int]$TimeoutSeconds = 150
)

$ErrorActionPreference = "Stop"
$setupTaskCandidates = @(
  (Join-Path $AppDir "scripts\setup-task.ps1"),
  (Join-Path $AppDir "installer\setup-task.ps1")
)
$setupTask = $setupTaskCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$verify = Join-Path $AppDir "scripts\windows\verify-infraflow-startup.ps1"
$log = Join-Path $AppDir "logs\infraflow.err.log"

if (-not $setupTask) {
  throw "Lipseste setup-task.ps1 in scripts sau installer. Reinstalati InfraFlow Server sau reaplicati ultimul update."
}

Write-Host "Reconstruiesc pornirea automata InfraFlow..." -ForegroundColor Cyan
Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'server[\\/]app\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setupTask
if ($LASTEXITCODE -ne 0) { throw "Task-ul InfraFlow ERP nu a putut fi creat." }

if (Test-Path -LiteralPath $verify) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verify -AppDir $AppDir -Port $Port -TimeoutSeconds $TimeoutSeconds
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Pornirea automata InfraFlow functioneaza." -ForegroundColor Green
    exit 0
  }
}

Write-Host "InfraFlow nu a pornit automat. Diagnostic:" -ForegroundColor Red
Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue |
  Select-Object TaskName, State |
  Format-Table -AutoSize
Get-ScheduledTaskInfo -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue |
  Select-Object LastRunTime, LastTaskResult, NextRunTime |
  Format-List
if (Test-Path -LiteralPath $log) {
  Write-Host "Ultimele mesaje din $log" -ForegroundColor Yellow
  Get-Content -LiteralPath $log -Tail 100
}
exit 1
