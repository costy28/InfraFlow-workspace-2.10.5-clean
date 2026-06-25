#Requires -RunAsAdministrator
param(
  [string]$AppDir = "C:\Program Files (x86)\InfraFlow",
  [string]$SourceDir = ""
)

$ErrorActionPreference = "Stop"
$logPath = Join-Path $AppDir "runtime\repair-update-2.12.123.log"
New-Item -ItemType Directory -Path (Split-Path $logPath -Parent) -Force | Out-Null

function Write-RepairLog {
  param([string]$Message)
  "[$(Get-Date -Format o)] $Message" | Tee-Object -FilePath $logPath -Append
}

if (-not $SourceDir) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $candidate = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptPath))
  if (Test-Path (Join-Path $candidate "version.json")) {
    $SourceDir = $candidate
  }
}

Write-RepairLog "Pornesc repair pentru update 2.12.123."
Write-RepairLog "AppDir=$AppDir"
Write-RepairLog "SourceDir=$SourceDir"

if (-not (Test-Path $AppDir)) {
  throw "Folderul aplicatiei nu exista: $AppDir"
}

if ($SourceDir -and (Test-Path $SourceDir)) {
  $copyPairs = @(
    @("version.json", "version.json"),
    @("package.json", "package.json"),
    @("server\package.json", "server\package.json"),
    @("client\package.json", "client\package.json"),
    @("electron\package.json", "electron\package.json"),
    @("server\modules\system\routes.js", "server\modules\system\routes.js"),
    @("server\modules\system\service.js", "server\modules\system\service.js"),
    @("updates\UPDATE_142_hotfix_versiune_dupa_update.md", "updates\UPDATE_142_hotfix_versiune_dupa_update.md"),
    @("updates\UPDATE_143_hotfix_restart_changelog_update.md", "updates\UPDATE_143_hotfix_restart_changelog_update.md")
  )
  foreach ($pair in $copyPairs) {
    $src = Join-Path $SourceDir $pair[0]
    $dst = Join-Path $AppDir $pair[1]
    if (Test-Path $src) {
      New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
      Copy-Item -LiteralPath $src -Destination $dst -Force
      Write-RepairLog "Copiat $($pair[1])"
    }
  }
}

$taskName = "InfraFlow ERP"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Write-RepairLog "Opresc task-ul $taskName."
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

$pids = @()
try {
  $connections = Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue
  $pids += $connections | Select-Object -ExpandProperty OwningProcess
} catch {
  $netstat = netstat -ano | Select-String ":4180"
  foreach ($line in $netstat) {
    $parts = ($line.Line -split "\s+") | Where-Object { $_ }
    if ($parts.Count -ge 5 -and $parts[1] -match ":4180$") { $pids += [int]$parts[-1] }
  }
}
$pids = $pids | Where-Object { $_ -and $_ -ne 0 } | Sort-Object -Unique
foreach ($procId in $pids) {
  Write-RepairLog "Opresc procesul de pe portul 4180: PID $procId"
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3

if ($task) {
  Write-RepairLog "Repornesc task-ul $taskName."
  Start-ScheduledTask -TaskName $taskName
} else {
  $bat = Join-Path $AppDir "start-server.bat"
  if (-not (Test-Path $bat)) { throw "Nu gasesc start-server.bat si nici task-ul $taskName." }
  Write-RepairLog "Pornesc fallback start-server.bat."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$bat`"" -WorkingDirectory $AppDir -WindowStyle Hidden
}

Start-Sleep -Seconds 8
try {
  $version = Invoke-RestMethod -Uri "http://localhost:4180/api/system/version" -TimeoutSec 10
  Write-RepairLog "Versiune raportata dupa restart: $($version.version)"
  Write-Host "InfraFlow raporteaza versiunea $($version.version)." -ForegroundColor Green
} catch {
  Write-RepairLog "Nu am putut verifica endpoint-ul dupa restart: $($_.Exception.Message)"
  throw
}

Write-RepairLog "Repair finalizat."
