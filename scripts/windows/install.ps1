param(
  [string]$InstallPath = "C:\InfraFlow",
  [string]$SqlInstance = ".\SQLEXPRESS",
  [string]$DatabaseName = "InfraFlow",
  [string]$SqlUser = "InfraFlowApp"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Rulează install.ps1 ca Administrator."
  }
}

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $version = (& node -v).TrimStart("v")
    if ([version]$version -ge [version]"20.0.0") { return }
  }
  Write-Step "Instalez Node.js 20 LTS"
  $msi = Join-Path $env:TEMP "node20.msi"
  Invoke-WebRequest "https://nodejs.org/dist/latest-v20.x/node-v20.19.6-x64.msi" -OutFile $msi
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
}

function Assert-Resources {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
  if ($freeRamGb -lt 2) { throw "RAM liber insuficient: $freeRamGb GB. Minim 2GB." }
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($InstallPath).Substring(0,1))
  $freeDiskGb = [math]::Round($drive.Free / 1GB, 2)
  if ($freeDiskGb -lt 5) { throw "Spațiu disk insuficient: $freeDiskGb GB. Minim 5GB." }
}

function Test-SqlServer {
  $services = Get-Service | Where-Object { $_.Name -like "MSSQL*" -and $_.Status -eq "Running" }
  if (-not $services) {
    Write-Warning "SQL Server Express nu pare pornit. Instalează SQL Server Express 2019+ sau pornește serviciul MSSQL."
  }
}

function New-AppKey {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).Substring(0,32)
}

function New-SqlPassword {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace "[^a-zA-Z0-9]", "").Substring(0,24) + "aA1!"
}

function Copy-AppFiles {
  $source = Resolve-Path (Join-Path $PSScriptRoot "..\..")
  $app = Join-Path $InstallPath "app"
  New-Item -ItemType Directory -Force -Path $app | Out-Null
  robocopy $source $app /MIR /XD node_modules client\node_modules .git backups logs storage runtime /XF private-key.pem licenta.iflic | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Copierea fișierelor a eșuat cu cod $LASTEXITCODE." }
}

function Install-Dependencies {
  Push-Location (Join-Path $InstallPath "app\server")
  npm install --production
  Pop-Location
}

function Configure-SqlServer {
  param([string]$Password)
  $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
  if (-not $sqlcmd) {
    Write-Warning "sqlcmd nu este disponibil. Migrarea MSSQL se poate rula manual ulterior."
    return
  }
  $dbDir = Join-Path $InstallPath "app\db"
  $escapedPassword = $Password.Replace("'", "''")
  sqlcmd -S $SqlInstance -E -Q "IF DB_ID(N'$DatabaseName') IS NULL CREATE DATABASE [$DatabaseName];"
  sqlcmd -S $SqlInstance -E -d $DatabaseName -Q @"
IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'$SqlUser')
BEGIN
  CREATE LOGIN [$SqlUser] WITH PASSWORD = N'$escapedPassword', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
END
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$SqlUser')
BEGIN
  CREATE USER [$SqlUser] FOR LOGIN [$SqlUser];
END
ALTER ROLE db_datareader ADD MEMBER [$SqlUser];
ALTER ROLE db_datawriter ADD MEMBER [$SqlUser];
ALTER ROLE db_ddladmin ADD MEMBER [$SqlUser];
"@
  Get-ChildItem (Join-Path $dbDir "migrations") -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    sqlcmd -S $SqlInstance -E -d $DatabaseName -i $_.FullName
  }
}

function Write-EnvFile {
  param([string]$SqlPassword)
  $envFile = Join-Path $InstallPath "app\.env"
  $connectionString = "Server=$SqlInstance;Database=$DatabaseName;User Id=$SqlUser;Password=$SqlPassword;TrustServerCertificate=True;Connection Timeout=15"
  @"
DB_MODE=mssql
PORT=4180
APP_KEY=$(New-AppKey)
MSSQL_CONNECTION_STRING=$connectionString
WEATHER_LAT=46.9259
WEATHER_LNG=26.3709
"@ | Set-Content -Path $envFile -Encoding UTF8
}

function Install-Nssm {
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($nssm) { return $nssm.Source }
  $tools = Join-Path $InstallPath "tools"
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  $zip = Join-Path $env:TEMP "nssm.zip"
  Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $tools -Force
  return (Get-ChildItem $tools -Recurse -Filter nssm.exe | Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1).FullName
}

function Install-Service {
  $nssm = Install-Nssm
  $node = (Get-Command node).Source
  & $nssm stop InfraFlow 2>$null | Out-Null
  & $nssm remove InfraFlow confirm 2>$null | Out-Null
  & $nssm install InfraFlow $node "server\app.js"
  & $nssm set InfraFlow AppDirectory (Join-Path $InstallPath "app")
  & $nssm set InfraFlow DisplayName "InfraFlow ERP"
  & $nssm set InfraFlow Description "InfraFlow ERP - Servicii Publice"
  & $nssm set InfraFlow Start SERVICE_AUTO_START
  & $nssm start InfraFlow
}

function New-DesktopShortcut {
  $shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "InfraFlow ERP.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "http://localhost:4180"
  $icon = Join-Path $InstallPath "app\public\icons\infraflow.ico"
  if (Test-Path $icon) { $shortcut.IconLocation = $icon }
  $shortcut.Save()
}

Assert-Admin
Write-Step "Verific cerințele sistem"
Ensure-Node
Test-SqlServer
Assert-Resources

Write-Step "Creez structura de foldere"
@("app","data","storage","backups","logs") | ForEach-Object {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallPath $_) | Out-Null
}

Write-Step "Copiez fișierele aplicației"
Copy-AppFiles

Write-Step "Instalez dependențele server"
Install-Dependencies

$sqlPassword = New-SqlPassword

Write-Step "Configurez SQL Server"
Configure-SqlServer -Password $sqlPassword

Write-Step "Scriu fișierul .env"
Write-EnvFile -SqlPassword $sqlPassword

Write-Step "Înregistrez Windows Service"
Install-Service

Write-Step "Creez shortcut Desktop"
New-DesktopShortcut

Start-Process "http://localhost:4180"

Write-Host @"
╔════════════════════════════════════════╗
║   InfraFlow instalat cu succes!        ║
║   Accesează: http://localhost:4180     ║
║   User: admin  Parola: infraflow2024   ║
║   Schimbă parola la primul login!      ║
╚════════════════════════════════════════╝
"@ -ForegroundColor Green
