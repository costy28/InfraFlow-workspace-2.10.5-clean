# ================================================
# InfraFlow v2 - Build Installer + Update ZIP
# Salveaza ca: scripts\windows\build-installer.ps1
# Ruleaza cu:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1
# ================================================

$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectDir

function Assert-ClientDistReady {
    param([string]$DistPath)
    if (-not (Test-Path (Join-Path $DistPath "index.html"))) {
        throw "Release blocat: lipseste client\dist\index.html. Ruleaza build-ul React inainte de ZIP."
    }
    $assetDir = Join-Path $DistPath "assets"
    if (-not (Test-Path $assetDir)) {
        throw "Release blocat: lipseste client\dist\assets. ZIP-ul nu ar actualiza interfata."
    }
    $jsCount = @(Get-ChildItem $assetDir -Filter "*.js" -File -ErrorAction SilentlyContinue).Count
    $cssCount = @(Get-ChildItem $assetDir -Filter "*.css" -File -ErrorAction SilentlyContinue).Count
    if ($jsCount -lt 1 -or $cssCount -lt 1) {
        throw "Release blocat: client\dist\assets nu contine bundle JS/CSS valid."
    }
    $index = Get-Content (Join-Path $DistPath "index.html") -Raw
    if ($index -notmatch '/assets/.*\.js' -or $index -notmatch '/assets/.*\.css') {
        throw "Release blocat: client\dist\index.html nu referentiaza asset-urile build-uite."
    }
}

function Assert-UpdatePackageTree {
    param([string]$PackageRoot)
    $required = @(
        "version.json",
        "server\package.json",
        "server\app.js",
        "client\dist\index.html"
    )
    foreach ($relativePath in $required) {
        if (-not (Test-Path (Join-Path $PackageRoot $relativePath))) {
            throw "Release blocat: pachet update incomplet. Lipseste $relativePath"
        }
    }
    Assert-ClientDistReady (Join-Path $PackageRoot "client\dist")
}

# Citeste versiunea din package.json
$pkg = Get-Content "server\package.json" | ConvertFrom-Json
$version = $pkg.version
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  InfraFlow v$version - Build Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ─── PASUL 1: BUILD REACT ───────────────────────
Write-Host "`n[1/5] Build React (client)..." -ForegroundColor Yellow
Set-Location "$ProjectDir\client"
npm run build --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "  EROARE: Build React esuat!" -ForegroundColor Red
    exit 1
}
Set-Location $ProjectDir
Write-Host "  OK - client/dist/ gata" -ForegroundColor Green
Assert-ClientDistReady "$ProjectDir\client\dist"

# ─── PASUL 2: VERIFICA INNO SETUP ───────────────
Write-Host "`n[2/5] Verific Inno Setup..." -ForegroundColor Yellow
$inno = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $inno)) {
    $inno = "C:\Program Files\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $inno)) {
    Write-Host "  EROARE: Inno Setup nu e instalat!" -ForegroundColor Red
    Write-Host "  Descarca de la: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK - $inno" -ForegroundColor Green

# ─── PASUL 3: COMPILEAZA INSTALLER .EXE ─────────
Write-Host "`n[3/5] Compilez installer .exe..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$ProjectDir\installer\output" -Force | Out-Null
& $inno "$ProjectDir\installer\infraflow-setup.iss"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  EROARE: Compilare installer esuata!" -ForegroundColor Red
    exit 1
}
# Redenumeste exe cu versiunea
$exeSrc = "$ProjectDir\installer\output\InfraFlow-Setup-v2.exe"
$exeDst = "$ProjectDir\installer\output\InfraFlow-Setup-v$version.exe"
if (Test-Path $exeSrc) {
    if ($exeSrc -ne $exeDst) {
        Copy-Item $exeSrc $exeDst -Force
    }
}
Write-Host "  OK - InfraFlow-Setup-v$version.exe" -ForegroundColor Green

# ─── PASUL 4: CREEAZA version.json ──────────────
Write-Host "`n[4/5] Creez version.json + zip update..." -ForegroundColor Yellow

$changelog = ""
if (Test-Path "CHANGELOG.md") {
    $changelog = [string](Get-Content "CHANGELOG.md" -Raw -Encoding UTF8)
}

$versionObj = @{
    version   = $version
    date      = (Get-Date -Format "yyyy-MM-dd")
    changelog = $changelog
}
$versionJson = $versionObj | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText((Join-Path $ProjectDir "version.json"), $versionJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "  version.json creat" -ForegroundColor Green

# ─── PASUL 5: CREEAZA ZIP UPDATE ────────────────
$zipUpdate = "$ProjectDir\installer\output\InfraFlow-update-v$version.zip"
if (Test-Path $zipUpdate) { Remove-Item $zipUpdate -Force }

$tmp = "$ProjectDir\installer\tmp-update"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }

# Creeaza structura temp
New-Item -ItemType Directory -Path "$tmp\server" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmp\client\dist" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmp\db\migrations" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmp\db\seeds" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmp\db\templates" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmp\scripts\windows" -Force | Out-Null

# Copiaza server (fara node_modules, .env, data)
robocopy "$ProjectDir\server" "$tmp\server" /E `
    /XD node_modules `
    /XF .env mssql.env *.log `
    /NFL /NDL /NJH /NJS | Out-Null

# Copiaza client build
robocopy "$ProjectDir\client\dist" "$tmp\client\dist" /E `
    /NFL /NDL /NJH /NJS | Out-Null

# Copiaza migratii
robocopy "$ProjectDir\db\migrations" "$tmp\db\migrations" /E `
    /NFL /NDL /NJH /NJS | Out-Null
robocopy "$ProjectDir\db\seeds" "$tmp\db\seeds" /E `
    /NFL /NDL /NJH /NJS | Out-Null
robocopy "$ProjectDir\db\templates" "$tmp\db\templates" /E `
    /NFL /NDL /NJH /NJS | Out-Null

# Copiaza scripturi runtime necesare la restart
Copy-Item "$ProjectDir\scripts\windows\start-infraflow.ps1" "$tmp\scripts\windows\" -Force
Copy-Item "$ProjectDir\scripts\import-cpv.js" "$tmp\scripts\" -Force

# Copiaza fisiere radacina
Copy-Item "version.json" "$tmp\" -Force
Copy-Item "CHANGELOG.md" "$tmp\" -Force -ErrorAction SilentlyContinue
Copy-Item "package.json" "$tmp\" -Force -ErrorAction SilentlyContinue

# Comprima
Assert-UpdatePackageTree $tmp
Compress-Archive -Path "$tmp\*" -DestinationPath $zipUpdate -Force
if (-not (Test-Path $zipUpdate) -or (Get-Item $zipUpdate).Length -lt 1048576) {
    throw "Release blocat: ZIP-ul rezultat este suspect de mic si probabil nu include client/dist."
}

# Curata temp
Remove-Item $tmp -Recurse -Force

$exeSize = [math]::Round((Get-Item "$ProjectDir\installer\output\InfraFlow-Setup-v$version.exe").Length / 1MB, 1)
$zipSize = [math]::Round((Get-Item $zipUpdate).Length / 1MB, 1)
Write-Host "  OK - InfraFlow-update-v$version.zip ($zipSize MB)" -ForegroundColor Green

# ─── REZULTAT FINAL ─────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLET!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installer: InfraFlow-Setup-v$version.exe ($exeSize MB)"
Write-Host "  Update:    InfraFlow-update-v$version.zip ($zipSize MB)"
Write-Host "  Folder:    $ProjectDir\installer\output\"
Write-Host ""
Write-Host "  Pentru instalare noua: Setup-v$version.exe"
Write-Host "  Pentru update:         update-v$version.zip"
Write-Host "  (upload din InfraFlow -> Setari -> Actualizari)"
Write-Host "================================================" -ForegroundColor Green

# Deschide folderul output
explorer "$ProjectDir\installer\output"
