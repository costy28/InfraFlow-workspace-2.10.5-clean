$Repo = "E:\CODEX 1\Bitum app\InfraFlow-proiect\InfraFlow Git"
$issPath = "$Repo\installer\infraflow-server-setup.iss"

# Adaugă setup-task.ps1 în [Files] dacă nu există
$iss = Get-Content $issPath -Raw

if ($iss -notmatch "setup-task\.ps1") {
    $iss = $iss.Replace(
        'Source: "setup-db.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion',
        'Source: "setup-db.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion' + "`r`n" +
        'Source: "setup-task.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion'
    )
    Write-Host "setup-task.ps1 adaugat in Files"
}

# Găsește linia [Run] și înlocuiește tot până la [UninstallRun]
$runStart = $iss.IndexOf("[Run]")
$uninstallStart = $iss.IndexOf("[UninstallRun]")

if ($runStart -ge 0 -and $uninstallStart -gt $runStart) {
    $before = $iss.Substring(0, $runStart)
    $after = $iss.Substring($uninstallStart)
    
    $newRun = @"
[Run]
; 1. Instaleaza Node.js daca lipseste
Filename: "powershell.exe"; Parameters: "-NonInteractive -Command ""if (!(Get-Command node -EA SilentlyContinue)) { Start-Process msiexec -Wait -ArgumentList '/i', '{tmp}\node-v20-x64.msi', '/quiet', '/norestart' }"""; StatusMsg: "Verific Node.js..."; Flags: runhidden waituntilterminated

; 2. npm install
Filename: "cmd.exe"; Parameters: "/c cd /d ""{app}\server"" && npm install --omit=dev --prefer-offline"; StatusMsg: "Instalez dependentele server..."; Flags: runhidden waituntilterminated

; 3. Task Scheduler pornire automata
Filename: "powershell.exe"; Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\setup-task.ps1"""; StatusMsg: "Configurez pornire automata..."; Flags: runhidden waituntilterminated

; 4. Deschide browser
Filename: "http://localhost:4180"; Description: "Deschide InfraFlow in browser"; Flags: nowait postinstall shellexec skipifsilent

"@

    $iss = $before + $newRun + $after
    Write-Host "Sectiunea [Run] inlocuita!"
} else {
    Write-Host "Nu am gasit [Run] sau [UninstallRun]!"
}

$iss | Out-File $issPath -Encoding UTF8 -NoNewline
Write-Host "ISS actualizat!"
