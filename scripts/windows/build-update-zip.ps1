#Requires -Version 5.1
param(
  [string]$Version = "",
  [switch]$SkipClientBuild = $false,
  [switch]$SkipReleaseCheck = $false
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
if (-not $Version) { $Version = (Get-Content (Join-Path $Root "version.json") -Raw | ConvertFrom-Json).version }
$Output = Join-Path $Root "installer\output"
$Temp = Join-Path $env:TEMP ("infraflow-update-$Version-" + [guid]::NewGuid().ToString("N"))
$Zip = Join-Path $Output "InfraFlow-update-v$Version.zip"

function Copy-Clean([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  & robocopy (Resolve-Path $Source).Path $Destination /E /XD node_modules .git /XF *.log .env /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copiere esuata: $Source" }
}

function Invoke-ReleaseCheck([string[]]$Arguments) {
  $script = Join-Path $Root "scripts\release-check.js"
  if (-not (Test-Path -LiteralPath $script)) { throw "Lipseste scripts\release-check.js." }
  & npm run release:check -- @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Release check esuat." }
}

try {
  if (-not $SkipReleaseCheck) {
    Write-Host "`n[release-check] Pre-verificare fara ZIP..." -ForegroundColor Cyan
    Invoke-ReleaseCheck @("--no-zip")
  }
  if (-not $SkipClientBuild) {
    Push-Location (Join-Path $Root "client")
    try { npm run build; if ($LASTEXITCODE -ne 0) { throw "Build React esuat." } } finally { Pop-Location }
  }
  if (-not (Test-Path (Join-Path $Root "client\dist\index.html"))) { throw "Lipseste client/dist/index.html." }
  New-Item -ItemType Directory -Force -Path $Temp,$Output | Out-Null
  Copy-Clean (Join-Path $Root "server") (Join-Path $Temp "server")
  Copy-Clean (Join-Path $Root "client\dist") (Join-Path $Temp "client\dist")
  Copy-Clean (Join-Path $Root "db") (Join-Path $Temp "db")
  Copy-Clean (Join-Path $Root "scripts") (Join-Path $Temp "scripts")
  Copy-Clean (Join-Path $Root "updates") (Join-Path $Temp "updates")
  Copy-Item (Join-Path $Root "version.json"),(Join-Path $Root "CHANGELOG.md") $Temp -Force
  $blocked = @(
    "data\app-db.json", "data\app-db.demo.json", "data\demo-seed.json",
    "server\modules\system\demo-routes.js", "scripts\seed-demo.js",
    "scripts\reset-demo-data.js", "scripts\windows\start-demo.ps1",
    "scripts\windows\restore-demo-app-state.ps1", "scripts\windows\reset-demo.ps1"
  )
  foreach ($relative in $blocked) {
    $candidate = Join-Path $Temp $relative
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Recurse -Force }
  }
  $required = @("version.json", "server\app.js", "server\package.json", "client\dist\index.html")
  foreach ($relative in $required) { if (-not (Test-Path (Join-Path $Temp $relative))) { throw "Pachet incomplet: lipseste $relative" } }
  if (Test-Path $Zip) { Remove-Item $Zip -Force }
  Compress-Archive -Path (Join-Path $Temp "*") -DestinationPath $Zip -CompressionLevel Optimal
  if ((Get-Item $Zip).Length -lt 1MB) { throw "Arhiva rezultata este suspect de mica." }
  if (-not $SkipReleaseCheck) {
    Write-Host "`n[release-check] Verificare ZIP generat..." -ForegroundColor Cyan
    Invoke-ReleaseCheck @()
  }
  Get-Item $Zip | Select-Object Name,Length,LastWriteTime
} finally {
  Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
}
