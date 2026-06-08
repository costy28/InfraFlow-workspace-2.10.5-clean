# Status rapid pentru InfraFlow mama (MSSQL) si demo (JSON).
# Rulare: .\scripts\windows\status-demo.ps1

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Get-PortInfo($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) {
        return [pscustomobject]@{ Port = $Port; Listening = $false; Pid = $null; Process = ""; Path = "" }
    }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Port = $Port
        Listening = $true
        Pid = $conn.OwningProcess
        Process = $proc.ProcessName
        Path = $proc.Path
    }
}

function Get-Json($Url) {
    try {
        return Invoke-RestMethod -Uri $Url -TimeoutSec 5
    } catch {
        return [pscustomobject]@{ error = $_.Exception.Message }
    }
}

Write-Host "=== InfraFlow status local ===" -ForegroundColor Cyan
Write-Host "Folder: $projectRoot" -ForegroundColor Gray
Write-Host ""

$mother = Get-PortInfo 4180
$demo = Get-PortInfo 4190

Write-Host "Aplicatia mama MSSQL (4180)" -ForegroundColor Yellow
$mother | Format-List
$motherHealth = Get-Json "http://localhost:4180/api/system/health"
Write-Host "Health 4180:" -ForegroundColor Gray
$motherHealth | ConvertTo-Json -Depth 5
Write-Host ""

Write-Host "Demo JSON (4190)" -ForegroundColor Yellow
$demo | Format-List
$demoStatus = Get-Json "http://localhost:4190/api/demo-status"
$demoHealth = Get-Json "http://localhost:4190/api/system/health"
Write-Host "Demo status:" -ForegroundColor Gray
$demoStatus | ConvertTo-Json -Depth 5
Write-Host "Demo health:" -ForegroundColor Gray
$demoHealth | ConvertTo-Json -Depth 5
Write-Host ""

$cloudflared = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
Write-Host "Cloudflare Tunnel" -ForegroundColor Yellow
if ($cloudflared) {
    $cloudflared | Select-Object Id, ProcessName, StartTime, Path | Format-Table -AutoSize
} else {
    Write-Host "cloudflared nu ruleaza." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Smoke test demo:" -ForegroundColor Yellow
$nodePath = Join-Path $projectRoot "runtime\node\bin\node.exe"
if (-not (Test-Path $nodePath)) { $nodePath = "node" }
& $nodePath (Join-Path $projectRoot "scripts\smoke-demo.js") "http://localhost:4190"
