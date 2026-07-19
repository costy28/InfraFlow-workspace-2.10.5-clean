#Requires -Version 5.1
param(
  [string]$AppDir = "C:\Program Files (x86)\InfraFlow",
  [int]$Port = 4180,
  [int]$TimeoutSeconds = 150
)

$ErrorActionPreference = "Stop"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$url = "http://localhost:$Port/api/system/health"
do {
  try {
    $health = Invoke-RestMethod $url -TimeoutSec 5
    if ($health.ok) {
      Write-Host "InfraFlow pornit si verificat: $url" -ForegroundColor Green
      $health | ConvertTo-Json -Depth 5
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 3
  }
} while ((Get-Date) -lt $deadline)

$log = Join-Path $AppDir "logs\infraflow.err.log"
Write-Host "InfraFlow nu raspunde dupa $TimeoutSeconds secunde." -ForegroundColor Red
if (Test-Path -LiteralPath $log) {
  Write-Host "Ultimele mesaje din $log" -ForegroundColor Yellow
  Get-Content -LiteralPath $log -Tail 80
}
exit 1
