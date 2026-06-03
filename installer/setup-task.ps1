#Requires -RunAsAdministrator
$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

$runtimeEnv = Join-Path $AppDir "runtime\mssql.env"
$dbServer = ".\SQLEXPRESS"
$sqlProfile = "legacy"
$sqlMajorVersion = "0"
$mssqlRelational = "0"
if (Test-Path $runtimeEnv) {
  $runtimeLines = Get-Content -LiteralPath $runtimeEnv
  $configuredServer = ($runtimeLines | Where-Object { $_ -like "DB_SERVER=*" } | Select-Object -First 1) -replace "^DB_SERVER=", ""
  if ($configuredServer -match '^(?:\.|localhost|[A-Za-z0-9_.-]+)(?:\\[A-Za-z0-9_$.-]+)?$') {
    $dbServer = $configuredServer
  } elseif (-not [string]::IsNullOrWhiteSpace($configuredServer)) {
    throw "Configuratie DB_SERVER invalida in $runtimeEnv. Rulati configure-mssql-login.ps1."
  }
  $configuredProfile = ($runtimeLines | Where-Object { $_ -like "SQLSERVER_PROFILE=*" } | Select-Object -First 1) -replace "^SQLSERVER_PROFILE=", ""
  if ($configuredProfile -in @("legacy", "modern")) { $sqlProfile = $configuredProfile }
  $configuredMajorVersion = ($runtimeLines | Where-Object { $_ -like "SQLSERVER_VERSION_MAJOR=*" } | Select-Object -First 1) -replace "^SQLSERVER_VERSION_MAJOR=", ""
  if ($configuredMajorVersion -match '^\d+$') { $sqlMajorVersion = $configuredMajorVersion }
  $configuredRelational = ($runtimeLines | Where-Object { $_ -like "MSSQL_RELATIONAL=*" } | Select-Object -First 1) -replace "^MSSQL_RELATIONAL=", ""
  if ($configuredRelational -in @("0", "1")) { $mssqlRelational = $configuredRelational }
}

$bat = @(
  "@echo off",
  "setlocal",
  "set PORT=4180",
  "set INFRAFLOW_PORT=4180",
  "set NODE_ENV=production",
  "set DB_MODE=mssql",
  "set INFRAFLOW_DB_PROVIDER=mssql",
  "set DB_SERVER=$dbServer",
  "set DB_DATABASE=INFRAFLOW",
  "set DB_ENCRYPT=false",
  "set MSSQL_RELATIONAL=$mssqlRelational",
  "set SQLSERVER_PROFILE=$sqlProfile",
  "set SQLSERVER_VERSION_MAJOR=$sqlMajorVersion",
  "if not exist `"$AppDir\logs`" mkdir `"$AppDir\logs`"",
  "cd /d `"$AppDir`"",
  ":restart",
  "echo [%date% %time%] Pornesc InfraFlow ERP... >> `"$AppDir\logs\infraflow.out.log`"",
  "`"$node`" `"$AppDir\server\app.js`" >> `"$AppDir\logs\infraflow.out.log`" 2>> `"$AppDir\logs\infraflow.err.log`"",
  "echo [%date% %time%] Server oprit. Reincerc in 15 secunde. >> `"$AppDir\logs\infraflow.err.log`"",
  "timeout /t 15 /nobreak > nul",
  "goto restart"
)
$batPath = Join-Path $AppDir "start-server.bat"
Set-Content -Path $batPath -Value ($bat -join "`r`n") -Encoding ASCII

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`""
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "InfraFlow ERP" -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description "InfraFlow ERP Server MSSQL" -Force | Out-Null
Start-ScheduledTask -TaskName "InfraFlow ERP"
Write-Host "InfraFlow ERP pornit prin Task Scheduler." -ForegroundColor Green
