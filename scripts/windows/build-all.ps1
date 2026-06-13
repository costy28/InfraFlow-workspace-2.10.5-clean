#Requires -Version 5.1
param(
  [string]$Version = "",
  [switch]$SkipClientBuild = $false,
  [switch]$SkipElectron = $false
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ROOT

function Read-BuildVersion {
  if ($Version) { return $Version }
  $versionFile = Join-Path $ROOT "version.json"
  if (Test-Path $versionFile) {
    return (Get-Content $versionFile -Raw | ConvertFrom-Json).version
  }
  return "0.0.0"
}

function Set-JsonVersion {
  param([string]$Path, [string]$BuildVersion)
  if (-not (Test-Path $Path)) { return }
  $json = Get-Content $Path -Raw | ConvertFrom-Json
  if ($json.version -ne $BuildVersion) {
    $json.version = $BuildVersion
    $json | ConvertTo-Json -Depth 20 | Set-Content $Path -Encoding UTF8
  }
}

function Set-IssVersion {
  param([string]$Path, [string]$BuildVersion)
  if (-not (Test-Path $Path)) { return }
  $content = Get-Content $Path -Raw
  $content = $content -replace 'AppVersion=[0-9.]+', "AppVersion=$BuildVersion"
  $content = $content -replace '(OutputBaseFilename=InfraFlow-(?:Server-|Client-)?Setup-v)[0-9.]+', "`${1}$BuildVersion"
  $content = $content -replace '(ValueData: ")[0-9.]+(")', "`${1}$BuildVersion`${2}"
  $content = $content -replace 'InfraFlow ERP Server v[0-9.]+', "InfraFlow ERP Server v$BuildVersion"
  $content = $content -replace 'InfraFlow ERP Client v[0-9.]+', "InfraFlow ERP Client v$BuildVersion"
  $content = $content -replace 'InfraFlow ERP v[0-9.]+', "InfraFlow ERP v$BuildVersion"
  Set-Content $Path -Value $content -Encoding UTF8
}

function Invoke-Step {
  param([string]$Name, [scriptblock]$Body)
  Write-Host ""
  Write-Host $Name -ForegroundColor Yellow
  & $Body
  Write-Host "OK: $Name" -ForegroundColor Green
}

function Find-Iscc {
  $paths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  )
  return ($paths | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Copy-TreeClean {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path $Source)) { return }
  if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Split-Path $Destination) | Out-Null
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $sourcePath = (Resolve-Path $Source).Path
  $robocopyArgs = @(
    $sourcePath,
    $Destination,
    "/E",
    "/XD", "node_modules", ".git",
    "/XF", "*.log", ".env",
    "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
  )
  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed for $Source -> $Destination (exit $LASTEXITCODE)" }
}

function Assert-CleanInstallerRecipe {
  $serverIss = Join-Path $ROOT "installer\infraflow-server-setup.iss"
  $content = Get-Content $serverIss -Raw
  if ($content -match 'Source:\s*"\.\.\\data\\app-db\.json"') {
    throw "Release blocat: installerul server nu are voie sa includa data\app-db.json."
  }
  if ($content -match 'restore-demo-app-state\.ps1') {
    throw "Release blocat: installerul server nu are voie sa includa restore-demo-app-state.ps1."
  }
  if ($content -notmatch 'modules\\system\\demo-routes\.js') {
    throw "Release blocat: installerul server trebuie sa excluda server\\modules\\system\\demo-routes.js."
  }
  if ($content -notmatch 'app-db\.install\.json') {
    throw "Release blocat: installerul server trebuie sa foloseasca data\app-db.install.json pentru instalari curate."
  }
}

function Remove-DemoOnlyFiles {
  param([string]$PackageRoot)
  $relativePaths = @(
    "scripts\seed-demo.js",
    "scripts\generate-demo-hashes.js",
    "scripts\smoke-demo.js",
    "scripts\reset-demo-data.js",
    "scripts\windows\start-demo.ps1",
    "scripts\windows\restore-demo-app-state.ps1",
    "scripts\windows\reset-demo.ps1",
    "scripts\windows\status-demo.ps1",
    "scripts\windows\demo-reset-task.xml",
    "server\modules\system\demo-routes.js"
  )
  foreach ($relativePath in $relativePaths) {
    $fullPath = Join-Path $PackageRoot $relativePath
    if (Test-Path -LiteralPath $fullPath) {
      Remove-Item -LiteralPath $fullPath -Force
    }
  }
}

function Assert-CleanPackageTree {
  param([string]$PackageRoot)
  $blocked = @(
    "data\app-db.json",
    "data\app-db.demo.json",
    "data\demo-seed.json",
    "scripts\seed-demo.js",
    "scripts\generate-demo-hashes.js",
    "scripts\smoke-demo.js",
    "scripts\reset-demo-data.js",
    "scripts\windows\start-demo.ps1",
    "scripts\windows\restore-demo-app-state.ps1",
    "scripts\windows\reset-demo.ps1",
    "scripts\windows\status-demo.ps1",
    "scripts\windows\demo-reset-task.xml",
    "server\modules\system\demo-routes.js"
  )
  foreach ($relativePath in $blocked) {
    $fullPath = Join-Path $PackageRoot $relativePath
    if (Test-Path -LiteralPath $fullPath) {
      throw "Release blocat: pachetul contine fisier demo/runtime interzis: $relativePath"
    }
  }
}

$BuildVersion = Read-BuildVersion
$OutputDir = Join-Path $ROOT "installer\output"
$Start = Get-Date

Write-Host "InfraFlow build $BuildVersion" -ForegroundColor Cyan

Assert-CleanInstallerRecipe

Write-Host "Sync versions..." -ForegroundColor DarkGray
Set-JsonVersion (Join-Path $ROOT "package.json") $BuildVersion
Set-JsonVersion (Join-Path $ROOT "server\package.json") $BuildVersion
Set-JsonVersion (Join-Path $ROOT "client\package.json") $BuildVersion
Set-JsonVersion (Join-Path $ROOT "electron\package.json") $BuildVersion
Get-ChildItem (Join-Path $ROOT "installer") -Filter "*.iss" | ForEach-Object {
  Set-IssVersion $_.FullName $BuildVersion
}

Invoke-Step "[1/6] Server require preflight" {
  $env:INFRAFLOW_DB_PROVIDER = "json"
  $env:DB_MODE = "json"
  $env:INFRAFLOW_DB_FILE = "app-db.build-check.json"
  $buildCheckDb = Join-Path $ROOT "data\app-db.build-check.json"
  Copy-Item (Join-Path $ROOT "data\app-db.install.json") $buildCheckDb -Force
  try {
    node -e "require('./server/app'); console.log('server require ok'); process.exit(0)"
    if ($LASTEXITCODE -ne 0) { throw "Server require preflight failed." }
  } finally {
    Remove-Item $buildCheckDb -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\INFRAFLOW_DB_FILE -ErrorAction SilentlyContinue
  }
}

if (-not $SkipClientBuild) {
  Invoke-Step "[2/6] React build" {
    Push-Location (Join-Path $ROOT "client")
    try {
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "React build failed." }
    } finally {
      Pop-Location
    }
  }
} else {
  Write-Host "[2/6] React build skipped" -ForegroundColor DarkGray
}

$iscc = Find-Iscc
if (-not $iscc) { throw "Inno Setup 6 ISCC.exe not found." }

Invoke-Step "[3/6] Server installer" {
  & $iscc (Join-Path $ROOT "installer\infraflow-server-setup.iss")
  if ($LASTEXITCODE -ne 0) { throw "Server Inno build failed." }
}

if (-not $SkipElectron) {
  Invoke-Step "[4/6] Electron client build" {
    Push-Location (Join-Path $ROOT "electron")
    try {
      if (-not (Test-Path "node_modules")) {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "Electron npm install failed." }
      }
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "Electron builder failed." }
    } finally {
      Pop-Location
    }
  }

  Invoke-Step "[5/6] Client Inno installer" {
    & $iscc (Join-Path $ROOT "installer\infraflow-client-setup.iss")
    if ($LASTEXITCODE -ne 0) { throw "Client Inno build failed." }
  }
} else {
  Write-Host "[4/6] Electron client build skipped" -ForegroundColor DarkGray
  Write-Host "[5/6] Client Inno installer skipped" -ForegroundColor DarkGray
}

Invoke-Step "[6/6] Update ZIP" {
  if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
  $tmpDir = Join-Path $env:TEMP ("infraflow-update-$BuildVersion-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $OutputDir "InfraFlow-update-v$BuildVersion.zip"
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  Copy-TreeClean (Join-Path $ROOT "server") (Join-Path $tmpDir "server")
  Copy-TreeClean (Join-Path $ROOT "client\dist") (Join-Path $tmpDir "client\dist")
  Copy-TreeClean (Join-Path $ROOT "db") (Join-Path $tmpDir "db")
  Copy-TreeClean (Join-Path $ROOT "scripts") (Join-Path $tmpDir "scripts")
  Remove-DemoOnlyFiles $tmpDir
  Copy-TreeClean (Join-Path $ROOT "updates") (Join-Path $tmpDir "updates")
  New-Item -ItemType Directory -Force -Path (Join-Path $tmpDir "installer") | Out-Null
  Copy-Item (Join-Path $ROOT "installer\setup-task.ps1") (Join-Path $tmpDir "installer\setup-task.ps1") -Force
  Copy-Item (Join-Path $ROOT "version.json") (Join-Path $tmpDir "version.json") -Force
  if (Test-Path (Join-Path $ROOT "CHANGELOG.md")) {
    Copy-Item (Join-Path $ROOT "CHANGELOG.md") (Join-Path $tmpDir "CHANGELOG.md") -Force
  }
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Assert-CleanPackageTree $tmpDir
  Compress-Archive -Path (Join-Path $tmpDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
  Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

$expected = @(
  (Join-Path $OutputDir "InfraFlow-Server-Setup-v$BuildVersion.exe"),
  (Join-Path $OutputDir "InfraFlow-Client-Setup-v$BuildVersion.exe")
)
foreach ($path in $expected) {
  if (-not (Test-Path $path)) { throw "Expected output missing: $path" }
}

$elapsed = [math]::Round(((Get-Date) - $Start).TotalSeconds, 0)
Write-Host ""
Write-Host "BUILD COMPLETE in ${elapsed}s - InfraFlow v$BuildVersion" -ForegroundColor Cyan
Get-ChildItem $OutputDir -Filter "*v$BuildVersion*" | Sort-Object Name | Select-Object Name, Length, LastWriteTime

exit 0
