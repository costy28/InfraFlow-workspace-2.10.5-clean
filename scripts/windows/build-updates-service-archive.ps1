#Requires -Version 5.1
param([string]$Version = "")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path $PSScriptRoot)
Set-Location $Root
if (-not $Version) { $Version = (Get-Content (Join-Path $Root "version.json") -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+(\.\d+){2,}$') { throw "Versiune invalidă: $Version" }
$Output = Join-Path $Root "installer\output"
$Temp = Join-Path $env:TEMP ("infraflow-updates-service-$Version-" + [guid]::NewGuid().ToString("N"))
$Archive = Join-Path $Output "InfraFlow-updates-service-v$Version.tar.gz"

try {
  New-Item -ItemType Directory -Force -Path $Temp,$Output | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $Temp "app"),(Join-Path $Temp "scripts\linux") | Out-Null
  Copy-Item (Join-Path $Root "update-service\app.js"),(Join-Path $Root "update-service\licenses.example.json") (Join-Path $Temp "app") -Force
  Copy-Item (Join-Path $Root "scripts\linux\infraflow-updates.service"),(Join-Path $Root "scripts\linux\install-updates-service.sh") (Join-Path $Temp "scripts\linux") -Force
  if (Test-Path $Archive) { Remove-Item $Archive -Force }
  & tar.exe -czf $Archive -C $Temp .
  if ($LASTEXITCODE -ne 0) { throw "Nu am putut crea arhiva serviciului central." }
  if ((Get-Item $Archive).Length -lt 1KB) { throw "Arhiva serviciului este suspect de mică." }
  Get-Item $Archive | Select-Object Name,Length,LastWriteTime
} finally {
  Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
}
