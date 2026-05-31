#Requires -Version 5.1
<#
.SYNOPSIS
  InfraFlow — Build complet: React + Server installer + Client installer + ZIP update

.PARAMETER Version
  Versiunea de build (default: citită din version.json)

.PARAMETER SkipClientBuild
  Skip build-ul React (dacă client/dist/ e deja actualizat)

.PARAMETER SkipElectron
  Skip build-ul Electron (dacă nu ai Node.js/electron-builder instalat)

.EXAMPLE
  .\build-all.ps1
  .\build-all.ps1 -Version "2.10.0" -SkipElectron
#>

param(
  [string]$Version        = "",
  [switch]$SkipClientBuild = $false,
  [switch]$SkipElectron    = $false
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Set-Location $ROOT

# ─────────────────────────────────────────────────
# 0. Detectare versiune
# ─────────────────────────────────────────────────
if (-not $Version) {
  try {
    $versionJson = Get-Content "$ROOT\version.json" -Raw | ConvertFrom-Json
    $Version = $versionJson.version
  } catch {
    $Version = "2.10.1"
  }
}

# ─────────────────────────────────────────────────
# 0b. Injectează versiunea în toate fișierele dependente
# ─────────────────────────────────────────────────
Write-Host "[ 0 ] Sincronizare versiune $Version în toate fișierele..." -ForegroundColor DarkGray

function Set-FileVersion {
  param([string]$FilePath, [string]$Ver)
  if (-not (Test-Path $FilePath)) { return }
  $content = Get-Content $FilePath -Raw
  $updated = $content
  $updated = $updated -replace 'AppVersion=[\d.]+',          "AppVersion=$Ver"
  $updated = $updated -replace 'OutputBaseFilename=InfraFlow-Server-Setup-v[\d.]+',
                                "OutputBaseFilename=InfraFlow-Server-Setup-v$Ver"
  $updated = $updated -replace "(ValueName: ""Version""[^`n]*`n[^`n]*ValueData: "")[\d.]+""",
                                "`${1}$Ver"""
  $updated = $updated -replace 'InfraFlow ERP Server v[\d.]+', "InfraFlow ERP Server v$Ver"
  if ($updated -ne $content) {
    Set-Content $FilePath -Value $updated -NoNewline -Encoding UTF8
    Write-Host "        Versiune injectată în: $(Split-Path $FilePath -Leaf)" -ForegroundColor DarkGray
  }
}

# Injectează în .iss files
Get-ChildItem "$ROOT\installer\*.iss" | ForEach-Object { Set-FileVersion $_.FullName $Version }

# Actualizează server/package.json
$serverPkg = "$ROOT\server\package.json"
if (Test-Path $serverPkg) {
  $pkg = Get-Content $serverPkg -Raw | ConvertFrom-Json
  if ($pkg.version -ne $Version) {
    $pkg.version = $Version
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $serverPkg -Encoding UTF8
    Write-Host "        server/package.json → $Version" -ForegroundColor DarkGray
  }
}

# Actualizează electron/package.json
$electronPkg = "$ROOT\electron\package.json"
if (Test-Path $electronPkg) {
  $pkg = Get-Content $electronPkg -Raw | ConvertFrom-Json
  if ($pkg.version -ne $Version) {
    $pkg.version = $Version
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $electronPkg -Encoding UTF8
    Write-Host "        electron/package.json → $Version" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   InfraFlow ERP — Build v$Version         " -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# ─────────────────────────────────────────────────
# 1. Build React client
# ─────────────────────────────────────────────────
if (-not $SkipClientBuild) {
  Write-Host "[ 1/4 ] Build React client..." -ForegroundColor Yellow
  Push-Location "$ROOT\client"
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build a eșuat (exit code $LASTEXITCODE)" }
    Write-Host "        React build OK ✅" -ForegroundColor Green
  } finally {
    Pop-Location
  }
} else {
  Write-Host "[ 1/4 ] React build SKIPPED (--SkipClientBuild)" -ForegroundColor DarkGray
}

# ─────────────────────────────────────────────────
# 2. Build Server installer (Inno Setup)
# ─────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2/4 ] Build Server installer (Inno Setup)..." -ForegroundColor Yellow

$isccPaths = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
)
$iscc = $isccPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Host "        EROARE: Inno Setup 6 nu a fost găsit!" -ForegroundColor Red
  Write-Host "        Instalați de la: https://jrsoftware.org/isdl.php" -ForegroundColor Red
  Write-Host "        Server installer SKIPPED." -ForegroundColor Yellow
} else {
  $serverIss = "$ROOT\installer\infraflow-server-setup.iss"
  if (-not (Test-Path $serverIss)) {
    Write-Host "        EROARE: $serverIss nu există!" -ForegroundColor Red
  } else {
    & $iscc $serverIss
    if ($LASTEXITCODE -ne 0) {
      Write-Host "        EROARE Inno Setup! (exit code $LASTEXITCODE)" -ForegroundColor Red
    } else {
      Write-Host "        Server installer OK ✅" -ForegroundColor Green
    }
  }
}

# ─────────────────────────────────────────────────
# 3. Build Client installer (Electron Builder)
# ─────────────────────────────────────────────────
Write-Host ""
if (-not $SkipElectron) {
  Write-Host "[ 3/4 ] Build Client Electron..." -ForegroundColor Yellow

  $electronDir = "$ROOT\electron"
  if (-not (Test-Path $electronDir)) {
    Write-Host "        EROARE: Directorul electron/ nu există!" -ForegroundColor Red
  } else {
    Push-Location $electronDir
    try {
      if (-not (Test-Path "node_modules")) {
        Write-Host "        npm install (prima rulare)..." -ForegroundColor DarkGray
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install a eșuat" }
      }

      npm run build
      if ($LASTEXITCODE -ne 0) { throw "electron-builder a eșuat (exit code $LASTEXITCODE)" }
      Write-Host "        Client installer OK ✅" -ForegroundColor Green
    } catch {
      Write-Host "        EROARE Electron build: $_" -ForegroundColor Red
      Write-Host "        Asigurați-vă că aveți Node.js și electron-builder instalat." -ForegroundColor Yellow
    } finally {
      Pop-Location
    }
  }

  # Opțional: compilează și client-setup.iss dacă există dist unpacked
  $electronDist = "$ROOT\electron\dist\win-unpacked"
  if ((Test-Path $electronDist) -and $iscc) {
    $clientIss = "$ROOT\installer\infraflow-client-setup.iss"
    if (Test-Path $clientIss) {
      Write-Host "        Compilez infraflow-client-setup.iss..." -ForegroundColor DarkGray
      & $iscc $clientIss
      if ($LASTEXITCODE -eq 0) {
        Write-Host "        Client Inno Setup installer OK ✅" -ForegroundColor Green
      }
    }
  }
} else {
  Write-Host "[ 3/4 ] Electron build SKIPPED (--SkipElectron)" -ForegroundColor DarkGray
}

# ─────────────────────────────────────────────────
# 4. Creare ZIP update
# ─────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 4/4 ] Creare ZIP update..." -ForegroundColor Yellow

$outputDir = "$ROOT\installer\output"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Force -Path $outputDir | Out-Null }

$zipPath = "$outputDir\InfraFlow-update-v$Version.zip"

try {
  # Creare arhivă temporară
  $tmpDir = "$env:TEMP\infraflow-update-$Version"
  if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

  # Copiază fișierele de update
  $itemsToCopy = @(
    @{ Source = "$ROOT\server";         Dest = "$tmpDir\server";     Recurse = $true  },
    @{ Source = "$ROOT\client\dist";    Dest = "$tmpDir\client\dist"; Recurse = $true  },
    @{ Source = "$ROOT\db";             Dest = "$tmpDir\db";          Recurse = $true  },
    @{ Source = "$ROOT\version.json";   Dest = "$tmpDir\version.json"; Recurse = $false },
    @{ Source = "$ROOT\CHANGELOG.md";   Dest = "$tmpDir\CHANGELOG.md"; Recurse = $false }
  )

  foreach ($item in $itemsToCopy) {
    if (Test-Path $item.Source) {
      if ($item.Recurse) {
        Copy-Item $item.Source $item.Dest -Recurse -Force -Exclude @("node_modules", "*.log", ".env")
      } else {
        $destParent = Split-Path $item.Dest -Parent
        if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Force -Path $destParent | Out-Null }
        Copy-Item $item.Source $item.Dest -Force
      }
    }
  }

  # Comprimă
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path "$tmpDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
  Remove-Item $tmpDir -Recurse -Force

  $sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
  Write-Host "        ZIP update OK ✅ ($sizeMB MB)" -ForegroundColor Green
} catch {
  Write-Host "        EROARE ZIP: $_" -ForegroundColor Red
}

# ─────────────────────────────────────────────────
# Sumar final
# ─────────────────────────────────────────────────
$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   BUILD COMPLET în ${elapsed}s — InfraFlow v$Version" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Listează output-urile generate
$outputs = @(
  @{ Path = "$outputDir\InfraFlow-Server-Setup-v$Version.exe"; Label = "Server installer" },
  @{ Path = "$ROOT\electron\dist\InfraFlow ERP Setup $Version.exe"; Label = "Client installer (electron-builder)" },
  @{ Path = "$outputDir\InfraFlow-Client-Setup-v$Version.exe";  Label = "Client installer (Inno Setup)" },
  @{ Path = "$outputDir\InfraFlow-update-v$Version.zip";        Label = "Update ZIP" }
)

foreach ($out in $outputs) {
  if (Test-Path $out.Path) {
    $sz = [math]::Round((Get-Item $out.Path).Length / 1MB, 1)
    Write-Host "  ✅ $($out.Label): $($out.Path) ($sz MB)" -ForegroundColor Green
  }
}

Write-Host ""
