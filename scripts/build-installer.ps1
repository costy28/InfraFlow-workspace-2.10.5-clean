#Requires -Version 5.1
param(
  [string]$Version = "",
  [switch]$SkipClientBuild = $false,
  [switch]$SkipElectron = $false
)

$script = Join-Path $PSScriptRoot "windows\build-all.ps1"
& $script -Version $Version -SkipClientBuild:$SkipClientBuild -SkipElectron:$SkipElectron
exit $LASTEXITCODE
