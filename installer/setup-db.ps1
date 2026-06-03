#Requires -Version 5.1
param(
  [string]$AppDir = (Split-Path -Parent $PSScriptRoot),
  [string]$Port = "4180"
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $AppDir ".env"
$checkScript = Join-Path $AppDir "scripts\windows\check-sqlserver.ps1"
$resolverScript = Join-Path $AppDir "scripts\windows\resolve-sqlserver.ps1"
$capabilitiesScript = Join-Path $AppDir "scripts\windows\detect-sqlserver-capabilities.ps1"

Write-Host "=== InfraFlow - Configurare MSSQL ===" -ForegroundColor Cyan
if (-not (Test-Path $checkScript)) { throw "Lipseste scriptul $checkScript" }
if (-not (Test-Path $resolverScript)) { throw "Lipseste scriptul $resolverScript" }
if (-not (Test-Path $capabilitiesScript)) { throw "Lipseste scriptul $capabilitiesScript" }
. $resolverScript
. $capabilitiesScript
$sqlServer = Get-InfraFlowSqlServerName
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $checkScript -Server $sqlServer
if ($LASTEXITCODE -ne 0) { throw "SQL Server Express este obligatoriu pentru instalarea InfraFlow." }
try {
  $capabilities = Get-InfraFlowSqlCapabilities -Server $sqlServer
  Write-Host "Profil SQL detectat: $($capabilities.Profile); versiune: $($capabilities.ProductVersion); editie: $($capabilities.Edition)" -ForegroundColor Green
} catch {
  Write-Host "Versiunea SQL va fi detectata dupa autentificarea administrativa. Folosesc temporar profilul compatibil legacy." -ForegroundColor Yellow
  $capabilities = [PSCustomObject]@{
    Profile = "legacy"
    MajorVersion = 0
    ProductVersion = "necunoscuta"
    SupportsJson = $false
    RelationalMode = "0"
  }
}

function Set-EnvValue {
  param([string]$Content, [string]$Key, [string]$Value)
  if ($Content -match "(?m)^$([regex]::Escape($Key))=") {
    return [regex]::Replace($Content, "(?m)^$([regex]::Escape($Key))=.*$", "$Key=$Value")
  }
  return $Content.TrimEnd() + "`r`n$Key=$Value`r`n"
}

if (Test-Path $envFile) {
  $envContent = Get-Content -LiteralPath $envFile -Raw
  $envContent = Set-EnvValue -Content $envContent -Key "DB_SERVER" -Value $sqlServer
  $envContent = Set-EnvValue -Content $envContent -Key "SQLSERVER_PROFILE" -Value $capabilities.Profile
  $envContent = Set-EnvValue -Content $envContent -Key "SQLSERVER_VERSION_MAJOR" -Value $capabilities.MajorVersion
  $envContent = Set-EnvValue -Content $envContent -Key "SQLSERVER_PRODUCT_VERSION" -Value $capabilities.ProductVersion
  $envContent = Set-EnvValue -Content $envContent -Key "SQLSERVER_SUPPORTS_JSON" -Value $capabilities.SupportsJson.ToString().ToLowerInvariant()
  $envContent = Set-EnvValue -Content $envContent -Key "MSSQL_RELATIONAL" -Value $capabilities.RelationalMode
  Set-Content -LiteralPath $envFile -Value $envContent -Encoding UTF8
  Write-Host ".env exista deja - instanta SQL a fost actualizata: $sqlServer" -ForegroundColor Yellow
} else {
  $chars = (65..90) + (97..122) + (48..57)
  $appKey = -join ($chars | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  $envContent = @"
PORT=$Port
INFRAFLOW_PORT=$Port
NODE_ENV=production
DB_MODE=mssql
INFRAFLOW_DB_PROVIDER=mssql
DB_SERVER=$sqlServer
DB_DATABASE=INFRAFLOW
DB_TRUSTED_CONNECTION=false
DB_ENCRYPT=false
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_POOL_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=30000
DB_REQUEST_TIMEOUT=30000
MSSQL_RELATIONAL=0
SQLSERVER_PROFILE=$($capabilities.Profile)
SQLSERVER_VERSION_MAJOR=$($capabilities.MajorVersion)
SQLSERVER_PRODUCT_VERSION=$($capabilities.ProductVersion)
SQLSERVER_SUPPORTS_JSON=$($capabilities.SupportsJson.ToString().ToLowerInvariant())
# Credentialele SQL sunt salvate separat in runtime\mssql.env.
APP_KEY=$appKey
"@
  Set-Content -Path $envFile -Value $envContent -Encoding UTF8
  Write-Host ".env MSSQL creat: $envFile" -ForegroundColor Green
}
