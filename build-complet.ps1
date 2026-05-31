# ================================================
# InfraFlow — Build Complet
# Rulează ca Administrator din folderul repo
# Versiunea se citește automat din version.json
# ================================================

param(
    [string]$Repo = "E:\CODEX 1\Bitum app\InfraFlow-proiect\InfraFlow Git"
)

$ErrorActionPreference = "Stop"
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

# Citire versiune din version.json (sursă unică)
$Version = "2.10.1"
try {
  $vj = Get-Content "$Repo\version.json" -Raw | ConvertFrom-Json
  $Version = $vj.version
} catch { Write-Host "⚠️  Nu am putut citi version.json, folosesc $Version" -ForegroundColor Yellow }

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " InfraFlow Build Complet v$Version" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificări preliminare ──────────────────────
Write-Host "[0/5] Verificări..." -ForegroundColor Yellow

if (!(Test-Path $Repo)) {
    Write-Host "❌ Folderul repo nu există: $Repo" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $iscc)) {
    Write-Host "❌ Inno Setup 6 nu e instalat!" -ForegroundColor Red
    exit 1
}

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js nu e instalat!" -ForegroundColor Red
    exit 1
}

if (!(Test-Path "$Repo\installer\node-v20-x64.msi")) {
    Write-Host "⚠️  node-v20-x64.msi lipsește din installer/" -ForegroundColor Yellow
    Write-Host "   Descarcă de la: https://nodejs.org/dist/v20.19.2/node-v20.19.2-x64.msi" -ForegroundColor Yellow
    Write-Host "   Salvează ca: $Repo\installer\node-v20-x64.msi" -ForegroundColor Yellow
    $r = Read-Host "Continui fără Node.js embedded? (y/n)"
    if ($r -ne 'y') { exit 1 }
}

Write-Host "✅ Verificări OK" -ForegroundColor Green

# ── Pasul 1: Build React ────────────────────────
Write-Host ""
Write-Host "[1/5] Build React (client)..." -ForegroundColor Yellow

Set-Location "$Repo\client"

# Verifică dacă e nevoie de npm install
if (!(Test-Path "node_modules")) {
    Write-Host "  npm install (prima rulare)..." -ForegroundColor Gray
    npm install --silent
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build React eșuat!" -ForegroundColor Red
    exit 1
}

# Verifică că dist există
if (!(Test-Path "dist\index.html")) {
    Write-Host "❌ dist\index.html nu există după build!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ React build OK" -ForegroundColor Green

# ── Pasul 2: Creare setup-task.ps1 ─────────────
Write-Host ""
Write-Host "[2/5] Creare script Task Scheduler..." -ForegroundColor Yellow

$setupTaskContent = @'
# setup-task.ps1 — Configureaza pornire automata InfraFlow
# Apelat din installer Inno Setup

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Detecteaza node.exe
$node = $null
$nodePaths = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
)
foreach ($p in $nodePaths) {
    if (Test-Path $p) { $node = $p; break }
}
if (-not $node) {
    try { $node = (Get-Command node -ErrorAction Stop).Source } catch {}
}
if (-not $node) { $node = "node.exe" }

Write-Host "Node.js: $node"
Write-Host "AppDir: $AppDir"

# Creeaza start-server.bat
$bat = @(
    '@echo off',
    'set PORT=4180',
    'set INFRAFLOW_PORT=4180',
    'set DB_MODE=json',
    'set NODE_ENV=production',
    'set APP_KEY=infraflow-cheie-secreta-32char01',
    "cd /d `"$AppDir`"",
    "`"$node`" `"$AppDir\server\app.js`""
)
$batPath = "$AppDir\start-server.bat"
Set-Content -Path $batPath -Value ($bat -join "`r`n") -Encoding ASCII
Write-Host "BAT creat: $batPath"

# Creeaza .env daca nu exista
$envPath = "$AppDir\.env"
if (-not (Test-Path $envPath)) {
    $env = @(
        'PORT=4180',
        'INFRAFLOW_PORT=4180',
        'DB_MODE=json',
        'NODE_ENV=production',
        'APP_KEY=infraflow-cheie-secreta-32char01'
    )
    Set-Content -Path $envPath -Value ($env -join "`n") -Encoding UTF8
    Write-Host ".env creat"
}

# Inregistreaza Task Scheduler
try {
    $action = New-ScheduledTaskAction `
        -Execute 'cmd.exe' `
        -Argument "/c `"$batPath`""
    
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit 0 `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable
    
    $principal = New-ScheduledTaskPrincipal `
        -UserId 'SYSTEM' `
        -LogonType ServiceAccount `
        -RunLevel Highest
    
    Register-ScheduledTask `
        -TaskName 'InfraFlow ERP' `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'InfraFlow ERP Server (Node.js)' `
        -Force | Out-Null
    
    Write-Host "Task Scheduler inregistrat!"
    
    # Porneste imediat
    Start-ScheduledTask -TaskName 'InfraFlow ERP'
    Start-Sleep -Seconds 5
    Write-Host "InfraFlow pornit!"
    
} catch {
    Write-Host "Eroare Task Scheduler: $_"
    # Fallback: pornire directa
    Start-Process -FilePath $batPath -WindowStyle Hidden
}
'@

$setupTaskContent | Out-File "$Repo\installer\setup-task.ps1" -Encoding UTF8 -NoNewline
Write-Host "✅ setup-task.ps1 creat" -ForegroundColor Green

# ── Pasul 3: Actualizare infraflow-server-setup.iss ──
Write-Host ""
Write-Host "[3/5] Actualizare installer script..." -ForegroundColor Yellow

$issPath = "$Repo\installer\infraflow-server-setup.iss"
$iss = Get-Content $issPath -Raw

# Injectează versiunea curentă în .iss (înlocuiește orice versiune anterioară)
$iss = $iss -replace 'AppVersion=[\d.]+',                             "AppVersion=$Version"
$iss = $iss -replace 'OutputBaseFilename=InfraFlow-Server-Setup-v[\d.]+',
                     "OutputBaseFilename=InfraFlow-Server-Setup-v$Version"
$iss = $iss -replace '(ValueName: "Version"[^\n]*\n[^\n]*ValueData: ")[\d.]+"',
                     "`${1}$Version`""
$iss = $iss -replace 'InfraFlow ERP Server v[\d.]+',                  "InfraFlow ERP Server v$Version"
Write-Host "  Versiune $Version injectată în .iss"

# Actualizează și server/package.json + electron/package.json
foreach ($pkgPath in @("$Repo\server\package.json", "$Repo\electron\package.json")) {
  if (Test-Path $pkgPath) {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    if ($pkg.version -ne $Version) {
      $pkg.version = $Version
      $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
      Write-Host "  $(Split-Path $pkgPath -Leaf) → $Version"
    }
  }
}

# Adaugă setup-task.ps1 în [Files] dacă nu există
if ($iss -notmatch "setup-task\.ps1") {
    $iss = $iss -replace "(Source: ""setup-db\.ps1"";.*?ignoreversion)", `
        "`$1`nSource: ""setup-task.ps1""; DestDir: ""{app}\scripts""; Flags: ignoreversion"
    Write-Host "  setup-task.ps1 adăugat în [Files]"
}

# Înlocuiește secțiunea [Run] cu una curată fără PowerShell complex inline
$newRun = @'
[Run]
; 1. Instaleaza Node.js daca lipseste
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -Command ""if (!(Get-Command node -EA SilentlyContinue)) { Start-Process msiexec -Wait -ArgumentList '/i', '{tmp}\node-v20-x64.msi', '/quiet', '/norestart' }"""; \
  StatusMsg: "Verific Node.js..."; \
  Flags: runhidden waituntilterminated

; 2. npm install dependente server
Filename: "cmd.exe"; \
  Parameters: "/c cd /d ""{app}\server"" && npm install --omit=dev --prefer-offline"; \
  StatusMsg: "Instalez dependentele server..."; \
  Flags: runhidden waituntilterminated

; 3. Configurare Task Scheduler (pornire automata)
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\setup-task.ps1"""; \
  StatusMsg: "Configurez pornire automata..."; \
  Flags: runhidden waituntilterminated

; 4. Deschide browser la final
Filename: "http://localhost:4180"; \
  Description: "Deschide InfraFlow in browser"; \
  Flags: nowait postinstall shellexec skipifsilent

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -Command ""Unregister-ScheduledTask -TaskName 'InfraFlow ERP' -Confirm:$false 2>$null"""; \
  Flags: runhidden waituntilterminated
'@

# Înlocuiește secțiunea [Run] existentă
$iss = $iss -replace '(?s)\[Run\].*?(\[UninstallRun\].*?\n\n|\Z)', $newRun + "`n`n"

$iss | Out-File $issPath -Encoding UTF8 -NoNewline
Write-Host "✅ installer script actualizat" -ForegroundColor Green

# ── Pasul 4: Build Server Installer ─────────────
Write-Host ""
Write-Host "[4/5] Build Server Installer (Inno Setup)..." -ForegroundColor Yellow

Set-Location "$Repo\installer"
& $iscc "infraflow-server-setup.iss"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build Inno Setup eșuat!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Server installer OK" -ForegroundColor Green

# ── Pasul 5: Build Client Electron ──────────────
Write-Host ""
Write-Host "[5/5] Build Client Electron..." -ForegroundColor Yellow

Set-Location "$Repo\electron"

if (!(Test-Path "node_modules")) {
    Write-Host "  npm install (prima rulare)..." -ForegroundColor Gray
    npm install --silent
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build Electron eșuat!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Client installer OK" -ForegroundColor Green

# ── Rezultate ────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " BUILD COMPLET! " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

$serverExe = Get-ChildItem "$Repo\installer\output\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$clientExe = Get-ChildItem "$Repo\electron\dist\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($serverExe) {
    $mb = [math]::Round($serverExe.Length/1MB, 1)
    Write-Host "✅ Server: $($serverExe.Name) ($mb MB)" -ForegroundColor Green
}
if ($clientExe) {
    $mb = [math]::Round($clientExe.Length/1MB, 1)
    Write-Host "✅ Client: $($clientExe.Name) ($mb MB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Copiaza ambele fisiere si testeaza instalarea!" -ForegroundColor Cyan
Write-Host ""
