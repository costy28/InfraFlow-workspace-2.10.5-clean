#Requires -RunAsAdministrator
param(
  [string]$AppDir = ""
)

$ErrorActionPreference = "Stop"
if (-not $AppDir) {
  $AppDir = Split-Path -Parent $PSScriptRoot
}

$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

$runtimeEnv = Join-Path $AppDir "runtime\mssql.env"
$settings = @{
  PORT = "4180"
  INFRAFLOW_PORT = "4180"
  NODE_ENV = "production"
  DB_MODE = "mssql"
  INFRAFLOW_DB_PROVIDER = "mssql"
  DB_SERVER = ".\SQLEXPRESS"
  DB_DATABASE = "INFRAFLOW"
  DB_ENCRYPT = "false"
  DB_TRUSTED_CONNECTION = "true"
  MSSQL_RELATIONAL = "0"
  SQLSERVER_PROFILE = "legacy"
  SQLSERVER_VERSION_MAJOR = "0"
  INFRAFLOW_MSSQL_HELPER_TIMEOUT_MS = "180000"
  INFRAFLOW_MSSQL_HELPER_RETRIES = "2"
  INFRAFLOW_MSSQL_HELPER_RETRY_DELAY_MS = "5000"
}

if (Test-Path -LiteralPath $runtimeEnv) {
  Get-Content -LiteralPath $runtimeEnv | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_ -split '=', 2
    $key = $parts[0].Trim()
    $value = $parts[1]
    if ($key) { $settings[$key] = $value }
  }
}

if ($settings.ContainsKey("INFRAFLOW_DB_CONNECTION") -and -not $settings.ContainsKey("DB_TRUSTED_CONNECTION")) {
  if ($settings.INFRAFLOW_DB_CONNECTION -match '(?i)\b(User Id|UID)\s*=') {
    $settings.DB_TRUSTED_CONNECTION = "false"
  }
}

function Escape-BatchValue {
  param([string]$Value)
  return ($Value -replace '%', '%%' -replace '"', '\"')
}

if (-not (Test-Path -LiteralPath (Join-Path $AppDir "logs"))) {
  New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "logs") | Out-Null
}

$bat = @(
  "@echo off",
  "setlocal"
)
foreach ($key in $settings.Keys | Sort-Object) {
  $bat += "set `"$key=$(Escape-BatchValue ([string]$settings[$key]))`""
}
$bat += @(
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
Set-Content -LiteralPath $batPath -Value ($bat -join "`r`n") -Encoding ASCII

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$batPath`""
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "InfraFlow ERP" -Action $action -Trigger $triggers -Settings $taskSettings -Principal $principal -Description "InfraFlow ERP Server MSSQL" -Force | Out-Null
Start-ScheduledTask -TaskName "InfraFlow ERP"
Write-Host "InfraFlow ERP pornit prin Task Scheduler." -ForegroundColor Green
