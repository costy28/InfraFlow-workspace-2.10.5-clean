#Requires -RunAsAdministrator
param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Server = "",
  [string]$Database = "INFRAFLOW",
  [string]$DbUser = "infraflow",
  [SecureString]$DbPassword
)

$ErrorActionPreference = "Stop"
$resolver = Join-Path $PSScriptRoot "resolve-sqlserver.ps1"
$capabilitiesScript = Join-Path $PSScriptRoot "detect-sqlserver-capabilities.ps1"
if (-not (Test-Path $resolver)) { throw "Lipseste scriptul $resolver" }
if (-not (Test-Path $capabilitiesScript)) { throw "Lipseste scriptul $capabilitiesScript" }
. $resolver
. $capabilitiesScript
$Server = Get-InfraFlowSqlServerName -PreferredServer $Server -Database $Database
$sqlServiceName = Get-InfraFlowSqlServiceName -Server $Server
if (-not $DbPassword) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $generatedPassword = ([Convert]::ToBase64String($bytes) -replace "[^a-zA-Z0-9]", "").Substring(0, 28) + "aA1!"
  $DbPassword = ConvertTo-SecureString $generatedPassword -AsPlainText -Force
  Write-Host "Parola SQL dedicata InfraFlow a fost generata automat." -ForegroundColor Cyan
}
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DbPassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if ([string]::IsNullOrWhiteSpace($plainPassword)) { throw "Parola SQL nu poate fi goala." }

$escapedDatabase = $Database.Replace("]", "]]").Replace("'", "''")
$escapedDbUser = $DbUser.Replace("]", "]]").Replace("'", "''")
$escapedPassword = $plainPassword.Replace("'", "''")
Add-Type -AssemblyName System.Data
function Open-SqlAdminConnection {
  Write-Host "Introduceti credentialele unui administrator SQL pentru $Server." -ForegroundColor Yellow
  $sqlAdminUser = Read-Host "Utilizator SQL administrator [sa]"
  if ([string]::IsNullOrWhiteSpace($sqlAdminUser)) { $sqlAdminUser = "sa" }
  $sqlAdminSecure = Read-Host "Parola SQL pentru $sqlAdminUser" -AsSecureString
  $sqlAdminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlAdminSecure)
  try {
    $sqlAdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sqlAdminPtr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sqlAdminPtr)
  }
  $adminConnection = New-Object System.Data.SqlClient.SqlConnection(
    "Server=$Server;Database=master;User Id=$sqlAdminUser;Password=$sqlAdminPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30"
  )
  $adminConnection.Open()
  return $adminConnection
}

function Invoke-BootstrapSql {
  param([System.Data.SqlClient.SqlConnection]$Connection)

  $command = $Connection.CreateCommand()
  $command.CommandTimeout = 120
  $command.CommandText = @"
EXEC master.dbo.xp_instance_regwrite
  N'HKEY_LOCAL_MACHINE',
  N'Software\Microsoft\MSSQLServer\MSSQLServer',
  N'LoginMode',
  REG_DWORD,
  2;
IF DB_ID(N'$escapedDatabase') IS NULL
  CREATE DATABASE [$escapedDatabase];
IF SUSER_ID(N'$escapedDbUser') IS NULL
  CREATE LOGIN [$escapedDbUser] WITH PASSWORD = N'$escapedPassword', CHECK_POLICY = ON, DEFAULT_DATABASE = [$escapedDatabase];
ELSE
  ALTER LOGIN [$escapedDbUser] WITH PASSWORD = N'$escapedPassword', DEFAULT_DATABASE = [$escapedDatabase];
EXEC(N'USE [$escapedDatabase];
  IF OBJECT_ID(N''dbo.app_state'', N''U'') IS NULL
    CREATE TABLE dbo.app_state (
      id int NOT NULL CONSTRAINT pk_app_state PRIMARY KEY,
      data nvarchar(max) NOT NULL,
      updated_at datetime2 NOT NULL CONSTRAINT df_app_state_updated_at DEFAULT sysdatetime(),
      CONSTRAINT ck_app_state_one_row CHECK (id = 1)
    );
  IF DATABASE_PRINCIPAL_ID(N''$escapedDbUser'') IS NULL CREATE USER [$escapedDbUser] FOR LOGIN [$escapedDbUser];
  IF IS_ROLEMEMBER(N''db_owner'', N''$escapedDbUser'') <> 1 EXEC sp_addrolemember N''db_owner'', N''$escapedDbUser'';');
IF IS_SRVROLEMEMBER(N'sysadmin', N'$escapedDbUser') <> 1
  EXEC master.dbo.sp_addsrvrolemember @loginame = N'$escapedDbUser', @rolename = N'sysadmin';
"@
  [void]$command.ExecuteNonQuery()
}

$bootstrapConnection = New-Object System.Data.SqlClient.SqlConnection(
  "Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30"
)
$capabilities = $null
try {
  try {
    $bootstrapConnection.Open()
    Invoke-BootstrapSql -Connection $bootstrapConnection
  } catch {
    if ($bootstrapConnection.State -ne [System.Data.ConnectionState]::Closed) { $bootstrapConnection.Close() }
    Write-Host "Contul Windows nu are suficiente drepturi SQL administrative pe $Server." -ForegroundColor Yellow
    $bootstrapConnection = Open-SqlAdminConnection
    Invoke-BootstrapSql -Connection $bootstrapConnection
  }
  $capabilities = Get-InfraFlowSqlCapabilities -Server $Server -Connection $bootstrapConnection
} catch {
  throw "Crearea automata a bazei INFRAFLOW a esuat pe $Server. Deschideti installerul cu Run as Administrator. Detaliu: $($_.Exception.Message)"
} finally {
  if ($bootstrapConnection.State -ne [System.Data.ConnectionState]::Closed) { $bootstrapConnection.Close() }
}
Write-Host "Profil SQL detectat: $($capabilities.Profile); versiune: $($capabilities.ProductVersion); editie: $($capabilities.Edition)" -ForegroundColor Green

Write-Host "Repornesc serviciul SQL Server pentru autentificarea SQL..." -ForegroundColor Cyan
Restart-Service -Name $sqlServiceName -Force
(Get-Service -Name $sqlServiceName).WaitForStatus("Running", (New-TimeSpan -Seconds 40))
Start-Sleep -Seconds 3

$connectionString = "Server=$Server;Database=$Database;User Id=$DbUser;Password=$plainPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30"
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "select db_name() + ':' + user_name()"
  $identity = [string]$command.ExecuteScalar()
} catch {
  throw "Conectarea SQL InfraFlow a esuat. Rulati CREARE_BAZA_INFRAFLOW.sql in SSMS, reporniti serviciul $sqlServiceName si verificati parola. Detaliu: $($_.Exception.Message)"
} finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
}

$runtimeDir = Join-Path $AppDir "runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$envPath = Join-Path $runtimeDir "mssql.env"
$content = @"
DB_MODE=mssql
INFRAFLOW_DB_PROVIDER=mssql
DB_SERVER=$Server
DB_DATABASE=$Database
DB_ENCRYPT=false
MSSQL_RELATIONAL=0
SQLSERVER_PROFILE=$($capabilities.Profile)
SQLSERVER_VERSION_MAJOR=$($capabilities.MajorVersion)
SQLSERVER_PRODUCT_VERSION=$($capabilities.ProductVersion)
SQLSERVER_SUPPORTS_JSON=$($capabilities.SupportsJson.ToString().ToLowerInvariant())
INFRAFLOW_DB_CONNECTION=$connectionString
"@
Set-Content -LiteralPath $envPath -Value $content -Encoding UTF8
function Set-EnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $existing = Get-Content -LiteralPath $Path -Raw
  $line = "$Key=$Value"
  if ($existing -match "(?m)^$([regex]::Escape($Key))=") {
    $existing = [regex]::Replace($existing, "(?m)^$([regex]::Escape($Key))=.*$", $line)
  } else {
    $existing = $existing.TrimEnd() + "`r`n$line`r`n"
  }
  Set-Content -LiteralPath $Path -Value $existing -Encoding UTF8
}
$rootEnv = Join-Path $AppDir ".env"
Set-EnvValue -Path $rootEnv -Key "DB_SERVER" -Value $Server
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_PROFILE" -Value $capabilities.Profile
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_VERSION_MAJOR" -Value $capabilities.MajorVersion
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_PRODUCT_VERSION" -Value $capabilities.ProductVersion
Set-EnvValue -Path $rootEnv -Key "SQLSERVER_SUPPORTS_JSON" -Value $capabilities.SupportsJson.ToString().ToLowerInvariant()
Set-EnvValue -Path $rootEnv -Key "MSSQL_RELATIONAL" -Value $capabilities.RelationalMode
& icacls.exe $runtimeDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
$backupDir = "C:\InfraFlow\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
& icacls.exe $backupDir /grant "NT SERVICE\$sqlServiceName`:(OI)(CI)M" /T /C | Out-Null
Write-Host "Configuratie MSSQL salvata securizat: $envPath" -ForegroundColor Green
Write-Host "Conexiune verificata: $identity (login SQL cu acces server pentru integrari)" -ForegroundColor Green
