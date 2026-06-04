#Requires -RunAsAdministrator
param(
  [string]$InstallerPath = "",
  [string]$InstanceName = "SQLEXPRESS"
)

$ErrorActionPreference = "Stop"

function Get-SqlEngineServices {
  @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "MSSQLSERVER" -or $_.Name -like "MSSQL`$*"
  })
}

function Start-ExistingSqlEngines {
  $services = Get-SqlEngineServices
  foreach ($service in $services) {
    if ($service.Status -ne "Running") {
      Write-Host "Pornesc serviciul SQL existent: $($service.Name)" -ForegroundColor Cyan
      Start-Service -Name $service.Name
      (Get-Service -Name $service.Name).WaitForStatus("Running", (New-TimeSpan -Seconds 60))
    }
  }
  return $services.Count
}

$existingCount = Start-ExistingSqlEngines
if ($existingCount -gt 0) {
  Write-Host "SQL Server Engine exista deja pe acest server. Continui configurarea InfraFlow." -ForegroundColor Green
  exit 0
}

Write-Host "Nu a fost gasit niciun SQL Server Engine. Instalez SQL Server Express 2022..." -ForegroundColor Yellow

$downloadUrl = "https://download.microsoft.com/download/3/8/d/38de7036-2433-4207-8eae-06e247e17b25/SQLEXPR_x64_ENU.exe"
$workDir = Join-Path $env:ProgramData "InfraFlow\install-cache"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

if ([string]::IsNullOrWhiteSpace($InstallerPath) -or -not (Test-Path -LiteralPath $InstallerPath)) {
  $InstallerPath = Join-Path $workDir "SQLEXPR_x64_ENU.exe"
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
  Write-Host "Descarc SQL Server Express 2022 de la Microsoft..." -ForegroundColor Cyan
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $InstallerPath -UseBasicParsing
  } catch {
    throw "Nu pot descarca SQL Server Express. Verificati conexiunea la internet sau puneti SQLEXPR_x64_ENU.exe langa installer. Detaliu: $($_.Exception.Message)"
  }
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = @(
  "/Q",
  "/ACTION=Install",
  "/FEATURES=SQLEngine",
  "/INSTANCENAME=$InstanceName",
  "/SQLSVCACCOUNT=`"NT AUTHORITY\NETWORK SERVICE`"",
  "/SQLSYSADMINACCOUNTS=`"$currentUser`" `"BUILTIN\Administrators`"",
  "/TCPENABLED=1",
  "/NPENABLED=1",
  "/UPDATEENABLED=False",
  "/IACCEPTSQLSERVERLICENSETERMS"
)

Write-Host "Rulez instalarea SQL Server Express. Poate dura cateva minute..." -ForegroundColor Cyan
$process = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -Wait -PassThru
if ($process.ExitCode -notin @(0, 3010)) {
  throw "Instalarea SQL Server Express a esuat cu codul $($process.ExitCode). Verificati logurile Microsoft SQL Server Setup Bootstrap."
}

$serviceName = "MSSQL`$$InstanceName"
$service = Get-Service -Name $serviceName -ErrorAction Stop
if ($service.Status -ne "Running") {
  Start-Service -Name $serviceName
  (Get-Service -Name $serviceName).WaitForStatus("Running", (New-TimeSpan -Seconds 90))
}

Write-Host "SQL Server Express instalat si pornit: .\$InstanceName" -ForegroundColor Green
if ($process.ExitCode -eq 3010) {
  Write-Host "SQL Server a cerut restart Windows. InfraFlow va continua, dar recomand restart dupa verificare." -ForegroundColor Yellow
}
