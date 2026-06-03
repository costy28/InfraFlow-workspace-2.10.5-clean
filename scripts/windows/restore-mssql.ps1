#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$AppDir = "C:\Program Files (x86)\InfraFlow",
  [string]$Database = "INFRAFLOW"
)

$ErrorActionPreference = "Stop"
$backup = (Resolve-Path -LiteralPath $BackupFile).Path
if ([IO.Path]::GetExtension($backup) -ne ".bak") {
  throw "Selectati un fisier backup MSSQL cu extensia .bak."
}

$runtimeEnv = Join-Path $AppDir "runtime\mssql.env"
if (-not (Test-Path -LiteralPath $runtimeEnv)) {
  throw "Lipseste configuratia MSSQL: $runtimeEnv"
}
$connectionString = ((Get-Content -LiteralPath $runtimeEnv) |
  Where-Object { $_ -like "INFRAFLOW_DB_CONNECTION=*" } |
  Select-Object -First 1) -replace "^INFRAFLOW_DB_CONNECTION=", ""
if (-not $connectionString) { throw "Lipseste INFRAFLOW_DB_CONNECTION din $runtimeEnv" }
$masterConnection = [regex]::Replace($connectionString, "(?i)(Database|Initial Catalog)=[^;]+", "Database=master")

$backupScript = Join-Path $AppDir "scripts\windows\backup-mssql.ps1"
if (-not (Test-Path -LiteralPath $backupScript)) { throw "Lipseste scriptul $backupScript" }
Write-Host "Creez backup de siguranta inainte de restaurare..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript -Database $Database
if ($LASTEXITCODE -ne 0) { throw "Backup-ul de siguranta nu a putut fi creat." }

$escapedDatabase = $Database.Replace("]", "]]").Replace("'", "''")
$escapedBackup = $backup.Replace("'", "''")
$sql = @"
USE [master];
ALTER DATABASE [$escapedDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
BEGIN TRY
  RESTORE DATABASE [$escapedDatabase] FROM DISK = N'$escapedBackup' WITH REPLACE, RECOVERY;
  ALTER DATABASE [$escapedDatabase] SET MULTI_USER;
END TRY
BEGIN CATCH
  IF DB_ID(N'$escapedDatabase') IS NOT NULL
    ALTER DATABASE [$escapedDatabase] SET MULTI_USER;
  RAISERROR(N'Restaurarea bazei INFRAFLOW a esuat.', 16, 1);
END CATCH;
"@

$task = Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*InfraFlow*server*app.js*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Add-Type -AssemblyName System.Data
$connection = New-Object System.Data.SqlClient.SqlConnection($masterConnection)
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 600
  $command.CommandText = $sql
  [void]$command.ExecuteNonQuery()
  Write-Host "Restore MSSQL finalizat din: $backup" -ForegroundColor Green
} finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
}

if ($task) {
  Start-ScheduledTask -TaskName "InfraFlow ERP"
  Start-Sleep -Seconds 8
  try {
    Invoke-RestMethod "http://localhost:4180/api/system/health" -TimeoutSec 10 | ConvertTo-Json -Depth 5
  } catch {
    Write-Host "Restore finalizat, dar serverul nu raspunde inca. Verificati logs\infraflow.err.log." -ForegroundColor Yellow
  }
}
