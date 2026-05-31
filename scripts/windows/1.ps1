# ================================================
# InfraFlow v2 - Build Installer
# Salveaza ca: scripts\windows\build-installer.ps1
# Ruleaza cu: powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1
# ================================================

$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectDir
$version = (Get-Content "$ProjectDir\server\package.json" -Raw | ConvertFrom-Json).version

Write-Host "=== InfraFlow v2 - Build Installer ===" -ForegroundColor Cyan
Write-Host "Folder proiect: $ProjectDir"
Write-Host "Versiune: $version"

# Pasul 1: Build React
Write-Host "`n[1/4] Build React (client)..." -ForegroundColor Yellow
Set-Location "$ProjectDir\client"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "EROARE: Build React esuat!" -ForegroundColor Red
    exit 1
}
Set-Location $ProjectDir
Write-Host "      OK - client/dist/ gata" -ForegroundColor Green

# Pasul 1.5: pregateste dependentele server pentru includere in installer
Write-Host "`n[1.5/4] Pregatesc dependentele server..." -ForegroundColor Yellow
Set-Location "$ProjectDir\server"
npm install --omit=dev
if ($LASTEXITCODE -ne 0) {
    Write-Host "EROARE: Instalarea dependentelor server a esuat!" -ForegroundColor Red
    exit 1
}
Set-Location $ProjectDir
if (-not (Test-Path "$ProjectDir\server\node_modules\express")) {
    Write-Host "EROARE: express lipseste din server/node_modules!" -ForegroundColor Red
    exit 1
}
Write-Host "      OK - server/node_modules gata" -ForegroundColor Green

# Pasul 2: Verifica Inno Setup
Write-Host "`n[2/4] Verific Inno Setup..." -ForegroundColor Yellow
$inno = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $inno)) {
    $inno = "C:\Program Files\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $inno)) {
    Write-Host "EROARE: Inno Setup nu e instalat!" -ForegroundColor Red
    Write-Host "Descarca de la: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Start-Process "https://jrsoftware.org/isdl.php"
    exit 1
}
Write-Host "      OK - $inno" -ForegroundColor Green

# Pasul 3: Compileaza installer
Write-Host "`n[3/4] Compilez installer..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$ProjectDir\installer\output" -Force | Out-Null
& $inno "$ProjectDir\installer\infraflow-setup.iss"
if ($LASTEXITCODE -ne 0) {
    Write-Host "EROARE: Compilare installer esuata!" -ForegroundColor Red
    exit 1
}
Write-Host "      OK" -ForegroundColor Green

# Pasul 4: Rezultat
Write-Host "`n[4/4] Gata!" -ForegroundColor Yellow
$exePath = "$ProjectDir\installer\output\InfraFlow-Setup-v2.exe"
if (Test-Path $exePath) {
    $size = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    
    # Creeaza version.json pentru pachetul de update
    $versionData = @{
      version = $version
      date = (Get-Date -Format "yyyy-MM-dd")
      changelog = (Get-Content "$ProjectDir\CHANGELOG.md" -Raw -Encoding UTF8)
    } | ConvertTo-Json -Depth 3
    $versionData | Set-Content "$ProjectDir\version.json" -Encoding UTF8

    # Creeaza zip de update (fara node_modules si date)
    $zipUpdate = "$ProjectDir\installer\output\InfraFlow-update-v$version.zip"
    if (Test-Path $zipUpdate) { Remove-Item $zipUpdate }

    # Copiaza fisierele necesare in temp
    $tmp = "$ProjectDir\installer\tmp-update"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Path $tmp | Out-Null
    New-Item -ItemType Directory -Path "$tmp\server" | Out-Null
    New-Item -ItemType Directory -Path "$tmp\client\dist" | Out-Null
    New-Item -ItemType Directory -Path "$tmp\db\migrations" | Out-Null

    # Copiaza server (fara node_modules, date si .env)
    robocopy "$ProjectDir\server" "$tmp\server" /E /XD node_modules data storage backups logs /XF .env /NFL /NDL /NJH | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Copiere server in update zip esuata cu cod $LASTEXITCODE." }

    # Copiaza client build
    robocopy "$ProjectDir\client\dist" "$tmp\client\dist" /E /NFL /NDL /NJH | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Copiere client/dist in update zip esuata cu cod $LASTEXITCODE." }

    # Copiaza migrari
    robocopy "$ProjectDir\db\migrations" "$tmp\db\migrations" /E /NFL /NDL /NJH | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Copiere migrari in update zip esuata cu cod $LASTEXITCODE." }

    # Copiaza version.json si CHANGELOG
    Copy-Item "$ProjectDir\version.json" "$tmp\"
    Copy-Item "$ProjectDir\CHANGELOG.md" "$tmp\"

    # Creeaza zip
    Compress-Archive -Path "$tmp\*" -DestinationPath $zipUpdate -Force
    Remove-Item $tmp -Recurse -Force

    $zipSize = [math]::Round((Get-Item $zipUpdate).Length / 1MB, 1)
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  INSTALLER CREAT CU SUCCES!" -ForegroundColor Green
    Write-Host "  Fisier: $exePath" -ForegroundColor Green
    Write-Host "  Marime: $size MB" -ForegroundColor Green
    Write-Host "  Update zip: $zipUpdate ($zipSize MB)" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    
    # Deschide folderul
    explorer "$ProjectDir\installer\output"
} else {
    Write-Host "EROARE: Fisierul exe nu a fost creat!" -ForegroundColor Red
}
