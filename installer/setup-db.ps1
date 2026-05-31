#Requires -Version 5.1
<#
.SYNOPSIS
  InfraFlow — Configurare automată bază de date și fișier .env

.DESCRIPTION
  Detectează SQL Server disponibil pe mașina locală.
  Dacă există → configurează mssql mode + creează DB + rulează migrările.
  Dacă nu există → configurează json mode (app-db.json).
  Generează APP_KEY aleatoriu.

.PARAMETER AppDir
  Directorul de instalare InfraFlow (default: directorul părinte al scriptului)

.PARAMETER Port
  Portul pe care ascultă InfraFlow (default: 4180)

.EXAMPLE
  .\setup-db.ps1 -AppDir "C:\Program Files\InfraFlow" -Port 4180
#>

param(
  [string]$AppDir = (Split-Path -Parent $PSScriptRoot),
  [string]$Port   = "4180"
)

$ErrorActionPreference = "Continue"
$envFile = Join-Path $AppDir ".env"

Write-Host ""
Write-Host "=== InfraFlow — Configurare initiala ===" -ForegroundColor Cyan
Write-Host "Director: $AppDir"
Write-Host ""

# ─────────────────────────────────────────────────
# 1. Verifică dacă .env există deja
# ─────────────────────────────────────────────────
if (Test-Path $envFile) {
  Write-Host ".env exista deja — nu suprascriu." -ForegroundColor Yellow
  Write-Host "Stergeti $envFile manual daca doriti reconfigurare."
  exit 0
}

# ─────────────────────────────────────────────────
# 2. Detectează SQL Server instalat
# ─────────────────────────────────────────────────
$sqlInstances  = @()
$detectedServer = ""
$dbMode        = "json"
$dbConnection  = ""

try {
  $regPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server'
  if (Test-Path $regPath) {
    $installedInstances = (Get-ItemProperty $regPath -ErrorAction Stop).InstalledInstances
    if ($installedInstances) {
      $sqlInstances = @($installedInstances)
    }
  }
} catch {
  # SQL Server neconfigurat / key inexistent
}

if ($sqlInstances.Count -gt 0) {
  # Preferă INFRAFLOW > SQLEXPRESS > MSSQLSERVER > primul disponibil
  $preferred = @("INFRAFLOW", "SQLEXPRESS", "MSSQLSERVER")
  $chosenInstance = $null
  foreach ($p in $preferred) {
    if ($sqlInstances -contains $p) { $chosenInstance = $p; break }
  }
  if (-not $chosenInstance) { $chosenInstance = $sqlInstances[0] }

  $serverName = if ($chosenInstance -eq "MSSQLSERVER") { "." } else { ".\$chosenInstance" }
  $dbMode     = "mssql"
  $dbConnection = "Server=$serverName;Database=InfraFlow;Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=15"
  $detectedServer = $serverName

  Write-Host "SQL Server detectat: $serverName (instanta: $chosenInstance)" -ForegroundColor Green
  Write-Host "Mod: mssql"
} else {
  Write-Host "SQL Server negasit — se foloseste mod JSON." -ForegroundColor Yellow
  Write-Host "Mod: json (data\app-db.json)"
}

# ─────────────────────────────────────────────────
# 3. Generează APP_KEY aleatoriu (32 caractere)
# ─────────────────────────────────────────────────
$chars  = (65..90) + (97..122) + (48..57)  # A-Z, a-z, 0-9
$appKey = -join ($chars | Get-Random -Count 32 | ForEach-Object { [char]$_ })

# ─────────────────────────────────────────────────
# 4. Scrie fișierul .env
# ─────────────────────────────────────────────────
$envContent = @"
# InfraFlow ERP — Configuratie server
# Generat automat la instalare: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# Modifica cu grija — server-ul trebuie repornit dupa orice modificare.

PORT=$Port
INFRAFLOW_PORT=$Port
NODE_ENV=production

# ──────────────────────────────────────
# BAZA DE DATE
# ──────────────────────────────────────
# json   = fisier local data/app-db.json (simplu, fara SQL Server)
# mssql  = SQL Server Express/Standard/Developer
DB_MODE=$dbMode

# Folosit doar daca DB_MODE=mssql
INFRAFLOW_DB_PROVIDER=mssql
INFRAFLOW_DB_CONNECTION=$dbConnection

# ──────────────────────────────────────
# SECURITATE
# ──────────────────────────────────────
# Cheie secreta pentru criptare sesiuni si setari sensibile.
# IMPORTANT: Nu o schimba dupa prima pornire (pierd sesiunile active)!
APP_KEY=$appKey

# ──────────────────────────────────────
# EMAIL (optional — pentru notificari)
# ──────────────────────────────────────
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=noreply@firma.ro
# SMTP_PASS=parola_aplicatie
# SMTP_FROM=InfraFlow ERP <noreply@firma.ro>

# ──────────────────────────────────────
# AI ASSISTANT (optional)
# ──────────────────────────────────────
# ANTHROPIC_API_KEY=sk-ant-...

# ──────────────────────────────────────
# GPS (optional)
# ──────────────────────────────────────
# GPS_PROVIDER=teltonika
# GPS_API_URL=http://gps.firma.ro/api
# GPS_API_KEY=...
"@

try {
  Set-Content -Path $envFile -Value $envContent -Encoding UTF8
  Write-Host ".env creat cu succes: $envFile" -ForegroundColor Green
} catch {
  Write-Host "EROARE la crearea .env: $_" -ForegroundColor Red
  exit 1
}

# ─────────────────────────────────────────────────
# 5. Creare DB SQL Server + rulare migrări (dacă mssql)
# ─────────────────────────────────────────────────
if ($dbMode -eq "mssql" -and $detectedServer) {

  Write-Host ""
  Write-Host "Configurez SQL Server ($detectedServer)..." -ForegroundColor Cyan

  # Verifică dacă sqlcmd e disponibil
  $sqlcmdPath = (Get-Command sqlcmd -ErrorAction SilentlyContinue)?.Source
  if (-not $sqlcmdPath) {
    # Caută în locații standard
    $sqlcmdCandidates = @(
      "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\120\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\130\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\140\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\150\Tools\Binn\sqlcmd.exe",
      "C:\Program Files\Microsoft SQL Server\160\Tools\Binn\sqlcmd.exe"
    )
    foreach ($c in $sqlcmdCandidates) {
      if (Test-Path $c) { $sqlcmdPath = $c; break }
    }
  }

  if (-not $sqlcmdPath) {
    Write-Host "sqlcmd nu a fost gasit. DB-ul va fi creat la prima pornire InfraFlow." -ForegroundColor Yellow
    Write-Host "Daca doriti migrari manuale, rulati scripts\windows\install-service.ps1" -ForegroundColor Yellow
  } else {
    # Creare baza de date
    $createDbSql = @"
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'InfraFlow')
BEGIN
  CREATE DATABASE [InfraFlow] COLLATE Romanian_CI_AS;
  PRINT 'Baza de date InfraFlow creata.';
END
ELSE
BEGIN
  PRINT 'Baza de date InfraFlow exista deja.';
END
"@
    try {
      $tmpSql = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.sql'
      Set-Content -Path $tmpSql -Value $createDbSql -Encoding UTF8
      & $sqlcmdPath -S $detectedServer -i $tmpSql -b 2>&1 | Write-Host
      Remove-Item $tmpSql -ErrorAction SilentlyContinue

      Write-Host "Baza de date configurata." -ForegroundColor Green

      # Rulează migrările
      $migrationsDir = Join-Path $AppDir "db\migrations"
      if (Test-Path $migrationsDir) {
        $migrations = Get-ChildItem $migrationsDir -Filter "*.sql" | Sort-Object Name
        Write-Host "Gasit $($migrations.Count) fisiere migrare."

        foreach ($migration in $migrations) {
          Write-Host "  Migare: $($migration.Name)..." -NoNewline
          try {
            & $sqlcmdPath -S $detectedServer -d InfraFlow -i $migration.FullName -b 2>&1 | Out-Null
            Write-Host " OK" -ForegroundColor Green
          } catch {
            Write-Host " EROARE: $_" -ForegroundColor Red
          }
        }
        Write-Host "Migrari complete!" -ForegroundColor Green
      }

    } catch {
      Write-Host "EROARE SQL Server: $_" -ForegroundColor Red
      Write-Host "Comut la mod JSON ca fallback..." -ForegroundColor Yellow

      # Fallback la JSON mode
      (Get-Content $envFile) `
        -replace 'DB_MODE=mssql', 'DB_MODE=json' |
        Set-Content $envFile -Encoding UTF8
      Write-Host ".env actualizat: DB_MODE=json" -ForegroundColor Yellow
    }
  }
}

# ─────────────────────────────────────────────────
# 6. Creare data/app-db.json dacă nu există
# ─────────────────────────────────────────────────
$dataDir = Join-Path $AppDir "data"
$dbJsonFile = Join-Path $dataDir "app-db.json"

if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

if (-not (Test-Path $dbJsonFile)) {
  # Caută seed în directorul db/
  $seedFile = Join-Path $AppDir "db\seed.json"
  if (-not (Test-Path $seedFile)) {
    $seedFile = Join-Path $AppDir "data\app-db.json.example"
  }

  if (Test-Path $seedFile) {
    Copy-Item $seedFile $dbJsonFile
    Write-Host "app-db.json creat din seed." -ForegroundColor Green
  } else {
    # Creare DB minim funcțional
    $minimalDb = @{
      settings   = @{ company_name = "InfraFlow ERP"; port = [int]$Port; db_mode = $dbMode }
      users      = @()
      roles      = @()
      departments = @()
      messaging  = @{ channels = @(); members = @(); messages = @() }
    } | ConvertTo-Json -Depth 5
    Set-Content $dbJsonFile -Value $minimalDb -Encoding UTF8
    Write-Host "app-db.json creat (minimal)." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "=== Configurare completa! ===" -ForegroundColor Green
Write-Host "Port:    $Port"
Write-Host "DB Mode: $dbMode"
Write-Host ""
