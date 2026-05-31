param(
  [switch]$SkipReact,
  [switch]$SkipServerInstaller,
  [switch]$SkipElectron
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Output = Join-Path $Root "installer\output"
$Version = (Get-Content -Raw -LiteralPath (Join-Path $Root "version.json") | ConvertFrom-Json).version
$IsccCandidates = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
)
$Iscc = $IsccCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

function Invoke-NpmBuild([string]$Directory) {
  Push-Location $Directory
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed in $Directory" }
  } finally {
    Pop-Location
  }
}

Write-Host "InfraFlow build v$Version"
New-Item -ItemType Directory -Force -Path $Output | Out-Null

if (-not $SkipReact) {
  Write-Host "[1/4] React build"
  Invoke-NpmBuild (Join-Path $Root "client")
}

if (-not $SkipServerInstaller) {
  if (-not $Iscc) { throw "Inno Setup 6 was not found." }
  Write-Host "[2/4] Server installer"
  & $Iscc (Join-Path $Root "installer\infraflow-server-setup.iss")
  if ($LASTEXITCODE -ne 0) { throw "Server installer build failed." }
}

if (-not $SkipElectron) {
  Write-Host "[3/4] Electron client installer"
  Invoke-NpmBuild (Join-Path $Root "electron")
}

Write-Host "[4/4] Update ZIP"
$Temp = Join-Path $env:TEMP "infraflow-update-$Version"
$Zip = Join-Path $Output "InfraFlow-update-v$Version.zip"

if (Test-Path -LiteralPath $Temp) {
  $ResolvedTemp = (Resolve-Path -LiteralPath $Temp).Path
  $ResolvedBase = (Resolve-Path -LiteralPath $env:TEMP).Path
  if (-not $ResolvedTemp.StartsWith($ResolvedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe temp path: $ResolvedTemp"
  }
  Remove-Item -LiteralPath $ResolvedTemp -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $Temp | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Temp "server") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Temp "client\dist") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Temp "db") | Out-Null

robocopy (Join-Path $Root "server") (Join-Path $Temp "server") /E /XD node_modules /XF .env mssql.env *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Server copy failed: $LASTEXITCODE" }
robocopy (Join-Path $Root "client\dist") (Join-Path $Temp "client\dist") /E | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Client copy failed: $LASTEXITCODE" }
robocopy (Join-Path $Root "db") (Join-Path $Temp "db") /E | Out-Null
if ($LASTEXITCODE -gt 7) { throw "DB copy failed: $LASTEXITCODE" }

Copy-Item -LiteralPath (Join-Path $Root "version.json") -Destination $Temp -Force
Copy-Item -LiteralPath (Join-Path $Root "CHANGELOG.md") -Destination $Temp -Force
Copy-Item -LiteralPath (Join-Path $Root "package.json") -Destination $Temp -Force

if (Test-Path -LiteralPath $Zip) { Remove-Item -LiteralPath $Zip -Force }
Compress-Archive -Path (Join-Path $Temp "*") -DestinationPath $Zip -CompressionLevel Optimal
Remove-Item -LiteralPath $Temp -Recurse -Force

Write-Host ""
Write-Host "Build completed:"
Get-ChildItem -LiteralPath $Output, (Join-Path $Root "electron\dist") -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match [regex]::Escape($Version) } |
  Select-Object FullName, Length

