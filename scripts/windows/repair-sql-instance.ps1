#Requires -RunAsAdministrator
param(
  [string]$AppDir = "C:\Program Files (x86)\InfraFlow",
  [string]$Server = ""
)

$ErrorActionPreference = "Stop"
$resolver = Join-Path $PSScriptRoot "resolve-sqlserver.ps1"
$capabilitiesScript = Join-Path $PSScriptRoot "detect-sqlserver-capabilities.ps1"
if (-not (Test-Path $resolver)) { throw "Lipseste scriptul $resolver" }
if (-not (Test-Path $capabilitiesScript)) { throw "Lipseste scriptul $capabilitiesScript" }
. $resolver
. $capabilitiesScript

$Server = Get-InfraFlowSqlServerName -PreferredServer $Server
$capabilities = Get-InfraFlowSqlCapabilities -Server $Server
$serviceName = Get-InfraFlowSqlServiceName -Server $Server
$service = Get-Service -Name $serviceName -ErrorAction Stop
if ($service.Status -ne "Running") {
  Start-Service -Name $serviceName
  $service.WaitForStatus("Running", (New-TimeSpan -Seconds 20))
}

function Set-EnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  if (-not (Test-Path $Path)) { return }
  $content = Get-Content -LiteralPath $Path -Raw
  $line = "$Key=$Value"
  if ($content -match "(?m)^$([regex]::Escape($Key))=") {
    $content = [regex]::Replace($content, "(?m)^$([regex]::Escape($Key))=.*$", $line)
  } else {
    $content = $content.TrimEnd() + "`r`n$line`r`n"
  }
  Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

$runtimeEnv = Join-Path $AppDir "runtime\mssql.env"
if (-not (Test-Path $runtimeEnv)) {
  throw "Lipseste $runtimeEnv. Rulati configure-mssql-login.ps1 -AppDir `"$AppDir`" -Server `"$Server`"."
}
Set-EnvValue -Path $runtimeEnv -Key "DB_SERVER" -Value $Server
Set-EnvValue -Path $runtimeEnv -Key "SQLSERVER_PROFILE" -Value $capabilities.Profile
Set-EnvValue -Path $runtimeEnv -Key "SQLSERVER_VERSION_MAJOR" -Value $capabilities.MajorVersion
Set-EnvValue -Path $runtimeEnv -Key "SQLSERVER_PRODUCT_VERSION" -Value $capabilities.ProductVersion
Set-EnvValue -Path $runtimeEnv -Key "SQLSERVER_SUPPORTS_JSON" -Value $capabilities.SupportsJson.ToString().ToLowerInvariant()
Set-EnvValue -Path $runtimeEnv -Key "MSSQL_RELATIONAL" -Value $capabilities.RelationalMode
$runtimeContent = Get-Content -LiteralPath $runtimeEnv -Raw
$runtimeContent = [regex]::Replace(
  $runtimeContent,
  "(?im)^(INFRAFLOW_DB_CONNECTION=)Server=[^;]+;",
  "`${1}Server=$Server;"
)
Set-Content -LiteralPath $runtimeEnv -Value $runtimeContent -Encoding UTF8

$rootEnv = Join-Path $AppDir ".env"
Set-EnvValue -Path $rootEnv -Key "DB_SERVER" -Value $Server
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_PROFILE" -Value $capabilities.Profile
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_VERSION_MAJOR" -Value $capabilities.MajorVersion
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_PRODUCT_VERSION" -Value $capabilities.ProductVersion
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_SUPPORTS_JSON" -Value $capabilities.SupportsJson.ToString().ToLowerInvariant()
Set-EnvValue -Path $rootEnv -Key "MSSQL_RELATIONAL" -Value $capabilities.RelationalMode

$launcher = Join-Path $AppDir "start-server.bat"
if (Test-Path $launcher) {
  $launcherContent = Get-Content -LiteralPath $launcher -Raw
  $launcherContent = [regex]::Replace($launcherContent, "(?im)^set DB_SERVER=.*$", "set DB_SERVER=$Server")
  Set-Content -LiteralPath $launcher -Value $launcherContent -Encoding ASCII
}

$task = Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName "InfraFlow ERP"
}

Start-Sleep -Seconds 8
try {
  $health = Invoke-RestMethod "http://localhost:4180/api/system/health" -TimeoutSec 10
  Write-Host "InfraFlow pornit. SQL: $Server ($serviceName); profil: $($capabilities.Profile); versiune: $($capabilities.ProductVersion)" -ForegroundColor Green
  $health | ConvertTo-Json -Depth 5
} catch {
  Write-Host "Configuratia SQL a fost reparata, dar serverul nu raspunde inca." -ForegroundColor Yellow
  Write-Host "Verificati jurnalul: $AppDir\logs\infraflow.err.log" -ForegroundColor Yellow
  exit 1
}
