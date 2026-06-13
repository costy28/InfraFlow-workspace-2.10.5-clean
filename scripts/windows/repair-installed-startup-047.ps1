param(
  [string]$SourceRoot = "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean",
  [string]$InstallRoot = "C:\Program Files (x86)\InfraFlow"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ruleaza acest script cu Run as Administrator."
  }
}

function Copy-WithBackup {
  param(
    [string]$RelativePath,
    [string]$BackupRoot
  )
  $src = Join-Path $SourceRoot $RelativePath
  $dst = Join-Path $InstallRoot $RelativePath
  if (-not (Test-Path -LiteralPath $src)) {
    throw "Lipseste sursa: $RelativePath"
  }
  if (Test-Path -LiteralPath $dst) {
    $backup = Join-Path $BackupRoot $RelativePath
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    Copy-Item -LiteralPath $dst -Destination $backup -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
}

Assert-Admin

if (-not (Test-Path -LiteralPath $SourceRoot)) { throw "Nu gasesc SourceRoot: $SourceRoot" }
if (-not (Test-Path -LiteralPath $InstallRoot)) { throw "Nu gasesc InstallRoot: $InstallRoot" }

$backupRoot = Join-Path $InstallRoot ("backups\pre-hotfix-047-install-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

Write-Host "Opresc procesele InfraFlow active..." -ForegroundColor Cyan
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*InfraFlow*server*app.js*" -or
      $_.CommandLine -like "*InfraFlow*start-server.bat*"
    )
  } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host "  Oprit PID $($_.ProcessId)"
    } catch {
      Write-Warning "Nu am putut opri PID $($_.ProcessId): $($_.Exception.Message)"
    }
  }

$files = @(
  "server/core/db.js",
  "server/src/config.js",
  "server/modules/fleet/faz-routes.js",
  "server/modules/fleet/asset-routes.js",
  "server/modules/system/demo-routes.js",
  "client/src/pages/FAZUtilaje.jsx",
  "client/src/pages/FisaVehicul.jsx",
  "client/src/pages/MyVehicle.jsx",
  "db/migrations/025_faz_utilaje.sql",
  "db/migrations/026_fisa_vehicul.sql",
  "updates/UPDATE_041.js",
  "updates/UPDATE_045_faz_utilaje.md",
  "updates/UPDATE_046_fisa_vehicul.md",
  "updates/UPDATE_047_hotfix_pornire_dupa_update.md",
  "package.json",
  "package-lock.json",
  "server/package.json",
  "server/package-lock.json",
  "client/package.json",
  "client/package-lock.json",
  "electron/package.json",
  "electron/package-lock.json",
  "version.json"
)

Write-Host "Copiez fisierele update/hotfix..." -ForegroundColor Cyan
foreach ($file in $files) {
  Copy-WithBackup -RelativePath $file -BackupRoot $backupRoot
}

$bat = Join-Path $InstallRoot "start-server.bat"
if (Test-Path -LiteralPath $bat) {
  Copy-Item -LiteralPath $bat -Destination (Join-Path $backupRoot "start-server.bat") -Force
  $batText = Get-Content -LiteralPath $bat -Raw
  if ($batText -notmatch "(?im)^set DB_TRUSTED_CONNECTION=") {
    $batText = $batText -replace "(?im)^set DB_ENCRYPT=.*$", "set DB_ENCRYPT=false`r`nset DB_TRUSTED_CONNECTION=true"
  }
  Set-Content -LiteralPath $bat -Value $batText -Encoding ASCII
}

Write-Host "Verific sintaxa server..." -ForegroundColor Cyan
Push-Location $InstallRoot
try {
  & "C:\Program Files\nodejs\node.exe" --check "server\app.js"
  & "C:\Program Files\nodejs\node.exe" --check "server\modules\fleet\faz-routes.js"
  & "C:\Program Files\nodejs\node.exe" --check "server\modules\fleet\asset-routes.js"
  & "C:\Program Files\nodejs\node.exe" --check "server\core\db.js"
} finally {
  Pop-Location
}

Write-Host "Pornește aplicația..." -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $InstallRoot "start-server.bat") -WorkingDirectory $InstallRoot -WindowStyle Hidden
Start-Sleep -Seconds 8

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/system/health" -TimeoutSec 10
  Write-Host "InfraFlow pornit OK:" -ForegroundColor Green
  $health | ConvertTo-Json -Compress
} catch {
  Write-Warning "Serverul nu a raspuns la health dupa pornire: $($_.Exception.Message)"
  Write-Host "Ultimele erori:" -ForegroundColor Yellow
  Get-Content (Join-Path $InstallRoot "logs\infraflow.err.log") -Tail 40 -ErrorAction SilentlyContinue
}

Write-Host "Backup: $backupRoot" -ForegroundColor Green
