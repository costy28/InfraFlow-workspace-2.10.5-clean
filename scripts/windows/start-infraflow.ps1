param([int]$Port = 4180)

$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:PORT = $Port
$env:INFRAFLOW_PORT = $Port
$env:DB_MODE = if ($env:DB_MODE) { $env:DB_MODE } else { "json" }
$env:INFRAFLOW_DB_PROVIDER = if ($env:INFRAFLOW_DB_PROVIDER) { $env:INFRAFLOW_DB_PROVIDER } else { $env:DB_MODE }
$env:APP_KEY = if ($env:APP_KEY) { $env:APP_KEY } else { "infraflow-cheie-secreta-32char01" }
$env:NODE_ENV = "production"

Set-Location $ROOT

Write-Host "InfraFlow pornit pe portul $Port"
node server\app.js
