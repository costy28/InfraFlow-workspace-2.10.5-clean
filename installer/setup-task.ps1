#Requires -RunAsAdministrator
$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

$runtimeEnv = Join-Path $AppDir "runtime\mssql.env"
$dbServer = ".\SQLEXPRESS"
$dbDatabase = "INFRAFLOW"
$sqlProfile = "legacy"
$sqlMajorVersion = "0"
$mssqlRelational = "0"
$dbTrustedConnection = "true"
$hasConfiguredTrusted = $false
$dbUser = ""
$dbPassword = ""
$dbConnection = ""
if (Test-Path $runtimeEnv) {
  $runtimeLines = Get-Content -LiteralPath $runtimeEnv
  $configuredServer = ($runtimeLines | Where-Object { $_ -like "DB_SERVER=*" } | Select-Object -First 1) -replace "^DB_SERVER=", ""
  if ($configuredServer -match '^(?:\.|localhost|[A-Za-z0-9_.-]+)(?:\\[A-Za-z0-9_$.-]+)?$') {
    $dbServer = $configuredServer
  } elseif (-not [string]::IsNullOrWhiteSpace($configuredServer)) {
    throw "Configuratie DB_SERVER invalida in $runtimeEnv. Rulati configure-mssql-login.ps1."
  }
  $configuredDatabase = ($runtimeLines | Where-Object { $_ -like "DB_DATABASE=*" } | Select-Object -First 1) -replace "^DB_DATABASE=", ""
  if ($configuredDatabase -match '^[A-Za-z0-9_.-]+$') {
    $dbDatabase = $configuredDatabase
  } elseif (-not [string]::IsNullOrWhiteSpace($configuredDatabase)) {
    throw "Configuratie DB_DATABASE invalida in $runtimeEnv."
  }
  $configuredProfile = ($runtimeLines | Where-Object { $_ -like "SQLSERVER_PROFILE=*" } | Select-Object -First 1) -replace "^SQLSERVER_PROFILE=", ""
  if ($configuredProfile -in @("legacy", "modern")) { $sqlProfile = $configuredProfile }
  $configuredMajorVersion = ($runtimeLines | Where-Object { $_ -like "SQLSERVER_VERSION_MAJOR=*" } | Select-Object -First 1) -replace "^SQLSERVER_VERSION_MAJOR=", ""
  if ($configuredMajorVersion -match '^\d+$') { $sqlMajorVersion = $configuredMajorVersion }
  $configuredRelational = ($runtimeLines | Where-Object { $_ -like "MSSQL_RELATIONAL=*" } | Select-Object -First 1) -replace "^MSSQL_RELATIONAL=", ""
  if ($configuredRelational -in @("0", "1")) { $mssqlRelational = $configuredRelational }
  $configuredTrusted = ($runtimeLines | Where-Object { $_ -like "DB_TRUSTED_CONNECTION=*" } | Select-Object -First 1) -replace "^DB_TRUSTED_CONNECTION=", ""
  if ($configuredTrusted -match '^(?i:true|false|1|0|yes|no|sspi)$') {
    $dbTrustedConnection = $configuredTrusted
    $hasConfiguredTrusted = $true
  }
  $configuredUser = ($runtimeLines | Where-Object { $_ -like "DB_USER=*" } | Select-Object -First 1) -replace "^DB_USER=", ""
  if (-not [string]::IsNullOrWhiteSpace($configuredUser)) { $dbUser = $configuredUser }
  $configuredPassword = ($runtimeLines | Where-Object { $_ -like "DB_PASSWORD=*" } | Select-Object -First 1) -replace "^DB_PASSWORD=", ""
  if (-not [string]::IsNullOrWhiteSpace($configuredPassword)) { $dbPassword = $configuredPassword }
  $configuredConnection = ($runtimeLines | Where-Object { $_ -like "INFRAFLOW_DB_CONNECTION=*" } | Select-Object -First 1) -replace "^INFRAFLOW_DB_CONNECTION=", ""
  if (-not [string]::IsNullOrWhiteSpace($configuredConnection)) {
    $dbConnection = $configuredConnection
    if (-not $hasConfiguredTrusted -and $configuredConnection -match '(?i)Integrated Security\s*=\s*(true|sspi|yes)') {
      $dbTrustedConnection = "true"
    } elseif (-not $hasConfiguredTrusted -and $configuredConnection -match '(?i)\b(User Id|UID)\s*=') {
      $dbTrustedConnection = "false"
    }
  }
}

function Escape-BatchValue {
  param([string]$Value)
  return ($Value -replace '%', '%%' -replace '"', '\"')
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
  "set DB_DATABASE=$dbDatabase",
  "set DB_ENCRYPT=false",
  "set DB_TRUSTED_CONNECTION=$dbTrustedConnection",
  "set MSSQL_RELATIONAL=$mssqlRelational",
  "set SQLSERVER_PROFILE=$sqlProfile",
  "set SQLSERVER_VERSION_MAJOR=$sqlMajorVersion",
  "set INFRAFLOW_MSSQL_HELPER_TIMEOUT_MS=180000",
  "set INFRAFLOW_MSSQL_HELPER_RETRIES=2",
  "set INFRAFLOW_MSSQL_HELPER_RETRY_DELAY_MS=5000"
)
if (-not [string]::IsNullOrWhiteSpace($dbUser)) {
  $bat += "set `"DB_USER=$(Escape-BatchValue $dbUser)`""
}
if (-not [string]::IsNullOrWhiteSpace($dbPassword)) {
  $bat += "set `"DB_PASSWORD=$(Escape-BatchValue $dbPassword)`""
}
if (-not [string]::IsNullOrWhiteSpace($dbConnection)) {
  $bat += "set `"INFRAFLOW_DB_CONNECTION=$(Escape-BatchValue $dbConnection)`""
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
