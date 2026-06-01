#Requires -RunAsAdministrator
param([string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path)

$script = Join-Path $AppDir "scripts\windows\backup-mssql.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "InfraFlow Backup MSSQL" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Backup zilnic INFRAFLOW, retentie 7 copii" -Force | Out-Null
Write-Host "Task Scheduler inregistrat: InfraFlow Backup MSSQL" -ForegroundColor Green
