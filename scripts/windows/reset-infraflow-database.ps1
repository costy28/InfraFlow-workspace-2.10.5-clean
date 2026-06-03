#Requires -RunAsAdministrator
param(
  [string]$Server = "",
  [string]$Database = "INFRAFLOW",
  [string]$DbUser = "infraflow",
  [string]$Confirm = ""
)

$ErrorActionPreference = "Stop"
if ($Confirm -ne "STERG INFRAFLOW") {
  throw "Operatie oprita. Pentru resetare completa folositi -Confirm 'STERG INFRAFLOW'."
}

$resolver = Join-Path $PSScriptRoot "resolve-sqlserver.ps1"
if (-not (Test-Path -LiteralPath $resolver)) { throw "Lipseste scriptul $resolver" }
. $resolver
$Server = Get-InfraFlowSqlServerName -PreferredServer $Server -Database $Database

Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "InfraFlow ERP" -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*InfraFlow*server*app.js*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$escapedDatabase = $Database.Replace("]", "]]").Replace("'", "''")
$escapedDbUser = $DbUser.Replace("]", "]]").Replace("'", "''")
$sql = @"
USE [master];
IF DB_ID(N'$escapedDatabase') IS NOT NULL
BEGIN
  ALTER DATABASE [$escapedDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [$escapedDatabase];
END;
IF SUSER_ID(N'$escapedDbUser') IS NOT NULL
  DROP LOGIN [$escapedDbUser];
"@

Add-Type -AssemblyName System.Data
$connection = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=master;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30")
try {
  try {
    $connection.Open()
  } catch {
    Write-Host "Contul Windows nu are acces SQL administrativ pe $Server." -ForegroundColor Yellow
    $sqlAdminUser = Read-Host "Utilizator SQL administrator [sa]"
    if ([string]::IsNullOrWhiteSpace($sqlAdminUser)) { $sqlAdminUser = "sa" }
    $sqlAdminSecure = Read-Host "Parola SQL pentru $sqlAdminUser" -AsSecureString
    $sqlAdminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlAdminSecure)
    try {
      $sqlAdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sqlAdminPtr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sqlAdminPtr)
    }
    $connection.ConnectionString = "Server=$Server;Database=master;User Id=$sqlAdminUser;Password=$sqlAdminPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30"
    $connection.Open()
  }
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 120
  $command.CommandText = $sql
  [void]$command.ExecuteNonQuery()
  Write-Host "Resetare completa finalizata pe $Server. Baza $Database si loginul $DbUser au fost sterse." -ForegroundColor Green
  Write-Host "Celelalte baze SQL Server nu au fost modificate." -ForegroundColor Green
} finally {
  if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
}
