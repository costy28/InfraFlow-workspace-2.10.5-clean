#Requires -RunAsAdministrator
param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Server = ".\SQLEXPRESS",
  [string]$Database = "INFRAFLOW",
  [string]$DbUser = "infraflow",
  [SecureString]$DbPassword
)

$ErrorActionPreference = "Stop"
if (-not $DbPassword) {
  $DbPassword = Read-Host "Parola SQL pentru utilizatorul $DbUser" -AsSecureString
}
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DbPassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if ([string]::IsNullOrWhiteSpace($plainPassword)) { throw "Parola SQL nu poate fi goala." }

$connectionString = "Server=$Server;Database=$Database;User Id=$DbUser;Password=$plainPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30"
Add-Type -AssemblyName System.Data
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "select concat(db_name(), ':', user_name())"
  $identity = [string]$command.ExecuteScalar()
} catch {
  throw "Conectarea SQL dedicata a esuat. Rulati CREARE_BAZA_INFRAFLOW.sql in SSMS, reporniti serviciul MSSQL`$SQLEXPRESS si verificati parola. Detaliu: $($_.Exception.Message)"
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
INFRAFLOW_DB_CONNECTION=$connectionString
"@
Set-Content -LiteralPath $envPath -Value $content -Encoding UTF8
& icacls.exe $runtimeDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
$backupDir = "C:\InfraFlow\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
& icacls.exe $backupDir /grant "NT SERVICE\MSSQL`$SQLEXPRESS:(OI)(CI)M" /T /C | Out-Null
Write-Host "Configuratie MSSQL salvata securizat: $envPath" -ForegroundColor Green
Write-Host "Conexiune verificata: $identity" -ForegroundColor Green
