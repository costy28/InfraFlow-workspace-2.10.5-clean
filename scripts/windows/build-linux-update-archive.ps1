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
if ($Version -notmatch '^\d+(\.\d+){2,}$') { throw "Versiune invalidă: $Version" }
$Output = Join-Path $Root "installer\output"
$Temp = Join-Path $env:TEMP ("infraflow-linux-update-$Version-" + [guid]::NewGuid().ToString("N"))
$Archive = Join-Path $Output "InfraFlow-update-v$Version-linux.tar.gz"

function Copy-Clean([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  & robocopy (Resolve-Path $Source).Path $Destination /E /XD node_modules .git /XF *.log .env /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copiere eșuată: $Source" }
}

try {
  if (-not $SkipReleaseCheck) {
    & npm run release:check -- --no-zip
    if ($LASTEXITCODE -ne 0) { throw "Release check eșuat." }
  }
  if (-not $SkipClientBuild) {
    Push-Location (Join-Path $Root "client")
    try { npm run build; if ($LASTEXITCODE -ne 0) { throw "Build React eșuat." } } finally { Pop-Location }
  }
  if (-not (Test-Path (Join-Path $Root "client\dist\index.html"))) { throw "Lipsește client/dist/index.html." }
  New-Item -ItemType Directory -Force -Path $Temp,$Output | Out-Null
  foreach ($directory in @("server", "db", "docs", "scripts", "updates")) { Copy-Clean (Join-Path $Root $directory) (Join-Path $Temp $directory) }
  Copy-Clean (Join-Path $Root "client\dist") (Join-Path $Temp "client\dist")
  Copy-Item (Join-Path $Root "version.json"),(Join-Path $Root "CHANGELOG.md"),(Join-Path $Root "package.json") $Temp -Force
  $blocked = @(
    "data\app-db.json", "data\app-db.demo.json", "data\demo-seed.json",
    "server\modules\system\demo-routes.js", "scripts\seed-demo.js", "scripts\seed-commercial-demo-mssql.js",
    "scripts\reset-demo-data.js", "scripts\windows\start-demo.ps1", "scripts\windows\restore-demo-app-state.ps1",
    "scripts\windows\reset-demo.ps1", "scripts\windows\seed-commercial-demo-mssql.ps1", "scripts\windows\start-commercial-demo-mssql.ps1",
    "docs\DEMO_COMERCIAL_MSSQL.md"
  )
  foreach ($relative in $blocked) {
    $candidate = Join-Path $Temp $relative
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Recurse -Force }
  }
  foreach ($relative in @("version.json", "server\app.js", "server\package.json", "client\dist\index.html")) {
    if (-not (Test-Path (Join-Path $Temp $relative))) { throw "Pachet incomplet: lipsește $relative" }
  }
  if (Test-Path $Archive) { Remove-Item $Archive -Force }
  & tar.exe -czf $Archive -C $Temp .
  if ($LASTEXITCODE -ne 0) { throw "Nu am putut crea arhiva TAR.GZ." }
  if ((Get-Item $Archive).Length -lt 1MB) { throw "Arhiva rezultată este suspect de mică." }
  Get-Item $Archive | Select-Object Name,Length,LastWriteTime
} finally {
  Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
}
