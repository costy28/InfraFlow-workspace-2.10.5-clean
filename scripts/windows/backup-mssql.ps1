#Requires -Version 5.1
param(
  [string]$Server = ".\SQLEXPRESS",
  [string]$Database = "INFRAFLOW",
  [string]$BackupDir = "C:\InfraFlow\backups"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BackupDir "infraflow-backup-$stamp.bak"
$escapedFile = $backupFile.Replace("'", "''")

$appDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeEnv = Join-Path $appDir "runtime\mssql.env"
if (-not (Test-Path $runtimeEnv)) { throw "Lipseste configuratia MSSQL: $runtimeEnv" }
$connectionString = ((Get-Content $runtimeEnv) | Where-Object { $_ -like "INFRAFLOW_DB_CONNECTION=*" } | Select-Object -First 1) -replace "^INFRAFLOW_DB_CONNECTION=", ""
if (-not $connectionString) { throw "Lipseste INFRAFLOW_DB_CONNECTION din $runtimeEnv" }

Add-Type -AssemblyName System.Data
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 300
  $command.CommandText = "BACKUP DATABASE [$Database] TO DISK = N'$escapedFile' WITH INIT, CHECKSUM"
  [void]$command.ExecuteNonQuery()
  Write-Host "Backup creat: $backupFile" -ForegroundColor Green
} finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
}

Get-ChildItem -LiteralPath $BackupDir -Filter "infraflow-backup-*.bak" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 7 |
  Remove-Item -Force
