param(
  [string]$InstallRoot = "C:\Program Files (x86)\InfraFlow",
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ruleaza acest script cu Run as Administrator."
  }
}

function Import-StartServerEnv {
  param([string]$Root)
  $batPath = Join-Path $Root "start-server.bat"
  if (-not (Test-Path -LiteralPath $batPath)) {
    throw "Lipseste start-server.bat in $Root."
  }
  $bat = Get-Content -LiteralPath $batPath -Raw
  [regex]::Matches($bat, 'set\s+"?([^="\r\n]+)=(.*?)"?\s*(?:\r?\n|$)') | ForEach-Object {
    $key = $_.Groups[1].Value.Trim()
    $value = $_.Groups[2].Value.Trim()
    if ($key) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Stop-InfraFlow {
  Stop-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -like "*InfraFlow*server*app.js*" -or
        $_.CommandLine -like "*InfraFlow*server\src\server.js*" -or
        $_.CommandLine -like "*InfraFlow*start-server.bat*"
      )
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        Write-Host "Oprit PID $($_.ProcessId)."
      } catch {
        Write-Warning "Nu am putut opri PID $($_.ProcessId): $($_.Exception.Message)"
      }
    }
}

function Start-InfraFlow {
  $task = Get-ScheduledTask -TaskName "InfraFlow ERP" -ErrorAction SilentlyContinue
  if ($task) {
    Start-ScheduledTask -TaskName "InfraFlow ERP"
    return
  }
  Start-Process -FilePath (Join-Path $InstallRoot "start-server.bat") -WorkingDirectory $InstallRoot -WindowStyle Hidden
}

Assert-Admin
if (-not (Test-Path -LiteralPath $InstallRoot)) {
  throw "Nu gasesc instalarea InfraFlow: $InstallRoot"
}

$node = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }

Import-StartServerEnv -Root $InstallRoot

$backupDir = Join-Path $InstallRoot "backups\clean-reset"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $backupDir "app_state_before_clean_reset_$stamp.json"

Write-Host "Curat dbo.app_state pentru instalare livrabila, fara demo..." -ForegroundColor Cyan
Push-Location $InstallRoot
try {
  & $node -e @"
const fs = require('fs');
const { runMssqlScalar } = require('./server/core/db');
const backupFile = process.argv[1];
const current = runMssqlScalar('select data from dbo.app_state where id=1;');
fs.writeFileSync(backupFile, current || '', 'utf8');
const clean = {
  users: [],
  settings: {
    setupCompleted: false,
    demo_mode: false,
    modules_enabled: []
  },
  audit: [{
    id: 'audit-clean-reset',
    action: 'clean_install_reset',
    details: 'Reset MSSQL app_state pentru instalare curata, fara demo.',
    createdAt: new Date().toISOString(),
    userName: 'Sistem'
  }]
};
runMssqlScalar('if exists (select 1 from dbo.app_state where id=1) update dbo.app_state set data=@json, updated_at=sysdatetime() where id=1 else insert into dbo.app_state(id,data) values(1,@json); select 1;', { jsonInput: JSON.stringify(clean) });
console.log('OK');
"@ $backupFile
} finally {
  Pop-Location
}

if (-not $NoRestart) {
  Write-Host "Repornesc InfraFlow..." -ForegroundColor Cyan
  Stop-InfraFlow
  Start-Sleep -Seconds 2
  Start-InfraFlow
  Start-Sleep -Seconds 8
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:4180/api/system/health" -TimeoutSec 15
    Write-Host "Health OK:" -ForegroundColor Green
    $health | ConvertTo-Json -Compress
  } catch {
    Write-Warning "Serverul nu a raspuns la health: $($_.Exception.Message)"
  }
}

Write-Host "Reset curat finalizat. Backup anterior: $backupFile" -ForegroundColor Green
