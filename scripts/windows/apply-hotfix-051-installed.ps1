param(
  [string]$SourceRoot = "E:\CODEX 1\InfraFlow-workspace-2.10.5-clean",
  [string]$InstallRoot = "C:\Program Files (x86)\InfraFlow"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourceRoot)) {
  throw "Nu gasesc SourceRoot: $SourceRoot"
}
if (-not (Test-Path -LiteralPath $InstallRoot)) {
  throw "Nu gasesc InstallRoot: $InstallRoot"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $InstallRoot "backups\pre-hotfix-051-app-state-$stamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$files = @(
  "server\core\db.js",
  "scripts\windows\restore-demo-app-state.ps1",
  "scripts\windows\apply-hotfix-051-installed.ps1",
  "package.json",
  "package-lock.json",
  "server\package.json",
  "server\package-lock.json",
  "client\package.json",
  "client\package-lock.json",
  "electron\package.json",
  "electron\package-lock.json",
  "version.json",
  "updates\UPDATE_051_protectie_app_state_demo.md"
)

foreach ($rel in $files) {
  $source = Join-Path $SourceRoot $rel
  $target = Join-Path $InstallRoot $rel
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Lipseste sursa: $rel"
  }
  if (Test-Path -LiteralPath $target) {
    $backup = Join-Path $backupRoot $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

Push-Location $InstallRoot
try {
  & $node --check "server\core\db.js"
  & $node --check "server\app.js"
} finally {
  Pop-Location
}

Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like "*InfraFlow*server*app.js*" -or
      $_.CommandLine -like "*InfraFlow*start-server.bat*"
    )
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
if ($task) {
  Start-ScheduledTask -TaskName "InfraFlow ERP"
} else {
  Start-Process -FilePath (Join-Path $InstallRoot "start-server.bat") -WorkingDirectory $InstallRoot -WindowStyle Hidden
}

Write-Host "HOTFIX_051_APPLIED backup=$backupRoot"
