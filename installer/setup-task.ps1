#Requires -RunAsAdministrator
$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

$bat = @(
  "@echo off",
  "set PORT=4180",
  "set INFRAFLOW_PORT=4180",
  "set NODE_ENV=production",
  "set DB_MODE=mssql",
  "set INFRAFLOW_DB_PROVIDER=mssql",
  "set DB_SERVER=.\SQLEXPRESS",
  "set DB_DATABASE=INFRAFLOW",
  "set DB_ENCRYPT=false",
  "set MSSQL_RELATIONAL=0",
  "cd /d `"$AppDir`"",
  "`"$node`" `"$AppDir\server\app.js`" >> `"$AppDir\logs\infraflow.out.log`" 2>> `"$AppDir\logs\infraflow.err.log`""
)
$batPath = Join-Path $AppDir "start-server.bat"
Set-Content -Path $batPath -Value ($bat -join "`r`n") -Encoding ASCII

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "InfraFlow ERP" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "InfraFlow ERP Server MSSQL" -Force | Out-Null
Start-ScheduledTask -TaskName "InfraFlow ERP"
Write-Host "InfraFlow ERP pornit prin Task Scheduler." -ForegroundColor Green
