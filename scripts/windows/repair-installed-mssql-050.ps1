param(
  [string]$SourceRoot,
  [string]$InstallRoot = "C:\Program Files (x86)\InfraFlow"
)

$ErrorActionPreference = "Stop"
$ScriptFilePath = $PSCommandPath

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ruleaza acest script cu Run as Administrator."
  }
}

function Resolve-SourceRoot {
  if (-not [string]::IsNullOrWhiteSpace($SourceRoot)) {
    return (Resolve-Path -LiteralPath $SourceRoot).Path
  }
  $scriptDir = Split-Path -Parent $ScriptFilePath
  $fromOutput = Join-Path $scriptDir "..\.."
  if (Test-Path -LiteralPath (Join-Path $fromOutput "server\core\db.js")) {
    return (Resolve-Path -LiteralPath $fromOutput).Path
  }
  $fromScripts = Join-Path $scriptDir "..\.."
  if (Test-Path -LiteralPath (Join-Path $fromScripts "server\core\db.js")) {
    return (Resolve-Path -LiteralPath $fromScripts).Path
  }
  throw "Nu pot determina SourceRoot. Ruleaza cu -SourceRoot `"E:\CODEX 1\InfraFlow-workspace-2.10.5-clean`"."
}

function Copy-WithBackup {
  param(
    [string]$RelativePath,
    [string]$BackupRoot
  )
  $src = Join-Path $resolvedSourceRoot $RelativePath
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
$resolvedSourceRoot = Resolve-SourceRoot

if (-not (Test-Path -LiteralPath $InstallRoot)) {
  throw "Nu gasesc instalarea InfraFlow: $InstallRoot"
}

$backupRoot = Join-Path $InstallRoot ("backups\pre-hotfix-050-mssql-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

Write-Host "Opresc task-ul si procesele InfraFlow..." -ForegroundColor Cyan
Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*C:\Program Files (x86)\InfraFlow*server*app.js*" -or
      $_.CommandLine -like "*C:\Program Files (x86)\InfraFlow*start-server.bat*"
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
  "server/modules/system/routes.js",
  "server/modules/messaging/routes.js",
  "installer/setup-task.ps1",
  "package.json",
  "server/package.json",
  "client/package.json",
  "electron/package.json",
  "version.json",
  "updates/UPDATE_050_hotfix_mssql_startup_config.md"
)

Write-Host "Copiez hotfix-ul MSSQL 050..." -ForegroundColor Cyan
foreach ($file in $files) {
  Copy-WithBackup -RelativePath $file -BackupRoot $backupRoot
}

Write-Host "Verific sintaxa fisierelor server..." -ForegroundColor Cyan
$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }
Push-Location $InstallRoot
try {
  & $node --check "server\app.js"
  & $node --check "server\core\db.js"
  & $node --check "server\modules\system\routes.js"
  & $node --check "server\modules\messaging\routes.js"
} finally {
  Pop-Location
}

Write-Host "Regenerez pornirea InfraFlow..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "installer\setup-task.ps1")

Start-Sleep -Seconds 10
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/system/health" -TimeoutSec 15
  Write-Host "InfraFlow raspunde la health:" -ForegroundColor Green
  $health | ConvertTo-Json -Compress
} catch {
  Write-Warning "Serverul nu a raspuns la health dupa restart: $($_.Exception.Message)"
  Write-Host "Ultimele erori:" -ForegroundColor Yellow
  Get-Content (Join-Path $InstallRoot "logs\infraflow.err.log") -Tail 60 -ErrorAction SilentlyContinue
}

Write-Host "Backup inainte de hotfix: $backupRoot" -ForegroundColor Green
