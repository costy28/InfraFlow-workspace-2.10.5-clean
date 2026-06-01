#Requires -Version 5.1
param([string]$Server = ".\SQLEXPRESS")

$ErrorActionPreference = "Stop"
Write-Host "Verific SQL Server Express: $Server"
try {
  $service = Get-Service -Name "MSSQL`$SQLEXPRESS" -ErrorAction Stop
  if ($service.Status -ne "Running") {
    Start-Service -Name "MSSQL`$SQLEXPRESS"
    $service.WaitForStatus("Running", (New-TimeSpan -Seconds 20))
  }
  Write-Host "SQL Server Express disponibil. Serviciu: $($service.Name)" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "SQL Server Express nu este disponibil la $Server." -ForegroundColor Red
  Write-Host "Instalati SQL Server Express si reporniti installerul:" -ForegroundColor Yellow
  Write-Host "https://www.microsoft.com/sql-server/sql-server-downloads" -ForegroundColor Cyan
  exit 1
}
