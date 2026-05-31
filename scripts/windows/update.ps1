param(
  [string]$InstallPath = "C:\InfraFlow",
  [string]$PackagePath = ""
)

$ErrorActionPreference = "Stop"
$appPath = Join-Path $InstallPath "app"
$backupRoot = Join-Path $InstallPath "backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupRoot "pre-update-$stamp"

Write-Host "Oprește serviciul InfraFlow..." -ForegroundColor Cyan
if (Get-Service InfraFlow -ErrorAction SilentlyContinue) {
  Stop-Service InfraFlow -Force
}

Write-Host "Creez backup automat..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
robocopy $appPath $backupPath /MIR /XD node_modules client\node_modules runtime | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Backup eșuat cu cod $LASTEXITCODE." }

if ($PackagePath) {
  Write-Host "Înlocuiesc fișierele aplicației..." -ForegroundColor Cyan
  $temp = Join-Path $env:TEMP "infraflow-update-$stamp"
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $temp -Force
  $source = Get-ChildItem $temp | Where-Object { $_.PSIsContainer } | Select-Object -First 1
  if (-not $source) { $source = Get-Item $temp }
  robocopy $source.FullName $appPath /MIR /XD node_modules client\node_modules data storage backups logs runtime | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Copiere update eșuată cu cod $LASTEXITCODE." }
}

Write-Host "Instalez dependențele server..." -ForegroundColor Cyan
Push-Location (Join-Path $appPath "server")
npm install --production
Pop-Location

Write-Host "Rulez migrările SQL, dacă sqlcmd este disponibil..." -ForegroundColor Cyan
$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if ($sqlcmd) {
  Get-ChildItem (Join-Path $appPath "db\migrations") -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    sqlcmd -S ".\SQLEXPRESS" -E -d "InfraFlow" -i $_.FullName
  }
}

Write-Host "Import coduri CPV..." -ForegroundColor Cyan
Push-Location $appPath
node scripts\import-cpv.js
Pop-Location

Write-Host "Repornesc serviciul InfraFlow..." -ForegroundColor Cyan
if (Get-Service InfraFlow -ErrorAction SilentlyContinue) {
  Start-Service InfraFlow
} else {
  Start-Process (Join-Path $appPath "scripts\windows\start.bat")
}

Write-Host "Update finalizat. Backup: $backupPath" -ForegroundColor Green
