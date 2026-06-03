#Requires -Version 5.1
param([string]$Server = "")

$ErrorActionPreference = "Stop"
$resolver = Join-Path $PSScriptRoot "resolve-sqlserver.ps1"
if (-not (Test-Path $resolver)) { throw "Lipseste scriptul $resolver" }
. $resolver
try {
  $Server = Get-InfraFlowSqlServerName -PreferredServer $Server
  $serviceName = Get-InfraFlowSqlServiceName -Server $Server
  Write-Host "Verific SQL Server: $Server ($serviceName)"
  $service = Get-Service -Name $serviceName -ErrorAction Stop
  if ($service.Status -ne "Running") {
    Start-Service -Name $serviceName
    $service.WaitForStatus("Running", (New-TimeSpan -Seconds 20))
  }
  Write-Host "SQL Server disponibil. Instanta: $Server; serviciu: $($service.Name)" -ForegroundColor Green
  Write-Output "INFRAFLOW_SQL_SERVER=$Server"
  exit 0
} catch {
  Write-Host "SQL Server nu este disponibil. $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Instalati sau porniti SQL Server si reporniti installerul:" -ForegroundColor Yellow
  Write-Host "https://www.microsoft.com/sql-server/sql-server-downloads" -ForegroundColor Cyan
  exit 1
}
