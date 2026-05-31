# setup-task.ps1 â€” Configureaza pornire automata InfraFlow
# Apelat din installer Inno Setup

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Detecteaza node.exe
$node = $null
$nodePaths = @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
)
foreach ($p in $nodePaths) {
    if (Test-Path $p) { $node = $p; break }
}
if (-not $node) {
    try { $node = (Get-Command node -ErrorAction Stop).Source } catch {}
}
if (-not $node) { $node = "node.exe" }

Write-Host "Node.js: $node"
Write-Host "AppDir: $AppDir"

# Creeaza start-server.bat
$bat = @(
    '@echo off',
    'set PORT=4180',
    'set INFRAFLOW_PORT=4180',
    'set DB_MODE=json',
    'set NODE_ENV=production',
    'set APP_KEY=infraflow-cheie-secreta-32char01',
    "cd /d `"$AppDir`"",
    "`"$node`" `"$AppDir\server\app.js`""
)
$batPath = "$AppDir\start-server.bat"
Set-Content -Path $batPath -Value ($bat -join "`r`n") -Encoding ASCII
Write-Host "BAT creat: $batPath"

# Creeaza .env daca nu exista
$envPath = "$AppDir\.env"
if (-not (Test-Path $envPath)) {
    $env = @(
        'PORT=4180',
        'INFRAFLOW_PORT=4180',
        'DB_MODE=json',
        'NODE_ENV=production',
        'APP_KEY=infraflow-cheie-secreta-32char01'
    )
    Set-Content -Path $envPath -Value ($env -join "`n") -Encoding UTF8
    Write-Host ".env creat"
}

# Inregistreaza Task Scheduler
try {
    $action = New-ScheduledTaskAction `
        -Execute 'cmd.exe' `
        -Argument "/c `"$batPath`""
    
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit 0 `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable
    
    $principal = New-ScheduledTaskPrincipal `
        -UserId 'SYSTEM' `
        -LogonType ServiceAccount `
        -RunLevel Highest
    
    Register-ScheduledTask `
        -TaskName 'InfraFlow ERP' `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description 'InfraFlow ERP Server (Node.js)' `
        -Force | Out-Null
    
    Write-Host "Task Scheduler inregistrat!"
    
    # Porneste imediat
    Start-ScheduledTask -TaskName 'InfraFlow ERP'
    Start-Sleep -Seconds 5
    Write-Host "InfraFlow pornit!"
    
} catch {
    Write-Host "Eroare Task Scheduler: $_"
    # Fallback: pornire directa
    Start-Process -FilePath $batPath -WindowStyle Hidden
}