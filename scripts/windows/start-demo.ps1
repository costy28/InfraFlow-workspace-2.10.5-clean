# Pornire InfraFlow in mod DEMO (JSON, fara SQL Server)
# Ruleaza din radacina proiectului: .\scripts\windows\start-demo.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "=== InfraFlow DEMO ===" -ForegroundColor Cyan
Write-Host "Folder: $projectRoot" -ForegroundColor Gray

$nodePath = Join-Path $projectRoot "runtime\node\bin\node.exe"
if (-not (Test-Path $nodePath)) {
    $nodePath = "node"
}

$envDemo = Join-Path $projectRoot ".env.demo"
$envFile  = Join-Path $projectRoot ".env"
if (Test-Path $envDemo) {
    Copy-Item $envDemo $envFile -Force
    Get-Content $envDemo | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
    $env:INFRAFLOW_DB_PROVIDER = "json"
    Write-Host "Configurat: DB_MODE=json, PORT=$($env:PORT)" -ForegroundColor Green
}

$env:INFRAFLOW_DB_PROVIDER = "json"
$env:INFRAFLOW_DB_FILE = "app-db.demo.json"
$env:INFRAFLOW_DEMO_DB_FILE = "app-db.demo.json"

$dbFile = Join-Path $projectRoot "data\app-db.demo.json"
$seedScript = Join-Path $projectRoot "scripts\seed-demo.js"
$needSeed = $false
if (-not (Test-Path $dbFile)) {
    $needSeed = $true
} else {
    try {
        $dbContent = Get-Content $dbFile -Raw | ConvertFrom-Json
        if (-not $dbContent.users -or $dbContent.users.Count -eq 0 -or $dbContent._demo_mode -ne $true) {
            $needSeed = $true
        }
    } catch {
        $needSeed = $true
    }
}

if ($needSeed) {
    Write-Host "Generare date demo..." -ForegroundColor Yellow
    & $nodePath $seedScript
    Write-Host "Date demo generate." -ForegroundColor Green
}

Write-Host ""
Write-Host "Pornire server pe http://localhost:$($env:PORT) ..." -ForegroundColor Cyan
Write-Host "Apasa Ctrl+C pentru a opri." -ForegroundColor Gray
Write-Host ""
Set-Location $projectRoot
& $nodePath server/src/server.js
