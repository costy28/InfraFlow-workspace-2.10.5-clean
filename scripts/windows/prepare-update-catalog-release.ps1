#Requires -Version 5.1
param(
  [string]$Version = "",
  [string]$BaseUrl = "https://updates.infraflow.ro"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path $PSScriptRoot)
Set-Location $Root
if (-not $Version) { $Version = (Get-Content (Join-Path $Root "version.json") -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+(\.\d+){2,}$') { throw "Versiune invalidă: $Version" }
if ($BaseUrl -notmatch '^https://') { throw "BaseUrl trebuie să înceapă cu https://" }

$Output = Join-Path $Root "installer\output"
$WindowsPackage = Join-Path $Output "InfraFlow-update-v$Version.zip"
$LinuxPackage = Join-Path $Output "InfraFlow-update-v$Version-linux.tar.gz"
foreach ($item in @($WindowsPackage, $LinuxPackage)) { if (-not (Test-Path $item)) { throw "Lipsește pachetul: $item" } }

$PayloadPath = Join-Path $Root "release-catalog\stable.payload.json"
$existing = Get-Content $PayloadPath -Raw | ConvertFrom-Json
$releases = @($existing.releases | Where-Object { $_.version -ne $Version })
function Artifact([string]$FilePath) {
  $name = Split-Path -Leaf $FilePath
  return [ordered]@{
    url = "$BaseUrl/packages/$Version/$name"
    sha256 = (Get-FileHash $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    size_bytes = (Get-Item $FilePath).Length
  }
}
$release = [ordered]@{
  version = $Version
  channel = "stable"
  notes = "Release InfraFlow $Version"
  mandatory = [ordered]@{ mode = "none" }
  components = @([ordered]@{
    id = "core"
    type = "core"
    artifacts = [ordered]@{
      "server-windows" = Artifact $WindowsPackage
      "server-linux" = Artifact $LinuxPackage
    }
  })
}
$payload = [ordered]@{
  format = "infraflow-release-catalog-v1"
  generated_at = $null
  releases = @($release) + $releases
}
$payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $PayloadPath -Encoding utf8
Write-Host "Payload catalog pregătit: $PayloadPath" -ForegroundColor Green
