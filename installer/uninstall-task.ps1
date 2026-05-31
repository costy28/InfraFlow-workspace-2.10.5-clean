param([string]$AppDir = "")

if (-not $AppDir) {
    $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $AppDir = Split-Path -Parent $AppDir
}

Stop-ScheduledTask -TaskName 'InfraFlow ERP' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$escapedAppDir = [regex]::Escape($AppDir)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match $escapedAppDir -and $_.CommandLine -match 'server\\app\.js' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Unregister-ScheduledTask -TaskName 'InfraFlow ERP' -Confirm:$false -ErrorAction SilentlyContinue
